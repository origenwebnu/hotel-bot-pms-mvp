import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DEFAULT_ROOM_HOLD_TTL_MINUTES,
  DEFAULT_DISCOUNT_OFFER_MINUTES,
  DEFAULT_RESERVATION_RESUME_HOURS,
  JOB_NAMES,
  QUEUE_NAMES,
  WHATSAPP_BUTTON_IDS,
  countNights,
  filterValidMediaUrls,
  formatDisplayDateRange,
  normalizeRoomLabel,
  sanitizeWhatsAppText,
  buildRoomGalleryUrl,
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
import { signGalleryToken } from '../utils/gallery-token';

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

  async notifyUnexpectedError(hotelId: string, phone: string) {
    await this.whatsapp.sendText(
      hotelId,
      phone,
      'Disculpa, hubo un problema procesando tu mensaje. Escribe *menu* para volver al inicio o intenta de nuevo.',
    );
  }

  async processMessage(hotelId: string, message: WhatsAppInboundMessage) {
    const phone = message.from;
    const session = await this.getOrCreateSession(hotelId, phone);
    const text = this.extractText(message);

    if (/^continuar\s+reserva$/i.test(text.trim())) {
      await this.continueReservationFromGallery(hotelId, session, phone);
      return;
    }

    if (message.interactive?.list_reply) {
      return this.handleRoomSelection(hotelId, session, message.interactive.list_reply.id);
    }

    if (message.interactive?.button_reply || message.button) {
      const btnId =
        message.interactive?.button_reply?.id ?? message.button?.payload ?? '';
      return this.handleButton(hotelId, session, btnId);
    }

    if (this.wantsSessionReset(text)) {
      await this.returnToWelcomeMenu(hotelId, session.id, phone);
      return;
    }

    const intent = await this.ai.extractBookingIntent(text);

    switch (session.state) {
      case 'idle':
      case 'faq':
        if (this.isPriceSensitivityQuery(text, intent)) {
          if (await this.tryOfferDiscount(hotelId, session.id, phone, text, intent)) return;
        }
        if (this.wantsNewBooking(text, intent) && !this.isPriceSensitivityQuery(text, intent)) {
          if (await this.maybeOfferResumeBooking(hotelId, session.id, phone)) return;
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
          if (await this.maybeOfferResumeBooking(hotelId, session.id, phone)) return;
          await this.startFreshBooking(hotelId, session.id, phone, text, intent);
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
          if (await this.maybeOfferResumeBooking(hotelId, session.id, phone)) return;
          await this.startFreshBooking(hotelId, session.id, phone, text, intent);
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
          if (await this.maybeOfferResumeBooking(hotelId, session.id, phone)) return;
          await this.startFreshBooking(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.handleGuestInfo(hotelId, session, text);
        return;

        return;

      case 'resume_offer_pending':
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        if (/retom|continu|misma|volver a pagar|pagar/i.test(text)) {
          await this.resumeRecentReservation(hotelId, session.id, phone);
          return;
        }
        if (/nueva|otra|cambiar|desde cero|empezar/i.test(text)) {
          await this.startFreshBooking(hotelId, session.id, phone, text, intent);
          return;
        }
        await this.whatsapp.sendText(
          hotelId,
          phone,
          'Usa los botones *Retomar reserva* o *Reserva nueva*, o escribe *menu* para volver al inicio.',
        );
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
          if (await this.maybeOfferResumeBooking(hotelId, session.id, phone)) return;
          await this.startFreshBooking(hotelId, session.id, phone, text, intent);
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
        if (this.wantsSessionReset(text)) {
          await this.returnToWelcomeMenu(hotelId, session.id, phone);
          return;
        }
        {
          const context = `Estado: ${session.state}`;
          const reply = await this.ai.generateResponse(hotelId, text, context);
          await this.whatsapp.sendText(
            hotelId,
            phone,
            `${reply}\n\n_Escribe *menu* para volver al inicio._`,
          );
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
    const normalized = normalizeRoomLabel(text);

    const room = availability.rooms.find((r) => {
      const name = normalizeRoomLabel(r.name);
      return (
        r.room_type_id.toLowerCase() === normalized ||
        name === normalized ||
        name.includes(normalized) ||
        normalized.includes(name)
      );
    });

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
      this.logger.warn(
        `Room ${roomTypeId} not available for session ${session.id} (hotel ${hotelId})`,
      );
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
    const photos = filterValidMediaUrls(room.photos_urls);
    const sanitizedRoom: StandardRoomAvailability = {
      ...room,
      name: sanitizeWhatsAppText(room.name, 60),
      description: room.description
        ? sanitizeWhatsAppText(room.description, 200)
        : room.description,
      photos_urls: photos,
    };

    let delivered = false;

    try {
      await this.whatsapp.sendInteractive(
        hotelId,
        session.whatsappPhone,
        this.renderer.renderRoomDetail(sanitizedRoom),
      );
      delivered = true;
    } catch (err) {
      this.logger.warn(
        `Room detail interactive failed for ${sanitizedRoom.room_type_id}: ${err instanceof Error ? err.message : err}`,
      );
      try {
        await this.whatsapp.sendInteractive(
          hotelId,
          session.whatsappPhone,
          this.renderer.renderRoomDetailWithoutHeader(sanitizedRoom),
        );
        delivered = true;
      } catch (fallbackErr) {
        this.logger.error(
          `Room detail fallback failed for ${sanitizedRoom.room_type_id}: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`,
        );
        const description =
          sanitizedRoom.description ?? 'Habitación confortable para tu estadía.';
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          `*${sanitizedRoom.name}*\n\n${description}\n\n💰 *${sanitizedRoom.currency} ${sanitizedRoom.price.toLocaleString()}* / noche\n\nEscribe *reservar* para continuar o *menu* para volver al inicio.`,
        );
        delivered = true;
      }
    }

    if (!delivered) return;

    await this.updateSession(session.id, {
      state: 'room_selected',
      selectedRoomTypeId: room.room_type_id,
    });
  }

  private async sendRoomGalleryLink(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const fullSession = await this.getSession(session.id);
    const roomId = fullSession.selectedRoomTypeId;
    if (!roomId) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Primero elige una habitación de la lista.',
      );
      return;
    }

    const room = await this.prisma.roomType.findFirst({
      where: { id: roomId, hotelId, isActive: true },
      select: { name: true, photoUrls: true },
    });

    if (!room) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontramos esa habitación.',
      );
      return;
    }

    const photos = filterValidMediaUrls(room.photoUrls);
    if (photos.length === 0) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Esta habitación aún no tiene fotos en la galería.',
      );
      return;
    }

    const token = signGalleryToken({
      roomId,
      sessionId: session.id,
      hotelId,
    });
    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';
    const url = buildRoomGalleryUrl(roomId, token, appUrl);

    await this.whatsapp.sendInteractive(
      hotelId,
      session.whatsappPhone,
      this.renderer.renderRoomGalleryLink(url, room.name),
    );
  }

  private async continueReservationFromGallery(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    phone: string,
  ) {
    const fullSession = await this.getSession(session.id);
    if (
      !fullSession.selectedRoomTypeId ||
      !fullSession.checkIn ||
      !fullSession.checkOut ||
      fullSession.adults == null
    ) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No hay una reserva en curso. Escribe *menu* para empezar.',
      );
      return;
    }

    const availability = await this.fetchAvailability(hotelId, fullSession);
    const room = availability.rooms.find(
      (r) => r.room_type_id === fullSession.selectedRoomTypeId,
    );

    if (!room) {
      await this.updateSession(session.id, { state: 'showing_rooms' });
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'Esa habitación ya no está disponible para tus fechas. Te muestro otras opciones.',
      );
      await this.showAvailableRooms(hotelId, session.id, phone);
      return;
    }

    await this.selectRoom(hotelId, session, room);
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

    if (buttonId === WHATSAPP_BUTTON_IDS.VIEW_PHOTOS) {
      await this.sendRoomGalleryLink(hotelId, session);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.BACK_TO_ROOMS) {
      await this.updateSession(session.id, { state: 'showing_rooms' });
      await this.showAvailableRooms(hotelId, session.id, session.whatsappPhone);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.PAY_RETRY) {
      await this.updateSession(session.id, { state: 'awaiting_payment' });
      await this.resendPaymentLink(hotelId, session);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.PAY_CHANGE) {
      await this.startFreshBooking(hotelId, session.id, session.whatsappPhone);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.RESUME_BOOKING) {
      await this.resumeRecentReservation(hotelId, session.id, session.whatsappPhone);
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.NEW_BOOKING) {
      await this.startFreshBooking(hotelId, session.id, session.whatsappPhone);
      return;
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
      await this.updateSession(session.id, {
        state: 'awaiting_payment',
        reservationId: existing.id,
      });
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

      const paymentAccessToken = this.checkout.generatePaymentAccessToken();

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
          paymentAccessToken,
        },
      });

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
    let reservationId = fullSession.reservationId;

    if (!reservationId) {
      const pending = await this.prisma.reservation.findFirst({
        where: {
          hotelId,
          guestPhone: session.whatsappPhone,
          status: { in: ['hold', 'payment_pending'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      reservationId = pending?.id ?? null;
      if (reservationId) {
        await this.updateSession(session.id, {
          state: 'awaiting_payment',
          reservationId,
        });
      }
    }

    if (!reservationId) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontré una reserva pendiente. Escribe *reservar* para empezar de nuevo.',
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
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
      await this.refreshReservationHold(hotelId, session, reservation);
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
      paymentAccessToken?: string | null;
      guestFirstName: string | null;
      guestLastName: string | null;
      guestEmail: string | null;
      guestPhone: string | null;
    },
    holdTtl: number,
  ) {
    const paymentResult = await this.checkout.ensureReservationPayment(
      hotelId,
      reservation.id,
    );
    reservation = paymentResult.reservation;

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

    if (paymentResult.paymentReady && reservation.paymentLink && reservation.paymentAccessToken) {
      const paymentPageUrl = this.checkout.buildPaymentPageUrl(
        reservation.id,
        reservation.paymentAccessToken,
      );
      const payMsg = this.renderer.renderPaymentLink(paymentPageUrl, holdTtl);
      try {
        await this.whatsapp.sendInteractive(hotelId, phone, payMsg);
      } catch {
        await this.whatsapp.sendText(
          hotelId,
          phone,
          `💳 Completa tu pago aquí:\n${paymentPageUrl}`,
        );
      }
    } else {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        paymentResult.userMessage ??
          (paymentResult.paymentReady
            ? '⚠️ El pago quedó pendiente de configurar. Escribe *pagar* para reintentar.'
            : '⚠️ No pudimos generar el link de pago. Revisa Wompi en Integraciones del panel e intenta escribiendo *pagar*.'),
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

  private normalizeCommandText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isMenuRequest(text: string): boolean {
    const normalized = this.normalizeCommandText(text);
    return normalized === 'menu';
  }

  private wantsSessionReset(text: string): boolean {
    const normalized = this.normalizeCommandText(text);
    if (!normalized) return false;

    const exact = new Set([
      'menu',
      'inicio',
      'cancelar',
      'reiniciar',
      'empezar',
      'volver',
      'salir',
      'hola',
      'buenas',
      'hey',
      'reiniciar chat',
      'volver al menu',
      'volver al inicio',
      'empezar de nuevo',
      'cancelar todo',
      'menu principal',
    ]);
    if (exact.has(normalized)) return true;

    const firstWord = normalized.split(' ')[0] ?? '';
    if (
      ['menu', 'inicio', 'cancelar', 'reiniciar', 'hola', 'buenas', 'volver', 'salir', 'empezar'].includes(
        firstWord,
      )
    ) {
      return true;
    }

    return /\b(volver al menu|volver al inicio|empezar de nuevo|menu principal|reiniciar chat)\b/.test(
      normalized,
    );
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
    try {
      await this.whatsapp.sendInteractive(hotelId, phone, msg);
    } catch (err) {
      this.logger.warn(
        `Welcome menu interactive failed: ${err instanceof Error ? err.message : err}`,
      );
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `Hola, bienvenido a *${hotel.name}* 👋\n\n` +
          `¿Qué te gustaría hacer?\n` +
          `• Escribe *reservar* para reservar habitación\n` +
          `• Escribe *tarifas* para conocer precios\n` +
          `• Escribe *dudas* para resolver preguntas`,
      );
    }

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
    session: { adults: number | null; state?: string },
  ): number | undefined {
    const allowBareNumber = session.state === 'collecting_guests';
    const fromText = this.parseGuestsFallback(text, { allowBareNumber });
    if (fromText != null) return fromText;

    if (
      intent.guests?.adults != null &&
      ((allowBareNumber && /^\s*\d+\s*$/.test(text.trim())) ||
        /personas|adultos|hu[eé]spedes|pareja|pax|\bpara\s+\d+/i.test(text))
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

  private parseGuestsFallback(
    text: string,
    options?: { allowBareNumber?: boolean },
  ): number | undefined {
    if (/pareja/i.test(text)) return 2;

    const trimmed = text.trim();
    if (options?.allowBareNumber) {
      const bare = trimmed.match(/^(\d+)$/);
      if (bare) {
        const n = parseInt(bare[1], 10);
        if (n > 0 && n < 20) return n;
      }
    }

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

  private getResumeWindowHours(): number {
    return parseInt(
      process.env.RESERVATION_RESUME_HOURS ?? String(DEFAULT_RESERVATION_RESUME_HOURS),
      10,
    );
  }

  private async findRecentIncompleteReservation(hotelId: string, phone: string) {
    const since = new Date(Date.now() - this.getResumeWindowHours() * 60 * 60 * 1000);
    return this.prisma.reservation.findFirst({
      where: {
        hotelId,
        guestPhone: phone,
        createdAt: { gte: since },
        status: { in: ['hold', 'payment_pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private isHoldExpired(reservation: { holdExpiresAt: Date | null }): boolean {
    return !reservation.holdExpiresAt || reservation.holdExpiresAt < new Date();
  }

  private async maybeOfferResumeBooking(
    hotelId: string,
    sessionId: string,
    phone: string,
  ): Promise<boolean> {
    const reservation = await this.findRecentIncompleteReservation(hotelId, phone);
    if (!reservation?.checkIn || !reservation.checkOut || !reservation.roomTypeId) {
      return false;
    }

    const guests = (reservation.adults ?? 0) + (reservation.children ?? 0);
    const msg = this.renderer.renderResumeBookingOffer({
      roomName: reservation.roomName ?? 'Habitación',
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      guests: guests || 2,
      amount: reservation.totalAmount ?? 0,
      currency: reservation.currency ?? 'COP',
      paymentStatus: reservation.paymentStatus,
      holdExpired: this.isHoldExpired(reservation),
    });

    await this.updateSession(sessionId, {
      state: 'resume_offer_pending',
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      adults: reservation.adults ?? undefined,
      children: reservation.children ?? undefined,
      selectedRoomTypeId: reservation.roomTypeId,
      reservationId: reservation.id,
    });

    await this.whatsapp.sendInteractive(hotelId, phone, msg);
    return true;
  }

  private async resumeRecentReservation(
    hotelId: string,
    sessionId: string,
    phone: string,
  ) {
    const session = await this.getSession(sessionId);
    let reservation = session.reservationId
      ? await this.prisma.reservation.findUnique({ where: { id: session.reservationId } })
      : null;

    if (!reservation) {
      reservation = await this.findRecentIncompleteReservation(hotelId, phone);
    }

    if (!reservation?.roomTypeId || !reservation.checkIn || !reservation.checkOut) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No encontré una reserva reciente para retomar. Escribe *reservar* para empezar de nuevo.',
      );
      return;
    }

    await this.updateSession(sessionId, {
      state: 'awaiting_payment',
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      adults: reservation.adults ?? undefined,
      children: reservation.children ?? undefined,
      selectedRoomTypeId: reservation.roomTypeId,
      reservationId: reservation.id,
    });

    if (this.isHoldExpired(reservation)) {
      await this.refreshReservationHold(
        hotelId,
        { id: sessionId, whatsappPhone: phone },
        reservation,
      );
      return;
    }

    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );
    await this.sendPaymentSummary(hotelId, phone, reservation, holdTtl);
  }

  private async refreshReservationHold(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    reservation: {
      id: string;
      idempotencyKey: string;
      roomTypeId: string | null;
      roomName: string | null;
      checkIn: string | null;
      checkOut: string | null;
      adults: number | null;
      children: number | null;
    },
  ) {
    if (!reservation.roomTypeId || !reservation.checkIn || !reservation.checkOut) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No pude retomar la reserva (faltan datos). Escribe *reservar* para empezar de nuevo.',
      );
      return;
    }

    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );

    try {
      const hold = await this.pms.holdRoom(hotelId, {
        room_type_id: reservation.roomTypeId,
        check_in: reservation.checkIn,
        check_out: reservation.checkOut,
        adults: reservation.adults ?? 2,
        children: reservation.children ?? 0,
        hold_ttl_minutes: holdTtl,
        idempotency_key: reservation.idempotencyKey,
      });

      const updated = await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'hold',
          holdExpiresAt: new Date(hold.expires_at),
          totalAmount: hold.total_amount,
          currency: hold.currency,
          pmsReservationId: hold.pms_reservation_id,
          paymentLink: null,
          paymentId: null,
          paymentStatus: null,
        },
      });

      await this.updateSession(session.id, {
        state: 'awaiting_payment',
        reservationId: updated.id,
        checkIn: updated.checkIn ?? undefined,
        checkOut: updated.checkOut ?? undefined,
        adults: updated.adults ?? undefined,
        children: updated.children ?? undefined,
        selectedRoomTypeId: updated.roomTypeId ?? undefined,
      });

      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `✅ Retomamos tu reserva de *${updated.roomName ?? 'habitación'}* del *${formatDisplayDateRange(updated.checkIn!, updated.checkOut!)}*. Tienes *${holdTtl} min* para completar el pago.`,
      );

      await this.sendPaymentSummary(hotelId, session.whatsappPhone, updated, holdTtl);
    } catch (error) {
      this.logger.error(`refreshReservationHold failed: ${error}`);
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Esa habitación ya no está disponible para esas fechas. Pulsa *Reserva nueva* o escribe *reservar* para buscar otras opciones.',
      );
      await this.updateSession(session.id, { state: 'resume_offer_pending' });
    }
  }

  private async startFreshBooking(
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
      '¡Empecemos una reserva nueva! 📅 Indica *fechas* y *huéspedes* (ej: *2 personas del 28 al 29 de junio*).',
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
    if (await this.maybeOfferResumeBooking(hotelId, sessionId, phone)) {
      return;
    }
    await this.startFreshBooking(hotelId, sessionId, phone, text, rawIntent);
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
