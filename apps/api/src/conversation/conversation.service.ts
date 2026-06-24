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
import { AiService } from './ai.service';
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
        if (intent.intent === 'book' || text.match(/reserv|habitaci|disponib|book/i)) {
          await this.updateSession(session.id, { state: 'collecting_dates' });
          await this.whatsapp.sendText(
            hotelId,
            phone,
            '¡Con gusto te ayudo a reservar! 📅 ¿Para qué fechas necesitas la habitación? (ej: del 15 al 18 de julio)',
          );
          return;
        }
        {
          const context = `Estado: ${session.state}. Fechas: ${session.checkIn ?? 'N/A'} - ${session.checkOut ?? 'N/A'}`;
          const reply = await this.ai.generateResponse(hotelId, text, context);
          await this.whatsapp.sendText(hotelId, phone, reply);
        }
        return;

      case 'collecting_dates':
        if (intent.dates?.check_in && intent.dates?.check_out) {
          await this.updateSession(session.id, {
            state: 'collecting_guests',
            checkIn: intent.dates.check_in,
            checkOut: intent.dates.check_out,
          });
          await this.whatsapp.sendText(
            hotelId,
            phone,
            `Perfecto, del ${intent.dates.check_in} al ${intent.dates.check_out}. ¿Cuántos huéspedes? (ej: 2 adultos)`,
          );
        } else {
          await this.whatsapp.sendText(
            hotelId,
            phone,
            'No pude entender las fechas. Por favor indica check-in y check-out (ej: 2025-07-15 al 2025-07-18).',
          );
        }
        return;

      case 'collecting_guests':
        {
          const adults = intent.guests?.adults ?? parseInt(text.match(/\d+/)?.[0] ?? '2', 10);
          await this.updateSession(session.id, {
            state: 'showing_rooms',
            adults,
            children: intent.guests?.children ?? 0,
          });
          await this.showAvailableRooms(hotelId, session.id, phone);
        }
        return;

      case 'showing_rooms':
        await this.handleTextRoomSelection(hotelId, session, text);
        return;

      case 'collecting_guest_info':
        await this.handleGuestInfo(hotelId, session, text);
        return;

      case 'awaiting_payment':
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
        'No encontré esa habitación. Selecciona de la lista o escribe el nombre exacto.',
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
