import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DEFAULT_ROOM_HOLD_TTL_MINUTES,
  DEFAULT_DISCOUNT_OFFER_MINUTES,
  JOB_NAMES,
  QUEUE_NAMES,
  WHATSAPP_BUTTON_IDS,
  countNights,
  formatDisplayDateRange,
  type SessionDiscountOffer,
  type StandardRoomAvailability,
  type WhatsAppInboundMessage,
} from '@hotel-bot/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';
import { AiService, type BookingIntent } from './ai.service';
import { WhatsAppRendererService } from '../whatsapp/whatsapp-renderer.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CheckoutService } from '../checkout/checkout.service';
import { DiscountTierService } from '../local-inventory/discount-tier.service';

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
    private readonly discountTiers: DiscountTierService,
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
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.shouldStartBooking(text, intent) && !this.isPriceSensitivityQuery(text, intent)) {
          if (await this.advanceBookingFlow(hotelId, session.id, phone, text, intent)) {
            return;
          }
        }
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (session.state === 'idle' && !this.hasSeenWelcome(session)) {
          await this.sendWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        {
          const context = `Estado: ${session.state}. Fechas: ${session.checkIn ?? 'N/A'} - ${session.checkOut ?? 'N/A'}`;
          const reply = await this.ai.generateResponse(hotelId, text, context);
          await this.whatsapp.sendText(
            hotelId,
            phone,
            `${reply}\n\n_Escribe *menu* para volver al inicio._`,
          );
        }
        return;

      case 'collecting_dates':
      case 'collecting_guests':
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.wantsNewBooking(text, intent) && !this.isPriceSensitivityQuery(text, intent)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        if (await this.advanceBookingFlow(hotelId, session.id, phone, text, intent)) {
          return;
        }
        return;

      case 'showing_rooms':
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.wantsNewBooking(text, intent)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.handleTextRoomSelection(hotelId, session, text);
        return;

      case 'room_selected':
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.wantsNewBooking(text, intent)) {
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
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (this.wantsNewBooking(text, intent)) {
          await this.startBookingFlow(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.handleGuestInfo(hotelId, session, text);
        return;

      case 'awaiting_payment':
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.wantsNewBooking(text, intent)) {
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

    if (session.adults == null) {
      await this.updateSession(sessionId, { state: 'collecting_guests' });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        session.checkIn && session.checkOut
          ? `Perfecto, del *${formatDisplayDateRange(session.checkIn, session.checkOut)}*. ¿Cuántos *huéspedes* serían? (ej: *2 adultos*)`
          : '¿Cuántos *huéspedes* serían? (ej: *2 adultos* o *2 personas*)',
      );
      return;
    }

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

    if (listMsg.type === 'text') {
      await this.whatsapp.sendText(hotelId, phone, listMsg.text.body);
    } else {
      await this.whatsapp.sendInteractive(hotelId, phone, listMsg);
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
    if (buttonId === WHATSAPP_BUTTON_IDS.MENU_BOOK) {
      await this.startBookingFlow(hotelId, session.id, session.whatsappPhone);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.MENU_FAQ) {
      await this.updateSession(session.id, { state: 'faq' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¡Con gusto! 🤝 Cuéntame tu duda sobre el hotel y te respondo enseguida.\n\n_Escribe *menu* para volver al inicio._',
      );
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.MENU_RATES) {
      await this.sendRatesOverview(hotelId, session.whatsappPhone);
      return;
    }

    if (buttonId.startsWith('room_')) {
      await this.handleRoomSelection(hotelId, session, buttonId);
      return;
    }

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
      await this.sendPaymentSummary(hotelId, session.whatsappPhone, existing, holdTtl);
      return;
    }

    let reservation;
    try {
      const hold = await this.pms.holdRoom(hotelId, {
        room_type_id: fullSession.selectedRoomTypeId!,
        check_in: fullSession.checkIn!,
        check_out: fullSession.checkOut!,
        adults: fullSession.adults ?? 2,
        children: fullSession.children ?? 0,
        hold_ttl_minutes: holdTtl,
        idempotency_key: idempotencyKey,
      });

      const discountOffer = this.getActiveDiscountOffer(fullSession);
      let finalAmount = hold.total_amount;
      let originalAmount: number | undefined;
      let discountPercent: number | undefined;
      let discountTierId: string | undefined;

      if (
        discountOffer &&
        discountOffer.roomTypeId === fullSession.selectedRoomTypeId &&
        Math.abs(discountOffer.originalTotal - hold.total_amount) < 1
      ) {
        originalAmount = hold.total_amount;
        finalAmount = discountOffer.discountedTotal;
        discountPercent = discountOffer.percent;
        discountTierId = discountOffer.tierId;
      }

      reservation = await this.prisma.reservation.create({
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
          totalAmount: finalAmount,
          originalAmount,
          discountPercent,
          discountTierId,
          currency: hold.currency,
          pmsReservationId: hold.pms_reservation_id,
          holdExpiresAt: new Date(hold.expires_at),
          guestFirstName: firstName,
          guestLastName: lastName,
          guestEmail: email,
          guestPhone: session.whatsappPhone,
        },
      });

      try {
        const payment = await this.checkout.createPaymentLink(hotelId, {
          amount: finalAmount,
          currency: hold.currency,
          reservation_id: reservation.id,
          hold_id: hold.hold_id,
          expires_at: hold.expires_at,
          guest_email: email,
          guest_name: `${firstName} ${lastName}`,
        });

        reservation = await this.prisma.reservation.update({
          where: { id: reservation.id },
          data: {
            status: 'payment_pending',
            paymentLink: payment.payment_url,
            paymentId: payment.payment_id,
          },
        });
      } catch (paymentError) {
        this.logger.warn(
          `Payment link failed for reservation ${reservation.id}: ${paymentError}`,
        );
      }

      await this.updateSession(session.id, {
        state: 'awaiting_payment',
        reservationId: reservation.id,
      });

      await this.sendPaymentSummary(hotelId, session.whatsappPhone, reservation, holdTtl);
    } catch (error) {
      this.logger.error(`handleGuestInfo failed: ${error}`);
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No pudimos completar la reserva. Verifica que el hotel tenga pagos configurados e intenta de nuevo, o escribe *menu*.',
      );
    }
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

    if (!reservation) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontré una reserva pendiente. Escribe *reservar* para empezar de nuevo.',
      );
      return;
    }

    if (!reservation.paymentLink && !['hold', 'payment_pending'].includes(reservation.status)) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No hay reserva activa. Escribe *reservar* para iniciar una nueva reserva.',
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
      id: string;
      roomName: string | null;
      checkIn: string | null;
      checkOut: string | null;
      adults: number | null;
      children: number | null;
      totalAmount: number | null;
      originalAmount?: number | null;
      discountPercent?: number | null;
      currency: string | null;
      paymentLink: string | null;
      guestFirstName: string | null;
      guestLastName: string | null;
      guestEmail: string | null;
      guestPhone: string | null;
    },
    holdTtl: number,
  ) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true },
    });

    const guests = (reservation.adults ?? 2) + (reservation.children ?? 0);
    const guestName = [reservation.guestFirstName, reservation.guestLastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Huésped';

    const receipt = this.renderer.renderReservationReceipt({
      hotelName: hotel.name,
      reservationRef: reservation.id.slice(-8).toUpperCase(),
      guestName,
      guestEmail: reservation.guestEmail ?? '—',
      guestPhone: reservation.guestPhone ?? undefined,
      roomName: reservation.roomName ?? 'Habitación',
      checkIn: reservation.checkIn ?? '',
      checkOut: reservation.checkOut ?? '',
      guests,
      amount: reservation.totalAmount ?? 0,
      originalAmount: reservation.originalAmount ?? undefined,
      discountPercent: reservation.discountPercent ?? undefined,
      currency: reservation.currency ?? 'COP',
      holdMinutes: holdTtl,
    });

    await this.whatsapp.sendText(hotelId, phone, receipt.text.body);

    if (reservation.paymentLink) {
      const payMsg = this.renderer.renderPaymentLink(
        reservation.paymentLink,
        holdTtl,
      );
      try {
        await this.whatsapp.sendInteractive(hotelId, phone, payMsg);
      } catch {
        await this.whatsapp.sendText(
          hotelId,
          phone,
          `💳 Completa tu pago aquí:\n${reservation.paymentLink}`,
        );
      }
    } else {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        '⚠️ El hotel aún no tiene pasarela de pagos configurada. Tu reserva quedó registrada — el hotel te contactará para confirmar el pago.',
      );
    }
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
      adults: session.adults!,
      children: session.children ?? 0,
    });
  }

  private hasSeenWelcome(session: { contextJson: unknown }): boolean {
    const ctx = session.contextJson as { welcomed?: boolean } | null;
    return ctx?.welcomed === true;
  }

  private isMenuRequest(text: string): boolean {
    return /^(menu|menú)$/i.test(text.trim());
  }

  private wantsSessionReset(text: string): boolean {
    return this.isGreetingOrReset(text) || this.isMenuRequest(text);
  }

  private async returnToWelcomeMenu(
    hotelId: string,
    sessionId: string,
    phone: string,
  ) {
    await this.resetSession(sessionId);
    await this.sendWelcomeMenu(hotelId, sessionId, phone);
  }

  private async sendWelcomeMenu(
    hotelId: string,
    sessionId: string,
    phone: string,
  ) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true },
    });

    const msg = this.renderer.renderWelcomeMenu(hotel.name);
    await this.whatsapp.sendInteractive(hotelId, phone, msg);

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: 'idle',
        contextJson: { welcomed: true },
      },
    });
  }

  private async sendRatesOverview(hotelId: string, phone: string) {
    const [hotel, rooms] = await Promise.all([
      this.prisma.hotel.findUniqueOrThrow({
        where: { id: hotelId },
        select: { name: true },
      }),
      this.prisma.roomType.findMany({
        where: { hotelId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { pricePerNight: 'asc' }],
        select: {
          name: true,
          pricePerNight: true,
          currency: true,
          description: true,
        },
      }),
    ]);

    const msg = this.renderer.renderRatesList(
      rooms.map((r) => ({
        name: r.name,
        price: r.pricePerNight,
        currency: r.currency,
        description: r.description,
      })),
      hotel.name,
    );
    await this.whatsapp.sendText(hotelId, phone, msg.text.body);
  }

  private wantsNewBooking(text: string, intent: BookingIntent): boolean {
    return (
      intent.intent === 'book' ||
      /reserv|habitaci|disponib|book/i.test(text)
    );
  }

  private shouldStartBooking(text: string, intent: BookingIntent): boolean {
    if (this.isPriceSensitivityQuery(text, intent)) return false;

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
      this.resolveGuestCount(text, enriched, { adults: null }) != null
    ) {
      return true;
    }
    return false;
  }

  private isPricingOrAvailabilityQuery(text: string): boolean {
    return /cuánto|cuanto|precio|tarifa|vale|costo|disponib/i.test(text);
  }

  private isPriceSensitivityQuery(text: string, intent: BookingIntent): boolean {
    if (intent.price_sensitivity) return true;
    return /caro|costos[oa]|presupuesto|barat[oa]|econ[oó]mic[oa]|descuent|oferta|rebaj|promoci[oó]n|m[aá]s\s+barat|no\s+puedo\s+pagar|fuera\s+de\s+(mi\s+)?presupuesto|reduce|baj(?:a|ar)\s+(?:el\s+)?precio|algo\s+m[aá]s\s+barat|hay\s+.*descuent|tienen\s+.*descuent/i.test(
      text,
    );
  }

  private getActiveDiscountOffer(session: {
    contextJson: unknown;
  }): SessionDiscountOffer | null {
    const ctx = session.contextJson as { discountOffer?: SessionDiscountOffer } | null;
    const offer = ctx?.discountOffer;
    if (!offer) return null;
    if (new Date(offer.expiresAt) <= new Date()) return null;
    return offer;
  }

  private async tryOfferDiscount(
    hotelId: string,
    sessionId: string,
    phone: string,
    text?: string,
    rawIntent?: BookingIntent,
  ): Promise<boolean> {
    let fullSession = await this.getSession(sessionId);
    const previousContext =
      (fullSession.contextJson as Record<string, unknown> | null) ?? {};

    let checkIn = fullSession.checkIn ?? undefined;
    let checkOut = fullSession.checkOut ?? undefined;
    let adults = fullSession.adults ?? undefined;

    if (text && rawIntent) {
      const intent = this.enrichIntent(text, rawIntent);
      checkIn = intent.dates?.check_in ?? checkIn;
      checkOut = intent.dates?.check_out ?? checkOut;
      const parsedAdults = this.resolveGuestCount(text, intent, fullSession);
      if (parsedAdults != null) adults = parsedAdults;

      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          checkIn: checkIn ?? null,
          checkOut: checkOut ?? null,
          adults: adults ?? null,
          contextJson: {
            ...previousContext,
            pendingDiscount: true,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      fullSession = await this.getSession(sessionId);
    } else {
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          contextJson: {
            ...previousContext,
            pendingDiscount: true,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (!checkIn || !checkOut) {
      await this.updateSession(sessionId, { state: 'collecting_dates' });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'Con gusto te ayudo con un descuento 😊 Para calcularlo necesito tus *fechas* de estadía (ej: *del 15 al 18 de julio*).',
      );
      return true;
    }

    if (adults == null) {
      await this.updateSession(sessionId, {
        state: 'collecting_guests',
        checkIn,
        checkOut,
      });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `Perfecto, del *${formatDisplayDateRange(checkIn, checkOut)}*. ¿Cuántos *huéspedes* serían? (ej: *2 adultos*)`,
      );
      return true;
    }

    const availability = await this.fetchAvailability(hotelId, {
      checkIn,
      checkOut,
      adults,
      children: fullSession.children,
    });
    if (availability.fallback || availability.rooms.length === 0) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No hay habitaciones disponibles para esas fechas en este momento. ¿Quieres probar con otras fechas?',
      );
      return true;
    }

    const nights = countNights(checkIn, checkOut);
    const room = this.pickRoomForDiscount(fullSession, availability.rooms, nights);
    const originalTotal = room.price * nights;

    const tier = await this.discountTiers.findApplicableTier(hotelId, originalTotal);
    if (!tier) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'Entiendo tu preocupación. Por ahora no tenemos promociones activas para ese valor, pero puedo mostrarte otras fechas u opciones. Escribe *menu* para volver al inicio.',
      );
      return true;
    }

    const offerMinutes = parseInt(
      process.env.DISCOUNT_OFFER_MINUTES ?? String(DEFAULT_DISCOUNT_OFFER_MINUTES),
      10,
    );
    const discountedTotal = this.discountTiers.calculateDiscountedTotal(
      originalTotal,
      tier.discountPercent,
    );
    const expiresAt = new Date(Date.now() + offerMinutes * 60 * 1000).toISOString();

    const discountOffer: SessionDiscountOffer = {
      tierId: tier.id,
      percent: tier.discountPercent,
      expiresAt,
      originalTotal,
      discountedTotal,
      roomTypeId: room.room_type_id,
      currency: room.currency,
    };

    const offerContext =
      (fullSession.contextJson as Record<string, unknown> | null) ?? {};

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: 'room_selected',
        selectedRoomTypeId: room.room_type_id,
        checkIn,
        checkOut,
        adults,
        contextJson: {
          ...offerContext,
          pendingDiscount: true,
          discountOffer,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const msg = this.renderer.renderDiscountOffer({
      percent: tier.discountPercent,
      originalTotal,
      discountedTotal,
      currency: room.currency,
      expiresMinutes: offerMinutes,
      roomName: room.name,
    });
    await this.whatsapp.sendInteractive(hotelId, phone, msg);
    return true;
  }

  private pickRoomForDiscount(
    session: { selectedRoomTypeId: string | null },
    rooms: StandardRoomAvailability[],
    nights: number,
  ): StandardRoomAvailability {
    const selected = rooms.find(
      (room) => room.room_type_id === session.selectedRoomTypeId,
    );
    if (selected) return selected;

    return rooms.reduce((cheapest, room) =>
      room.price * nights < cheapest.price * nights ? room : cheapest,
    );
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
    } else if (
      !this.parseGuestsFallback(text) &&
      !/pareja/i.test(text) &&
      !/personas|adultos|hu[eé]spedes|pax|\bpara\s+\d+/i.test(text)
    ) {
      enriched.guests = { adults: undefined, children: enriched.guests?.children ?? 0 };
    }

    if (/pareja/i.test(text) && !enriched.guests?.adults) {
      enriched.guests = { adults: 2, children: enriched.guests?.children ?? 0 };
      enriched.intent = 'book';
    }

    return enriched;
  }

  private resolveGuestCount(
    text: string,
    intent: BookingIntent,
    session: { adults: number | null },
  ): number | undefined {
    const fromText = this.parseGuestsFallback(text);
    if (fromText != null) return fromText;

    if (
      intent.guests?.adults != null &&
      /personas|adultos|hu[eé]spedes|pareja|pax|\bpara\s+\d+/i.test(text)
    ) {
      return intent.guests.adults;
    }

    if (session.adults != null) return session.adults;

    return undefined;
  }

  private hasPendingDiscount(session: { contextJson: unknown }): boolean {
    const ctx = session.contextJson as { pendingDiscount?: boolean } | null;
    return ctx?.pendingDiscount === true;
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
  ): Promise<boolean> {
    const intent = this.enrichIntent(text, rawIntent);
    const session = await this.getSession(sessionId);

    const checkIn = intent.dates?.check_in ?? session.checkIn ?? undefined;
    const checkOut = intent.dates?.check_out ?? session.checkOut ?? undefined;
    const adults = this.resolveGuestCount(text, intent, session);
    const children = intent.guests?.children ?? session.children ?? 0;

    const hasDates = !!(checkIn && checkOut);

    if (hasDates && adults != null) {
      if (this.hasPendingDiscount(session)) {
        return this.tryOfferDiscount(hotelId, sessionId, phone, text, rawIntent);
      }

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
          `Estas son las opciones del *${formatDisplayDateRange(checkIn, checkOut)}* para *${adults}* huésped${adults > 1 ? 'es' : ''}:`,
        );
      }

      await this.showAvailableRooms(hotelId, sessionId, phone);
      return true;
    }

    if (session.state === 'collecting_dates' && !hasDates) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No pude entender las fechas. Prueba así: *del 28 al 29 de junio* o *2026-06-28 al 2026-06-29*\n\n_Escribe *menu*, *cancelar* o *inicio* para volver al menú principal._',
      );
      return true;
    }

    if (hasDates && adults == null) {
      await this.updateSession(sessionId, {
        state: 'collecting_guests',
        checkIn,
        checkOut,
      });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `Perfecto, del *${formatDisplayDateRange(checkIn, checkOut)}*. ¿Cuántos *huéspedes* serían? (ej: *2 adultos* o *2 personas*)`,
      );
      return true;
    }

    if (session.state === 'collecting_guests' && hasDates && adults == null) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        '¿Cuántos huéspedes? (ej: *2 adultos* o *2 personas*)',
      );
      return true;
    }

    if (adults != null) {
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
      return true;
    }

    await this.updateSession(sessionId, { state: 'collecting_dates' });
    await this.whatsapp.sendText(
      hotelId,
      phone,
      '¡Con gusto te ayudo! 📅 Indica *fechas* y *huéspedes* (ej: *2 personas del 28 al 29 de junio*).',
    );
    return true;
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
        contextJson: Prisma.DbNull,
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
