import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DEFAULT_ROOM_HOLD_TTL_MINUTES,
  JOB_NAMES,
  QUEUE_NAMES,
  WHATSAPP_BUTTON_IDS,
  type StandardRoomAvailability,
  type WhatsAppInboundMessage,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';
import { AiService, type BookingIntent } from './ai.service';
import { WhatsAppRendererService } from '../whatsapp/whatsapp-renderer.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CheckoutService } from '../checkout/checkout.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pms: CoreIntegratorService,
    private readonly ai: AiService,
    private readonly renderer: WhatsAppRendererService,
    private readonly whatsapp: WhatsAppService,
    private readonly checkout: CheckoutService,
    @InjectQueue(QUEUE_NAMES.WHATSAPP_INBOUND) private readonly inboundQueue: Queue,
  ) {}

  async enqueueMessage(hotelId: string, message: WhatsAppInboundMessage) {
    await this.inboundQueue.add(JOB_NAMES.PROCESS_MESSAGE, { hotelId, message }, {
      jobId: `wa-${message.message_id}`,
      removeOnComplete: true,
      attempts: 3,
    });
  }

  async processMessage(hotelId: string, message: WhatsAppInboundMessage) {
    const phone = message.from;
    const session = await this.getOrCreateSession(hotelId, phone);
    const text = this.extractText(message);

    if (message.interactive?.list_reply) {
      return this.handleRoomSelection(hotelId, session, message.interactive.list_reply.id);
    }

    if (message.interactive?.button_reply || message.button) {
      const btnId =
        message.interactive?.button_reply?.id ?? message.button?.payload ?? '';
      return this.handleButton(hotelId, session, btnId);
    }

    const intent = await this.ai.extractBookingIntent(text);

    switch (session.state) {
      case 'idle':
      case 'faq':
        if (this.shouldStartBooking(text, intent)) {
          await this.advanceBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        {
          const context = `Estado: ${session.state}. Fechas: ${session.checkIn ?? 'N/A'} - ${session.checkOut ?? 'N/A'}`;
          const reply = await this.ai.generateResponse(hotelId, text, context);
          await this.whatsapp.sendText(hotelId, phone, reply);
        }
        return;

      case 'collecting_dates':
        await this.advanceBookingFlow(hotelId, session.id, phone, text, intent);
        return;

      case 'collecting_guests':
        await this.advanceBookingFlow(hotelId, session.id, phone, text, intent);
        return;

      case 'showing_rooms':
        if (this.wantsNewBooking(text, intent)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        if (this.isGreetingOrReset(text)) {
          await this.resetSession(session.id);
          await this.whatsapp.sendText(
            hotelId,
            phone,
            '¡Hola! 👋 Escribe *reservar* para buscar habitaciones disponibles.',
          );
          return;
        }
        await this.handleTextRoomSelection(hotelId, session, text);
        return;

      case 'room_selected':
        if (this.wantsNewBooking(text, intent) || this.isGreetingOrReset(text)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.whatsapp.sendText(
          hotelId,
          phone,
          'Usa el botón *Reservar* en el mensaje de la habitación, o escribe *reservar* para empezar de nuevo.',
        );
        return;

      case 'collecting_guest_info':
        if (this.wantsNewBooking(text, intent) || this.isGreetingOrReset(text)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.handleGuestInfo(hotelId, session, text);
        return;

      case 'awaiting_payment':
        if (this.wantsNewBooking(text, intent) || this.isGreetingOrReset(text)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        if (text.match(/pagar|pago|link|reintentar/i)) {
          await this.resendPaymentLink(hotelId, session);
        } else {
          await this.whatsapp.sendText(
            hotelId,
            phone,
            'Tu reserva está pendiente de pago. Escribe *pagar* para recibir el botón de pago de nuevo.',
          );
        }
        return;

      default:
        {
          const context = `Estado: ${session.state}`;
          const reply = await this.ai.generateResponse(hotelId, text, context);
          await this.whatsapp.sendText(hotelId, phone, reply);
        }
    }
  }

  private async showAvailableRooms(hotelId: string, sessionId: string, phone: string) {
    const session = await this.prisma.conversationSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const availability = await this.fetchAvailability(hotelId, session);

    if (availability.fallback) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'En este momento no podemos consultar disponibilidad. Si eres el hotel, configura PMS *Inventario local* y agrega habitaciones en el panel.',
      );
      return;
    }

    if (availability.rooms.length === 0) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No hay habitaciones disponibles para esas fechas. ¿Quieres probar con otras fechas?',
      );
      return;
    }

    const listMsg = this.renderer.renderRoomList(
      availability.rooms,
      session.checkIn!,
      session.checkOut!,
    );

    if (listMsg.type === 'list') {
      await this.whatsapp.sendInteractive(hotelId, phone, listMsg);
    } else {
      await this.whatsapp.sendText(hotelId, phone, listMsg.text.body);
    }
  }

  private async handleTextRoomSelection(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
  ) {
    const fullSession = await this.getSession(session.id);
    const availability = await this.fetchAvailability(hotelId, fullSession);
    const normalized = text.trim().toLowerCase();

    const room = availability.rooms.find(
      (r) =>
        r.room_type_id.toLowerCase() === normalized ||
        r.name.toLowerCase() === normalized ||
        r.name.toLowerCase().includes(normalized) ||
        normalized.includes(r.name.toLowerCase()),
    );

    if (!room) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontré esa habitación. Escribe el nombre exacto (ej: *Suite Junior*) o *reservar* para empezar de nuevo.',
      );
      return;
    }

    await this.selectRoom(hotelId, session, room);
  }

  private async handleRoomSelection(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    listId: string,
  ) {
    const roomTypeId = listId.replace('room_', '');
    const fullSession = await this.getSession(session.id);
    const availability = await this.fetchAvailability(hotelId, fullSession);

    const room = availability.rooms.find((r) => r.room_type_id === roomTypeId);
    if (!room) {
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, 'Esa habitación ya no está disponible.');
      return;
    }

    await this.selectRoom(hotelId, session, room);
  }

  private async selectRoom(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    room: StandardRoomAvailability,
  ) {
    await this.updateSession(session.id, {
      state: 'room_selected',
      selectedRoomTypeId: room.room_type_id,
    });

    const detailMsg = this.renderer.renderRoomDetail(room);
    await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, detailMsg);

    const extraPhotos = room.photos_urls.slice(1, 4);
    for (let i = 0; i < extraPhotos.length; i++) {
      await this.whatsapp.sendImage(
        hotelId,
        session.whatsappPhone,
        extraPhotos[i],
        i === 0 ? `📸 Más fotos — ${room.name}` : undefined,
      );
    }
  }

  private async handleButton(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    buttonId: string,
  ) {
    if (buttonId === WHATSAPP_BUTTON_IDS.RESERVE) {
      await this.updateSession(session.id, { state: 'collecting_guest_info' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¡Excelente elección! Para confirmar, comparte:\n• Nombre completo\n• Email\n\n(ej: Juan Pérez, juan@email.com)',
      );
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.BACK_TO_ROOMS) {
      await this.updateSession(session.id, { state: 'showing_rooms' });
      await this.showAvailableRooms(hotelId, session.id, session.whatsappPhone);
    }
  }

  private async handleGuestInfo(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
  ) {
    const fullSession = await this.getSession(session.id);
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    const namePart = text.replace(/[\w.-]+@[\w.-]+\.\w+/, '').replace(/,/g, ' ').trim();
    const nameParts = namePart.split(/\s+/);

    if (!emailMatch || nameParts.length < 1) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Necesito tu nombre completo y email. Ejemplo: María García, maria@email.com',
      );
      return;
    }

    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const email = emailMatch[0];
    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );

    const availability = await this.fetchAvailability(hotelId, fullSession);
    const room = availability.rooms.find(
      (r) => r.room_type_id === fullSession.selectedRoomTypeId,
    );
    const roomName = room?.name ?? 'Habitación';

    const idempotencyKey = `wa-${hotelId}-${session.whatsappPhone}-${fullSession.selectedRoomTypeId}-${fullSession.checkIn}-${fullSession.checkOut}`;

    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existing && ['hold', 'payment_pending', 'confirmed'].includes(existing.status)) {
      if (existing.paymentLink) {
        await this.sendPaymentSummary(hotelId, session.whatsappPhone, existing, holdTtl);
      }
      return;
    }

    const hold = await this.pms.holdRoom(hotelId, {
      room_type_id: fullSession.selectedRoomTypeId!,
      check_in: fullSession.checkIn!,
      check_out: fullSession.checkOut!,
      adults: fullSession.adults ?? 2,
      children: fullSession.children ?? 0,
      hold_ttl_minutes: holdTtl,
      idempotency_key: idempotencyKey,
    });

    const reservation = await this.prisma.reservation.create({
      data: {
        hotelId,
        whatsappSessionId: session.id,
        idempotencyKey,
        status: 'hold',
        roomTypeId: fullSession.selectedRoomTypeId,
        roomName,
        checkIn: fullSession.checkIn,
        checkOut: fullSession.checkOut,
        adults: fullSession.adults,
        children: fullSession.children,
        totalAmount: hold.total_amount,
        currency: hold.currency,
        pmsReservationId: hold.pms_reservation_id,
        holdExpiresAt: new Date(hold.expires_at),
        guestFirstName: firstName,
        guestLastName: lastName,
        guestEmail: email,
        guestPhone: session.whatsappPhone,
      },
    });

    const payment = await this.checkout.createPaymentLink(hotelId, {
      amount: hold.total_amount,
      currency: hold.currency,
      reservation_id: reservation.id,
      hold_id: hold.hold_id,
      expires_at: hold.expires_at,
      guest_email: email,
      guest_name: `${firstName} ${lastName}`,
    });

    const updated = await this.prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'payment_pending',
        paymentLink: payment.payment_url,
        paymentId: payment.payment_id,
      },
    });

    await this.updateSession(session.id, {
      state: 'awaiting_payment',
      reservationId: reservation.id,
    });

    await this.sendPaymentSummary(hotelId, session.whatsappPhone, updated, holdTtl);
  }

  private async resendPaymentLink(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const fullSession = await this.getSession(session.id);
    if (!fullSession.reservationId) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontré una reserva pendiente. Escribe *reservar* para empezar de nuevo.',
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: fullSession.reservationId },
    });

    if (!reservation?.paymentLink) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No hay link de pago activo. Escribe *reservar* para iniciar una nueva reserva.',
      );
      return;
    }

    if (reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '⏱ El tiempo de pago expiró y la habitación fue liberada. Escribe *reservar* para buscar disponibilidad de nuevo.',
      );
      await this.updateSession(session.id, { state: 'idle' });
      return;
    }

    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );
    await this.sendPaymentSummary(hotelId, session.whatsappPhone, reservation, holdTtl);
  }

  private async sendPaymentSummary(
    hotelId: string,
    phone: string,
    reservation: {
      roomName: string | null;
      checkIn: string | null;
      checkOut: string | null;
      adults: number | null;
      children: number | null;
      totalAmount: number | null;
      currency: string | null;
      paymentLink: string | null;
    },
    holdTtl: number,
  ) {
    if (!reservation.paymentLink) return;

    const guests = (reservation.adults ?? 2) + (reservation.children ?? 0);
    const payMsg = this.renderer.renderPaymentLink(
      {
        roomName: reservation.roomName ?? 'Habitación',
        checkIn: reservation.checkIn ?? '',
        checkOut: reservation.checkOut ?? '',
        guests,
        amount: reservation.totalAmount ?? 0,
        currency: reservation.currency ?? 'COP',
      },
      reservation.paymentLink,
      holdTtl,
    );
    await this.whatsapp.sendInteractive(hotelId, phone, payMsg);
  }

  private async fetchAvailability(
    hotelId: string,
    session: {
      checkIn: string | null;
      checkOut: string | null;
      adults: number | null;
      children: number | null;
    },
  ) {
    return this.pms.getAvailability(hotelId, {
      check_in: session.checkIn!,
      check_out: session.checkOut!,
      adults: session.adults ?? 2,
      children: session.children ?? 0,
    });
  }

  private wantsNewBooking(text: string, intent: BookingIntent): boolean {
    return (
      intent.intent === 'book' ||
      /reserv|habitaci|disponib|book/i.test(text)
    );
  }

  private shouldStartBooking(text: string, intent: BookingIntent): boolean {
    const enriched = this.enrichIntent(text, intent);
    if (enriched.intent === 'book') return true;
    if (this.wantsNewBooking(text, enriched)) return true;
    if (
      this.isPricingOrAvailabilityQuery(text) &&
      (enriched.dates?.check_in || /personas|adultos|huéspedes|pareja/i.test(text))
    ) {
      return true;
    }
    if (
      enriched.dates?.check_in &&
      enriched.dates?.check_out &&
      (enriched.guests?.adults || this.parseGuestsFallback(text))
    ) {
      return true;
    }
    return false;
  }

  private isPricingOrAvailabilityQuery(text: string): boolean {
    return /cuánto|cuanto|precio|tarifa|vale|costo|disponib/i.test(text);
  }

  private enrichIntent(text: string, intent: BookingIntent): BookingIntent {
    const enriched: BookingIntent = {
      ...intent,
      dates: { ...intent.dates },
      guests: { ...intent.guests },
    };

    if (!enriched.dates?.check_in || !enriched.dates?.check_out) {
      const parsed = this.parseDatesFallback(text);
      if (parsed.check_in && parsed.check_out) {
        enriched.dates = parsed;
        if (enriched.intent === 'unknown' || enriched.intent === 'faq') {
          enriched.intent = 'book';
        }
      }
    }

    if (!enriched.guests?.adults) {
      const adults = this.parseGuestsFallback(text);
      if (adults) {
        enriched.guests = { adults, children: enriched.guests?.children ?? 0 };
        if (enriched.intent === 'unknown' || enriched.intent === 'faq') {
          enriched.intent = 'book';
        }
      }
    }

    if (/pareja/i.test(text) && !enriched.guests?.adults) {
      enriched.guests = { adults: 2, children: enriched.guests?.children ?? 0 };
      enriched.intent = 'book';
    }

    return enriched;
  }

  private parseDatesFallback(text: string): { check_in?: string; check_out?: string } {
    const months: Record<string, number> = {
      enero: 1,
      febrero: 2,
      marzo: 3,
      abril: 4,
      mayo: 5,
      junio: 6,
      julio: 7,
      agosto: 8,
      septiembre: 9,
      setiembre: 9,
      octubre: 10,
      noviembre: 11,
      diciembre: 12,
    };

    const iso = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:al|-)\s*(\d{4}-\d{2}-\d{2})/);
    if (iso) {
      return { check_in: iso[1], check_out: iso[2] };
    }

    const spanish = text.match(
      /(?:del?\s*)?(\d{1,2})\s*(?:al|-)\s*(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i,
    );
    if (spanish) {
      const day1 = parseInt(spanish[1], 10);
      const day2 = parseInt(spanish[2], 10);
      const month = months[spanish[3].toLowerCase()];
      if (month) {
        const year = spanish[4]
          ? parseInt(spanish[4], 10)
          : this.inferYear(month, Math.min(day1, day2));
        return {
          check_in: this.formatDate(year, month, day1),
          check_out: this.formatDate(year, month, day2),
        };
      }
    }

    return {};
  }

  private parseGuestsFallback(text: string): number | undefined {
    if (/pareja/i.test(text)) return 2;

    const patterns = [
      /(\d+)\s*(?:personas?|adultos?|hu[eé]spedes?|pax)/i,
      /para\s+(\d+)/i,
      /(\d+)\s*personas?/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > 0 && n < 20) return n;
      }
    }

    return undefined;
  }

  private inferYear(month: number, day: number): number {
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      year += 1;
    }
    return year;
  }

  private formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private async advanceBookingFlow(
    hotelId: string,
    sessionId: string,
    phone: string,
    text: string,
    rawIntent: BookingIntent,
  ) {
    const intent = this.enrichIntent(text, rawIntent);
    const session = await this.getSession(sessionId);

    const checkIn = intent.dates?.check_in ?? session.checkIn ?? undefined;
    const checkOut = intent.dates?.check_out ?? session.checkOut ?? undefined;
    const adults =
      intent.guests?.adults ??
      this.parseGuestsFallback(text) ??
      session.adults ??
      undefined;
    const children = intent.guests?.children ?? session.children ?? 0;

    const hasDates = !!(checkIn && checkOut);

    if (hasDates && adults) {
      await this.updateSession(sessionId, {
        state: 'showing_rooms',
        checkIn,
        checkOut,
        adults,
        children,
      });

      if (this.isPricingOrAvailabilityQuery(text)) {
        await this.whatsapp.sendText(
          hotelId,
          phone,
          `Estas son las opciones del *${checkIn}* al *${checkOut}* para *${adults}* huésped${adults > 1 ? 'es' : ''}:`,
        );
      }

      await this.showAvailableRooms(hotelId, sessionId, phone);
      return;
    }

    if (session.state === 'collecting_dates' && !hasDates) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No pude entender las fechas. Prueba así: *del 28 al 29 de junio* o *2026-06-28 al 2026-06-29*',
      );
      return;
    }

    if (session.state === 'collecting_guests' && hasDates && !adults) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        '¿Cuántos huéspedes? (ej: *2 adultos* o *2 personas*)',
      );
      return;
    }

    if (hasDates) {
      await this.updateSession(sessionId, {
        state: 'collecting_guests',
        checkIn,
        checkOut,
      });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `Perfecto, del *${checkIn}* al *${checkOut}*. ¿Cuántos huéspedes? (ej: 2 adultos)`,
      );
      return;
    }

    if (adults) {
      await this.updateSession(sessionId, {
        state: 'collecting_dates',
        adults,
        children,
      });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `Entendido, *${adults}* huésped${adults > 1 ? 'es' : ''}. 📅 ¿Para qué fechas? (ej: del 28 al 29 de junio)`,
      );
      return;
    }

    await this.updateSession(sessionId, { state: 'collecting_dates' });
    await this.whatsapp.sendText(
      hotelId,
      phone,
      '¡Con gusto te ayudo! 📅 Puedes decir fechas y huéspedes en un solo mensaje (ej: *2 personas del 28 al 29 de junio*).',
    );
  }

  private isGreetingOrReset(text: string): boolean {
    const t = text.trim().toLowerCase();
    return /^(hola|buenas|hey|menu|menú|inicio|cancelar|reiniciar|empezar|volver|salir)/i.test(
      t,
    );
  }

  private async resetSession(id: string) {
    await this.prisma.conversationSession.update({
      where: { id },
      data: {
        state: 'idle',
        checkIn: null,
        checkOut: null,
        adults: null,
        children: null,
        selectedRoomTypeId: null,
        reservationId: null,
      },
    });
  }

  private async startBookingFlow(
    hotelId: string,
    sessionId: string,
    phone: string,
    text?: string,
    rawIntent?: BookingIntent,
  ) {
    await this.resetSession(sessionId);
    if (text && rawIntent) {
      await this.advanceBookingFlow(hotelId, sessionId, phone, text, rawIntent);
      return;
    }
    await this.updateSession(sessionId, { state: 'collecting_dates' });
    await this.whatsapp.sendText(
      hotelId,
      phone,
      '¡Con gusto te ayudo! 📅 Puedes decir fechas y huéspedes en un solo mensaje (ej: *2 personas del 28 al 29 de junio*).',
    );
  }

  private extractText(message: WhatsAppInboundMessage): string {
    if (message.text) return message.text;
    if (message.interactive?.list_reply) return message.interactive.list_reply.title;
    if (message.interactive?.button_reply) return message.interactive.button_reply.title;
    if (message.button) return message.button.text;
    return '';
  }

  private async getOrCreateSession(hotelId: string, phone: string) {
    return this.prisma.conversationSession.upsert({
      where: { hotelId_whatsappPhone: { hotelId, whatsappPhone: phone } },
      create: { hotelId, whatsappPhone: phone, state: 'idle' },
      update: { lastMessageAt: new Date() },
    });
  }

  private async getSession(id: string) {
    return this.prisma.conversationSession.findUniqueOrThrow({ where: { id } });
  }

  private async updateSession(
    id: string,
    data: Partial<{
      state: string;
      checkIn: string;
      checkOut: string;
      adults: number;
      children: number;
      selectedRoomTypeId: string;
      reservationId: string;
    }>,
  ) {
    return this.prisma.conversationSession.update({ where: { id }, data });
  }
}
