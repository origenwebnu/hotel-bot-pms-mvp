import { Injectable, Logger } from '@nestjs/common';
import {
  BUSINESS_VERTICAL_LABELS,
  DEFAULT_ROOM_HOLD_TTL_MINUTES,
  RESTAURANT_OCCASION_LABELS,
  WHATSAPP_BUTTON_IDS,
  parseGuestCountryCode,
  parseRestaurantBookingDate,
  wantsWhatsAppSessionReset,
  type RestaurantAddOnSelection,
  type RestaurantOccasion,
  type WhatsAppInboundMessage,
} from '@hotel-bot/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppRendererService } from '../whatsapp/whatsapp-renderer.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CheckoutService } from '../checkout/checkout.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionLimitError } from '../subscription/subscription.errors';
import { AiService } from '../conversation/ai.service';
import { RestaurantInventoryService } from './restaurant-inventory.service';

export const RESTAURANT_STATES = [
  'rest_collecting_date',
  'rest_collecting_time',
  'rest_collecting_party',
  'rest_selecting_zone',
  'rest_collecting_occasion',
  'rest_selecting_addons',
  'rest_collecting_guest_info',
  'rest_confirming',
  'awaiting_payment',
  'confirmed',
] as const;

type RestaurantState = (typeof RESTAURANT_STATES)[number];

@Injectable()
export class RestaurantBookingFlowService {
  private readonly logger = new Logger(RestaurantBookingFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: RestaurantInventoryService,
    private readonly renderer: WhatsAppRendererService,
    private readonly whatsapp: WhatsAppService,
    private readonly checkout: CheckoutService,
    private readonly subscription: SubscriptionService,
    private readonly ai: AiService,
  ) {}

  isRestaurantState(state: string): boolean {
    return (RESTAURANT_STATES as readonly string[]).includes(state);
  }

  async processMessage(
    hotelId: string,
    session: { id: string; whatsappPhone: string; state: string },
    message: WhatsAppInboundMessage,
    text: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    if (message.interactive?.list_reply) {
      return this.handleListReply(
        hotelId,
        session,
        message.interactive.list_reply.id,
        business,
      );
    }

    if (message.interactive?.button_reply || message.button) {
      const btnId =
        message.interactive?.button_reply?.id ?? message.button?.payload ?? '';
      return this.handleButton(hotelId, session, btnId, business);
    }

    if (this.wantsSessionReset(text)) {
      return this.returnToWelcomeMenu(hotelId, session.id, session.whatsappPhone, business);
    }

    if (/^(continuar\s+reserva|reservar)$/i.test(text.trim())) {
      return this.startBooking(hotelId, session.id, session.whatsappPhone);
    }

    switch (session.state) {
      case 'idle':
      case 'faq':
        if (this.isRatesQuery(text)) {
          return this.handleRatesQuery(hotelId, session.whatsappPhone, text);
        }
        if (this.wantsNewBooking(text)) {
          return this.startBooking(hotelId, session.id, session.whatsappPhone, text);
        }
        if (session.state === 'idle' && !(await this.hasSeenWelcome(session.id))) {
          return this.sendWelcomeMenu(hotelId, session.id, session.whatsappPhone, business);
        }
        {
          const context = `Estado: ${session.state}. Tipo de negocio: ${BUSINESS_VERTICAL_LABELS.restaurant}.`;
          const reply = await this.ai.generateResponse(hotelId, text, context, business);
          await this.whatsapp.sendText(
            hotelId,
            session.whatsappPhone,
            `${reply}\n\n_Escribe *menu* para volver al inicio._`,
          );
        }
        return;

      case 'rest_collecting_date':
        return this.handleDateInput(hotelId, session, text);

      case 'rest_collecting_time':
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Elige un horario de la lista que te enviamos, o escribe *menu* para cancelar.',
        );
        return;

      case 'rest_collecting_party':
        return this.handlePartyInput(hotelId, session, text);

      case 'rest_selecting_zone':
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Selecciona una zona de la lista, o escribe *menu* para cancelar.',
        );
        return;

      case 'rest_collecting_occasion':
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Elige el motivo de tu visita en la lista anterior.',
        );
        return;

      case 'rest_selecting_addons':
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Usa los botones del mensaje anterior: *Quiero adicionales* para ver la lista, o *Reservar* para continuar sin extras.',
        );
        return;

      case 'rest_collecting_guest_info':
        return this.handleGuestInfoInput(hotelId, session, text, business);

      case 'rest_confirming':
        return this.handleConfirmingInput(hotelId, session, text, business);

      case 'awaiting_payment':
        if (text.match(/pagar|pago|link|reintentar/i)) {
          return this.resendPaymentLink(hotelId, session);
        }
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Tu reserva está pendiente de pago. Escribe *pagar* para recibir el link de nuevo.',
        );
        return;

      default:
        if (this.wantsSessionReset(text)) {
          return this.returnToWelcomeMenu(hotelId, session.id, session.whatsappPhone, business);
        }
        {
          const context = `Estado: ${session.state}. Tipo de negocio: Restaurante.`;
          const reply = await this.ai.generateResponse(hotelId, text, context, business);
          await this.whatsapp.sendText(
            hotelId,
            session.whatsappPhone,
            `${reply}\n\n_Escribe *menu* para volver al inicio._`,
          );
        }
    }
  }

  async handleButton(
    hotelId: string,
    session: { id: string; whatsappPhone: string; state: string },
    buttonId: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    if (buttonId === WHATSAPP_BUTTON_IDS.MENU_BOOK) {
      return this.startBooking(hotelId, session.id, session.whatsappPhone);
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.MENU_FAQ) {
      await this.updateSession(session.id, { state: 'faq' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¡Con gusto! 🤝 Cuéntame tu duda sobre nuestro restaurante.\n\n_Escribe *menu* para volver al inicio._',
      );
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.REST_SKIP_ADDONS) {
      await this.updateSession(session.id, {
        selectedAddOnsJson: [],
      });
      return this.finishAddOnSelection(hotelId, session, business);
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.REST_WANT_ADDONS) {
      const addons = await this.inventory.listAddOns(hotelId);
      const active = addons.filter((a) => a.is_active);
      if (!active.length) {
        await this.updateSession(session.id, {
          selectedAddOnsJson: [],
        });
        return this.finishAddOnSelection(hotelId, session, business);
      }
      const msg = this.renderer.renderRestaurantAddOnPickerList(active);
      if (msg.type === 'text') {
        await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
      } else {
        await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
      }
      return;
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.REST_CONFIRM_BOOKING) {
      return this.confirmBooking(hotelId, session, business);
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.PAY_RETRY) {
      await this.updateSession(session.id, { state: 'awaiting_payment' });
      return this.resendPaymentLink(hotelId, session);
    }

    if (buttonId === WHATSAPP_BUTTON_IDS.PAY_CHANGE) {
      return this.startBooking(hotelId, session.id, session.whatsappPhone);
    }
  }

  async handleListReply(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    listId: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    if (listId.startsWith('rest_time_')) {
      const time = listId.replace('rest_time_', '').replace(/^(\d{2})(\d{2})$/, '$1:$2');
      await this.updateSession(session.id, {
        bookingTime: time,
        state: 'rest_collecting_party',
      });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Horario *${time}* seleccionado. ¿Cuántas *personas* serán? (ej: *4* o *4 personas*)`,
      );
      return;
    }

    if (listId.startsWith('rest_zone_')) {
      const zoneId = listId.replace('rest_zone_', '');
      const full = await this.getSession(session.id);
      if (!full.bookingDate || !full.bookingTime || !full.partySize) {
        return this.startBooking(hotelId, session.id, session.whatsappPhone);
      }

      try {
        await this.inventory.assertZoneAvailable(
          hotelId,
          zoneId,
          full.bookingDate,
          full.bookingTime,
          full.partySize,
        );
      } catch {
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Esa zona ya no está disponible. Escribe *reservar* para buscar otro horario.',
        );
        return;
      }

      await this.updateSession(session.id, {
        selectedDiningZoneId: zoneId,
        state: 'rest_collecting_occasion',
      });
      await this.whatsapp.sendInteractive(
        hotelId,
        session.whatsappPhone,
        this.renderer.renderRestaurantOccasionButtons(),
      );
      return;
    }

    if (listId.startsWith('rest_occ_')) {
      const occasion = listId.replace('rest_occ_', '') as RestaurantOccasion;
      await this.updateSession(session.id, {
        occasionType: occasion,
        state: 'rest_selecting_addons',
      });
      const addons = await this.inventory.listAddOns(hotelId);
      const active = addons.filter((a) => a.is_active);
      if (!active.length) {
        await this.updateSession(session.id, { state: 'rest_collecting_guest_info' });
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Comparte tu *nombre y apellido*. Si tienes alguna petición especial, inclúyela en el mismo mensaje.',
        );
        return;
      }
      await this.whatsapp.sendInteractive(
        hotelId,
        session.whatsappPhone,
        this.renderer.renderRestaurantAddOnPrompt(),
      );
      return;
    }

    if (listId.startsWith('rest_addon_')) {
      const addonId = listId.replace('rest_addon_', '');
      const addons = await this.inventory.listAddOns(hotelId);
      const match = addons.find((a) => a.id === addonId && a.is_active);
      if (!match) {
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          'Ese adicional ya no está disponible. Pulsa *Quiero adicionales* para ver la lista actualizada.',
        );
        return;
      }

      const selection: RestaurantAddOnSelection[] = [
        { id: match.id, name: match.name, price: match.price, quantity: 1 },
      ];

      await this.updateSession(session.id, {
        selectedAddOnsJson: selection,
      });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Agregamos *${match.name}*.`,
      );
      return this.finishAddOnSelection(hotelId, session, business);
    }
  }

  private async finishAddOnSelection(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    business: { name: string; vertical: 'restaurant' },
  ) {
    const full = await this.getSession(session.id);
    const ctx = (full.contextJson ?? {}) as { guestFirstName?: string };
    if (ctx.guestFirstName) {
      await this.updateSession(session.id, { state: 'rest_confirming' });
      await this.sendConfirmSummary(hotelId, session.id, session.whatsappPhone, business.name);
      return;
    }

    await this.updateSession(session.id, { state: 'rest_collecting_guest_info' });
    await this.whatsapp.sendText(
      hotelId,
      session.whatsappPhone,
      'Comparte tu *nombre y apellido*.\n\nSi tienes alguna petición especial (decoración, alergias, etc.), inclúyela en el mismo mensaje.',
    );
  }

  private async startBooking(
    hotelId: string,
    sessionId: string,
    phone: string,
    initialText?: string,
  ) {
    const zones = await this.inventory.listZones(hotelId);
    const activeZones = zones.filter((z) => z.is_active);
    if (!activeZones.length) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'El restaurante aún no tiene zonas configuradas. Contacta al local o intenta más tarde.',
      );
      return;
    }

    await this.resetRestaurantSession(sessionId);

    const embeddedDate = initialText ? parseRestaurantBookingDate(initialText) : undefined;
    const embeddedParty = initialText ? this.parsePartySize(initialText) : undefined;

    if (embeddedDate) {
      await this.updateSession(sessionId, { state: 'rest_collecting_date' });
      return this.handleDateInput(hotelId, { id: sessionId, whatsappPhone: phone }, embeddedDate);
    }

    await this.updateSession(sessionId, {
      state: embeddedParty ? 'rest_collecting_party' : 'rest_collecting_date',
      ...(embeddedParty ? { partySize: embeddedParty } : {}),
    });

    if (embeddedParty) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `¡Perfecto! 📅 Anoté *${embeddedParty}* persona${embeddedParty > 1 ? 's' : ''}. ¿Para qué *fecha* quieres reservar?\n\nEjemplos: *28 de junio*, *2026-06-28* o *mañana*`,
      );
      return;
    }

    await this.whatsapp.sendText(
      hotelId,
      phone,
      '¡Perfecto! 📅 ¿Para qué *fecha* quieres reservar?\n\nEjemplos: *28 de junio*, *2026-06-28* o *mañana*',
    );
  }

  private async handleRatesQuery(hotelId: string, phone: string, text: string) {
    const zones = (await this.inventory.listZones(hotelId)).filter((z) => z.is_active);
    if (!zones.length) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        'No hay zonas configuradas aún. El restaurante debe crear zonas en *Inventario*.',
      );
      return;
    }

    const settings = await this.inventory.getSettings(hotelId);
    const date = parseRestaurantBookingDate(text);
    const partySize = this.parsePartySize(text) ?? 2;
    const defaultFee = settings.default_reservation_fee ?? 0;
    const defaultPerGuest = settings.default_price_per_guest ?? 0;

    let header = '*Tarifas de reserva de mesa*\n\n';
    if (date) {
      const formatted = this.formatDisplayDate(date);
      header = `*Tarifas para ${formatted}*\n\n`;
      try {
        const slots = await this.inventory.getAvailableTimeSlots(hotelId, date);
        header += slots.length
          ? `Hay ${slots.length} horario(s) disponible(s).\n\n`
          : `Sin horarios disponibles ese día.\n\n`;
      } catch {
        /* ignore invalid date */
      }
    } else if (defaultFee > 0 || defaultPerGuest > 0) {
      header +=
        `*Tarifas generales:* fee ${defaultFee.toLocaleString('es-CO')} + ${defaultPerGuest.toLocaleString('es-CO')}/persona\n` +
        `(Ejemplo ${partySize} personas: ~${(defaultFee + defaultPerGuest * partySize).toLocaleString('es-CO')})\n\n`;
    }

    const lines: string[] = [];
    for (const zone of zones) {
      if (partySize < zone.min_party_size || partySize > zone.max_party_size) continue;

      if (date) {
        const pricing = await this.inventory.getZonePricingForDate(hotelId, zone.id, date);
        const total = pricing.reservationFee + pricing.pricePerGuest * partySize;
        const labelNote = pricing.label ? ` (${pricing.label})` : '';
        lines.push(
          `• *${zone.name}*${labelNote}\n` +
            `  ${pricing.currency} ${pricing.reservationFee.toLocaleString('es-CO')} fee + ${pricing.currency} ${pricing.pricePerGuest.toLocaleString('es-CO')}/persona\n` +
            `  Total ${partySize} personas: ~${pricing.currency} ${total.toLocaleString('es-CO')}`,
        );
      } else {
        const fee = (zone.base_reservation_fee > 0 ? zone.base_reservation_fee : defaultFee).toLocaleString(
          'es-CO',
        );
        const perGuest = (
          zone.base_price_per_guest > 0 ? zone.base_price_per_guest : defaultPerGuest
        ).toLocaleString('es-CO');
        const effectiveFee = zone.base_reservation_fee > 0 ? zone.base_reservation_fee : defaultFee;
        const effectivePerGuest =
          zone.base_price_per_guest > 0 ? zone.base_price_per_guest : defaultPerGuest;
        const example = effectiveFee + effectivePerGuest * partySize;
        lines.push(
          `• *${zone.name}* (${zone.min_party_size}–${zone.max_party_size} pax)\n` +
            `  Fee: ${zone.currency} ${fee} + ${zone.currency} ${perGuest}/persona\n` +
            `  Ejemplo ${partySize} personas: ~${zone.currency} ${example.toLocaleString('es-CO')}`,
        );
      }
    }

    const paymentNote = settings.require_payment
      ? '\n\n💳 Este restaurante *requiere pago* al reservar.'
      : '\n\n✅ Puedes reservar *sin cobro anticipado*.';

    const body =
      lines.length > 0
        ? `${header}${lines.join('\n\n')}${paymentNote}\n\n_Escribe *Reservar mesa* o usa el menú para reservar._`
        : `${header}No hay zonas disponibles para ${partySize} personas.${paymentNote}`;

    await this.whatsapp.sendText(hotelId, phone, body);
  }

  private formatDisplayDate(isoDate: string) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  private async handleDateInput(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
  ) {
    const date = parseRestaurantBookingDate(text);
    if (!date) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No entendí la fecha. Prueba: *domingo*, *28 de junio*, *2026-06-28* o *mañana*',
      );
      return;
    }

    try {
      const slots = await this.inventory.getAvailableTimeSlots(hotelId, date);
      if (!slots.length) {
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          `No hay disponibilidad para el *${date}*. Prueba otra fecha.`,
        );
        return;
      }

      await this.updateSession(session.id, {
        bookingDate: date,
        state: 'rest_collecting_time',
      });

      const msg = this.renderer.renderRestaurantTimeList(date, slots);
      if (msg.type === 'text') {
        await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
      } else {
        await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fecha no válida';
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, message);
    }
  }

  private async handlePartyInput(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
  ) {
    const partySize = this.parsePartySize(text);
    if (!partySize) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Indica cuántas personas (ej: *4* o *4 personas*)',
      );
      return;
    }

    const full = await this.getSession(session.id);
    if (!full.bookingDate || !full.bookingTime) {
      return this.startBooking(hotelId, session.id, session.whatsappPhone);
    }

    const zones = await this.inventory.getAvailableZones(
      hotelId,
      full.bookingDate,
      full.bookingTime,
      partySize,
    );

    if (!zones.length) {
      const limits = await this.inventory.getPartySizeLimits(hotelId);
      let message: string;
      if (limits && partySize > limits.max) {
        message =
          `No hay zonas para *${partySize}* persona${partySize > 1 ? 's' : ''}. ` +
          `El máximo permitido por reserva es *${limits.max}* persona${limits.max > 1 ? 's' : ''}.`;
      } else if (limits && partySize < limits.min) {
        message =
          `El mínimo para reservar es *${limits.min}* persona${limits.min > 1 ? 's' : ''}. ` +
          `Indica una cantidad entre *${limits.min}* y *${limits.max}*.`;
      } else {
        message =
          `No hay disponibilidad para *${partySize}* persona${partySize > 1 ? 's' : ''} ` +
          `a las ${full.bookingTime}. Prueba otro horario o cantidad.`;
      }
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, message);
      return;
    }

    await this.updateSession(session.id, {
      partySize,
      state: 'rest_selecting_zone',
    });

    const msg = this.renderer.renderRestaurantZoneList(zones);
    if (msg.type === 'text') {
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
    } else {
      await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
    }
  }

  private async handleConfirmingInput(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    if (this.wantsSessionReset(text)) {
      return this.returnToWelcomeMenu(hotelId, session.id, session.whatsappPhone, business);
    }

    const normalized = text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (/\b(quitar|sin)\s+(los\s+)?(extras|adicionales)\b/.test(normalized)) {
      await this.updateSession(session.id, { selectedAddOnsJson: [] });
      await this.sendConfirmSummary(hotelId, session.id, session.whatsappPhone, business.name);
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Listo, quitamos los extras. Revisa el resumen actualizado arriba.',
      );
      return;
    }

    if (/\b(fecha|dia)\b/.test(normalized) || this.looksLikeDateChange(text)) {
      const parsedDate = parseRestaurantBookingDate(text);
      if (parsedDate) {
        return this.applyBookingDateChange(hotelId, session, parsedDate);
      }
      await this.updateSession(session.id, { state: 'rest_collecting_date' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¿Para qué *fecha* quieres la reserva?\n\nEjemplos: *domingo*, *28 de junio*, *mañana*',
      );
      return;
    }

    if (/\b(horario|hora)\b/.test(normalized)) {
      return this.applyBookingTimeChange(hotelId, session);
    }

    if (/\b(personas?|comensales|pax|gente)\b/.test(normalized)) {
      const partySize = this.parsePartySize(text);
      if (partySize) {
        return this.applyPartySizeChange(hotelId, session, partySize);
      }
      await this.updateSession(session.id, { state: 'rest_collecting_party' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¿Cuántas *personas* serán? (ej: *4* o *4 personas*)',
      );
      return;
    }

    if (/\b(extras?|adicionales?)\b/.test(normalized)) {
      return this.applyAddonsChange(hotelId, session);
    }

    if (/\b(zona|ambiente|mesa|terraza)\b/.test(normalized)) {
      return this.applyZoneChange(hotelId, session);
    }

    const partySize = this.parsePartySize(text);
    if (partySize && /^\d+$/.test(text.trim())) {
      return this.applyPartySizeChange(hotelId, session, partySize);
    }

    const parsedDate = parseRestaurantBookingDate(text);
    if (parsedDate) {
      return this.applyBookingDateChange(hotelId, session, parsedDate);
    }

    if (this.wantsBookingChange(normalized)) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¿Qué deseas modificar?\n\n' +
          '• *Fecha* — escribe la nueva fecha (ej: *domingo*)\n' +
          '• *Personas* — escribe la cantidad (ej: *4 personas*)\n' +
          '• *Horario* — escribe *horario*\n' +
          '• *Extras* — escribe *extras*\n' +
          '• *Zona* — escribe *zona*\n' +
          '• *Quitar extras* — escribe *quitar extras*\n\n' +
          'Para empezar de cero escribe *menu*.\n' +
          'O pulsa *Confirmar reserva* en el mensaje anterior para finalizar.',
      );
      return;
    }

    await this.whatsapp.sendText(
      hotelId,
      session.whatsappPhone,
      'Pulsa *Confirmar reserva* en el mensaje anterior para finalizar.\n\n' +
        'Si deseas modificar algo, escribe *cambiar reserva*.\n' +
        'Para empezar de cero escribe *menu*.',
    );
  }

  private wantsBookingChange(normalized: string): boolean {
    return /\b(cambiar|cambair|modificar|editar|ajustar|corregir)\b/.test(normalized);
  }

  private looksLikeDateChange(text: string): boolean {
    const normalized = text
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado|hoy|manana)\b/.test(
      normalized,
    );
  }

  private async applyBookingDateChange(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    date: string,
  ) {
    try {
      const slots = await this.inventory.getAvailableTimeSlots(hotelId, date);
      if (!slots.length) {
        await this.whatsapp.sendText(
          hotelId,
          session.whatsappPhone,
          `No hay disponibilidad para el *${this.formatDisplayDate(date)}*. Prueba otra fecha.`,
        );
        return;
      }

      await this.updateSession(session.id, {
        bookingDate: date,
        bookingTime: null,
        selectedDiningZoneId: null,
        state: 'rest_collecting_time',
      });

      const msg = this.renderer.renderRestaurantTimeList(date, slots);
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Actualizamos la fecha a *${this.formatDisplayDate(date)}*. Elige un nuevo horario:`,
      );
      if (msg.type === 'text') {
        await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
      } else {
        await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fecha no válida';
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, message);
    }
  }

  private async applyBookingTimeChange(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const full = await this.getSession(session.id);
    if (!full.bookingDate) {
      await this.updateSession(session.id, { state: 'rest_collecting_date' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '¿Para qué *fecha* quieres la reserva?',
      );
      return;
    }

    const slots = await this.inventory.getAvailableTimeSlots(hotelId, full.bookingDate);
    if (!slots.length) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `No hay horarios disponibles para *${this.formatDisplayDate(full.bookingDate)}*.`,
      );
      return;
    }

    await this.updateSession(session.id, {
      bookingTime: null,
      selectedDiningZoneId: null,
      state: 'rest_collecting_time',
    });

    const msg = this.renderer.renderRestaurantTimeList(full.bookingDate, slots);
    await this.whatsapp.sendText(
      hotelId,
      session.whatsappPhone,
      'Elige un nuevo *horario* para tu reserva:',
    );
    if (msg.type === 'text') {
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
    } else {
      await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
    }
  }

  private async applyPartySizeChange(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    partySize: number,
  ) {
    const full = await this.getSession(session.id);
    if (!full.bookingDate || !full.bookingTime) {
      await this.updateSession(session.id, { partySize, state: 'rest_collecting_date' });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Anoté *${partySize}* persona${partySize > 1 ? 's' : ''}. ¿Para qué *fecha* quieres reservar?`,
      );
      return;
    }

    const zones = await this.inventory.getAvailableZones(
      hotelId,
      full.bookingDate,
      full.bookingTime,
      partySize,
    );

    if (!zones.length) {
      const limits = await this.inventory.getPartySizeLimits(hotelId);
      let message: string;
      if (limits && partySize > limits.max) {
        message =
          `No hay zonas para *${partySize}* persona${partySize > 1 ? 's' : ''}. ` +
          `El máximo permitido por reserva es *${limits.max}* persona${limits.max > 1 ? 's' : ''}.`;
      } else if (limits && partySize < limits.min) {
        message =
          `El mínimo para reservar es *${limits.min}* persona${limits.min > 1 ? 's' : ''}.`;
      } else {
        message =
          `No hay disponibilidad para *${partySize}* persona${partySize > 1 ? 's' : ''} ` +
          `a las ${full.bookingTime}. Prueba otro horario.`;
      }
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, message);
      return;
    }

    await this.updateSession(session.id, {
      partySize,
      selectedDiningZoneId: null,
      state: 'rest_selecting_zone',
    });

    const msg = this.renderer.renderRestaurantZoneList(zones);
    await this.whatsapp.sendText(
      hotelId,
      session.whatsappPhone,
      `Actualizamos a *${partySize}* persona${partySize > 1 ? 's' : ''}. Elige la zona:`,
    );
    if (msg.type === 'text') {
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
    } else {
      await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
    }
  }

  private async applyAddonsChange(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const addons = await this.inventory.listAddOns(hotelId);
    const active = addons.filter((a) => a.is_active);
    if (!active.length) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No hay adicionales disponibles en este momento.',
      );
      return;
    }

    await this.updateSession(session.id, { state: 'rest_selecting_addons' });
    await this.whatsapp.sendInteractive(
      hotelId,
      session.whatsappPhone,
      this.renderer.renderRestaurantAddOnPrompt(),
    );
  }

  private async applyZoneChange(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const full = await this.getSession(session.id);
    if (!full.bookingDate || !full.bookingTime || !full.partySize) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Primero necesitamos fecha, horario y personas. Escribe *cambiar reserva* para ver opciones.',
      );
      return;
    }

    const zones = await this.inventory.getAvailableZones(
      hotelId,
      full.bookingDate,
      full.bookingTime,
      full.partySize,
    );

    if (!zones.length) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No hay zonas disponibles para ese horario. Prueba *cambiar horario* o *cambiar fecha*.',
      );
      return;
    }

    await this.updateSession(session.id, { state: 'rest_selecting_zone' });
    const msg = this.renderer.renderRestaurantZoneList(zones);
    await this.whatsapp.sendText(
      hotelId,
      session.whatsappPhone,
      'Elige la *zona* para tu reserva:',
    );
    if (msg.type === 'text') {
      await this.whatsapp.sendText(hotelId, session.whatsappPhone, msg.text.body);
    } else {
      await this.whatsapp.sendInteractive(hotelId, session.whatsappPhone, msg);
    }
  }

  private async handleGuestInfoInput(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    text: string,
    business: { name: string },
  ) {
    const parsed = this.parseGuestNameAndRequests(text);
    if (!parsed) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'Necesito al menos tu nombre y apellido. Ejemplo: *María García*',
      );
      return;
    }

    await this.updateSession(session.id, {
      state: 'rest_confirming',
      contextJson: {
        guestFirstName: parsed.firstName,
        guestLastName: parsed.lastName,
        specialRequests: parsed.specialRequests ?? null,
      },
    });

    await this.sendConfirmSummary(hotelId, session.id, session.whatsappPhone, business.name);
  }

  private async sendConfirmSummary(
    hotelId: string,
    sessionId: string,
    phone: string,
    businessName: string,
  ) {
    const full = await this.getSession(sessionId);
    const ctx = (full.contextJson ?? {}) as {
      guestFirstName?: string;
      guestLastName?: string;
      specialRequests?: string | null;
    };

    if (
      !full.bookingDate ||
      !full.bookingTime ||
      !full.partySize ||
      !full.selectedDiningZoneId ||
      !full.occasionType ||
      !ctx.guestFirstName
    ) {
      return this.startBooking(hotelId, sessionId, phone);
    }

    const settings = await this.inventory.getSettings(hotelId);
    const selectedAddons = this.getSelectedAddOns(full.selectedAddOnsJson);
    const addonIds = selectedAddons.map((a) => a.id);
    const quote = await this.inventory.buildQuote(hotelId, {
      dining_zone_id: full.selectedDiningZoneId,
      date: full.bookingDate,
      time: full.bookingTime,
      party_size: full.partySize,
      addon_ids: addonIds,
    });

    const zones = await this.inventory.listZones(hotelId);
    const zone = zones.find((z) => z.id === full.selectedDiningZoneId);
    const occasion =
      RESTAURANT_OCCASION_LABELS[full.occasionType as RestaurantOccasion] ??
      full.occasionType;

    const guestName = [ctx.guestFirstName, ctx.guestLastName].filter(Boolean).join(' ');
    const requiresPayment = settings.require_payment && quote.total > 0;
    const reservationTotal =
      quote.reservation_fee + quote.price_per_guest * quote.party_size;

    const msg = this.renderer.renderRestaurantConfirmSummary({
      businessName,
      date: full.bookingDate,
      time: full.bookingTime,
      zoneName: zone?.name ?? 'Mesa',
      partySize: full.partySize,
      occasionLabel: occasion,
      reservationTotal,
      addons: selectedAddons.map((a) => ({ name: a.name, price: a.price * a.quantity })),
      guestName,
      total: quote.total,
      currency: quote.currency,
      requiresPayment,
      summaryFooterMessage: settings.summary_footer_message,
      summaryFooterLink: settings.summary_footer_link,
    });

    await this.whatsapp.sendInteractive(hotelId, phone, msg);
  }

  private async confirmBooking(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
    business: { name: string },
  ) {
    try {
      await this.subscription.assertCanCreateReservation(hotelId);
    } catch (error) {
      if (error instanceof SubscriptionLimitError) {
        await this.whatsapp.sendText(hotelId, session.whatsappPhone, error.message);
        return;
      }
      throw error;
    }

    const full = await this.getSession(session.id);
    const ctx = (full.contextJson ?? {}) as {
      guestFirstName?: string;
      guestLastName?: string;
      specialRequests?: string | null;
    };

    if (
      !full.bookingDate ||
      !full.bookingTime ||
      !full.partySize ||
      !full.selectedDiningZoneId ||
      !full.occasionType ||
      !ctx.guestFirstName
    ) {
      return this.startBooking(hotelId, session.id, session.whatsappPhone);
    }

    try {
      await this.inventory.assertZoneAvailable(
        hotelId,
        full.selectedDiningZoneId,
        full.bookingDate,
        full.bookingTime,
        full.partySize,
      );
    } catch {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'La disponibilidad cambió. Escribe *reservar* para intentar de nuevo.',
      );
      return;
    }

    const settings = await this.inventory.getSettings(hotelId);
    const addonIds = this.getSelectedAddOnIds(full.selectedAddOnsJson);
    const quote = await this.inventory.buildQuote(hotelId, {
      dining_zone_id: full.selectedDiningZoneId,
      date: full.bookingDate,
      time: full.bookingTime,
      party_size: full.partySize,
      addon_ids: addonIds,
    });

    const zones = await this.inventory.listZones(hotelId);
    const zone = zones.find((z) => z.id === full.selectedDiningZoneId);
    const zoneName = zone?.name ?? 'Mesa';

    const idempotencyKey = `wa-rest-${hotelId}-${session.whatsappPhone}-${full.selectedDiningZoneId}-${full.bookingDate}-${full.bookingTime}`;
    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
    });

    if (existing?.status === 'confirmed') {
      await this.updateSession(session.id, {
        state: 'confirmed',
        reservationId: existing.id,
      });
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        '✅ Ya tienes una reserva confirmada para ese horario.',
      );
      return;
    }

    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );
    const requiresPayment = settings.require_payment && quote.total > 0;
    const countryCode = parseGuestCountryCode(session.whatsappPhone);
    const addonsJson = this.getSelectedAddOns(full.selectedAddOnsJson);

    let reservation = existing;
    if (
      reservation &&
      ['hold', 'payment_pending'].includes(reservation.status)
    ) {
      reservation = await this.prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          totalAmount: quote.total,
          currency: quote.currency,
          guestFirstName: ctx.guestFirstName,
          guestLastName: ctx.guestLastName ?? ctx.guestFirstName,
          guestPhone: session.whatsappPhone,
          guestEmail: this.checkout.resolvePaymentGuestEmail({
            guestEmail: reservation.guestEmail,
            guestPhone: session.whatsappPhone,
            id: reservation.id,
          }),
          specialRequests: ctx.specialRequests,
          addOnsJson: addonsJson.length ? (addonsJson as object) : Prisma.DbNull,
          holdExpiresAt: requiresPayment
            ? new Date(Date.now() + holdTtl * 60 * 1000)
            : null,
          status: requiresPayment ? 'hold' : 'confirmed',
        },
      });
    } else if (!reservation || reservation.status === 'cancelled') {
      const paymentAccessToken = this.checkout.generatePaymentAccessToken();
      reservation = await this.prisma.reservation.create({
        data: {
          hotelId,
          whatsappSessionId: session.id,
          idempotencyKey,
          status: requiresPayment ? 'hold' : 'confirmed',
          bookingKind: 'restaurant_table',
          diningZoneId: full.selectedDiningZoneId,
          diningZoneName: zoneName,
          bookingDate: full.bookingDate,
          bookingTime: full.bookingTime,
          partySize: full.partySize,
          occasionType: full.occasionType,
          guestCountryCode: countryCode,
          specialRequests: ctx.specialRequests,
          addOnsJson: addonsJson.length ? (addonsJson as object) : Prisma.DbNull,
          totalAmount: quote.total,
          currency: quote.currency,
          holdExpiresAt: requiresPayment
            ? new Date(Date.now() + holdTtl * 60 * 1000)
            : null,
          guestFirstName: ctx.guestFirstName,
          guestLastName: ctx.guestLastName ?? ctx.guestFirstName,
          guestPhone: session.whatsappPhone,
          guestEmail: this.checkout.resolvePaymentGuestEmail({
            guestPhone: session.whatsappPhone,
            id: idempotencyKey,
          }),
          paymentAccessToken,
        },
      });

      await this.subscription.recordBillableReservation(hotelId, reservation.id);
    }

    if (!requiresPayment) {
      await this.updateSession(session.id, {
        state: 'confirmed',
        reservationId: reservation.id,
      });
      await this.sendRestaurantConfirmed(
        hotelId,
        session.whatsappPhone,
        reservation,
        settings,
      );
      return;
    }

    await this.updateSession(session.id, {
      state: 'awaiting_payment',
      reservationId: reservation.id,
    });

    await this.sendRestaurantPaymentSummary(
      hotelId,
      session.whatsappPhone,
      reservation,
      holdTtl,
      business.name,
    );
  }

  private async sendRestaurantConfirmed(
    hotelId: string,
    phone: string,
    reservation: {
      id: string;
      guestFirstName: string | null;
      diningZoneName: string | null;
      bookingDate: string | null;
      bookingTime: string | null;
      partySize: number | null;
    },
    settings: { post_payment_message: string; post_payment_link: string },
  ) {
    const msg = this.renderer.renderRestaurantConfirmed({
      guestName: reservation.guestFirstName ?? 'Cliente',
      reservationRef: reservation.id.slice(-8).toUpperCase(),
      date: reservation.bookingDate ?? '',
      time: reservation.bookingTime ?? '',
      zoneName: reservation.diningZoneName ?? 'Mesa',
      partySize: reservation.partySize ?? 1,
      postPaymentMessage: settings.post_payment_message,
      postPaymentLink: settings.post_payment_link,
    });
    await this.whatsapp.sendText(hotelId, phone, msg.text.body);
  }

  private async sendRestaurantPaymentSummary(
    hotelId: string,
    phone: string,
    reservation: {
      id: string;
      guestFirstName: string | null;
      guestLastName: string | null;
      guestPhone: string | null;
      diningZoneName: string | null;
      bookingDate: string | null;
      bookingTime: string | null;
      partySize: number | null;
      occasionType: string | null;
      totalAmount: number | null;
      currency: string | null;
      paymentLink: string | null;
      paymentAccessToken?: string | null;
    },
    holdTtl: number,
    businessName: string,
  ) {
    const paymentResult = await this.checkout.ensureReservationPayment(
      hotelId,
      reservation.id,
    );
    reservation = paymentResult.reservation;

    const guestName = [reservation.guestFirstName, reservation.guestLastName]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Cliente';

    const occasion =
      RESTAURANT_OCCASION_LABELS[
        (reservation.occasionType ?? 'other') as RestaurantOccasion
      ] ?? reservation.occasionType ?? 'Visita';

    const receipt = this.renderer.renderRestaurantReservationReceipt({
      businessName,
      reservationRef: reservation.id.slice(-8).toUpperCase(),
      guestName,
      guestPhone: reservation.guestPhone ?? undefined,
      zoneName: reservation.diningZoneName ?? 'Mesa',
      date: reservation.bookingDate ?? '',
      time: reservation.bookingTime ?? '',
      partySize: reservation.partySize ?? 1,
      occasionLabel: occasion,
      amount: reservation.totalAmount ?? 0,
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
          '⚠️ No pudimos generar el link de pago. Configura pagos en el panel e intenta escribiendo *pagar*.',
      );
    }
  }

  private async resendPaymentLink(
    hotelId: string,
    session: { id: string; whatsappPhone: string },
  ) {
    const full = await this.getSession(session.id);
    const reservationId = full.reservationId;
    if (!reservationId) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No encontré una reserva pendiente. Escribe *reservar* para empezar.',
      );
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation || !['hold', 'payment_pending'].includes(reservation.status)) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        'No hay reserva activa. Escribe *reservar* para iniciar.',
      );
      return;
    }

    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true },
    });

    const holdTtl = parseInt(
      process.env.ROOM_HOLD_TTL_MINUTES ?? String(DEFAULT_ROOM_HOLD_TTL_MINUTES),
      10,
    );

    await this.sendRestaurantPaymentSummary(
      hotelId,
      session.whatsappPhone,
      reservation,
      holdTtl,
      hotel.name,
    );
  }

  private async sendWelcomeMenu(
    hotelId: string,
    sessionId: string,
    phone: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    await this.updateSession(sessionId, {
      state: 'idle',
      contextJson: { seenWelcome: true },
    });
    const menu = this.renderer.renderWelcomeMenu(business);
    await this.whatsapp.sendInteractive(hotelId, phone, menu);
  }

  private async returnToWelcomeMenu(
    hotelId: string,
    sessionId: string,
    phone: string,
    business: { name: string; vertical: 'restaurant' },
  ) {
    await this.resetRestaurantSession(sessionId);
    await this.sendWelcomeMenu(hotelId, sessionId, phone, business);
  }

  private async resetRestaurantSession(sessionId: string) {
    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: 'idle',
        bookingDate: null,
        bookingTime: null,
        partySize: null,
        selectedDiningZoneId: null,
        occasionType: null,
        selectedAddOnsJson: Prisma.DbNull,
        reservationId: null,
        contextJson: Prisma.DbNull,
      },
    });
  }

  private parsePartySize(text: string): number | undefined {
    const bare = text.trim().match(/^(\d+)$/);
    if (bare) {
      const n = parseInt(bare[1], 10);
      if (n > 0 && n < 100) return n;
    }
    const paraMatch = text.match(/(?:para|de)\s+(\d+)(?:\s*(?:personas?|pax|comensales?))?/i);
    if (paraMatch) {
      const n = parseInt(paraMatch[1], 10);
      if (n > 0 && n < 100) return n;
    }
    const match = text.match(/(\d+)\s*(?:personas?|pax|comensales?)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > 0 && n < 100) return n;
    }
    if (/pareja/i.test(text)) return 2;
    return undefined;
  }

  private parseGuestNameAndRequests(text: string): {
    firstName: string;
    lastName: string;
    specialRequests?: string;
  } | null {
    const trimmed = text.trim();
    const parts = trimmed.split(/\n|,/).map((p) => p.trim()).filter(Boolean);
    const nameLine = parts[0] ?? trimmed;
    const nameParts = nameLine.split(/\s+/).filter(Boolean);
    if (nameParts.length < 1) return null;

    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const specialRequests = parts.slice(1).join('\n').trim() || undefined;

    return { firstName, lastName, specialRequests };
  }

  private getSelectedAddOnIds(json: unknown): string[] {
    const items = this.getSelectedAddOns(json);
    return items.map((a) => a.id);
  }

  private getSelectedAddOns(json: unknown): RestaurantAddOnSelection[] {
    if (!Array.isArray(json)) return [];
    return json.filter(
      (item): item is RestaurantAddOnSelection =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        typeof (item as RestaurantAddOnSelection).id === 'string',
    );
  }

  private wantsSessionReset(text: string): boolean {
    return wantsWhatsAppSessionReset(text);
  }

  private wantsNewBooking(text: string): boolean {
    return /reservar|reserva de mesa|reserva una mesa|mesa para|quiero una mesa|booking|book/i.test(
      text,
    );
  }

  private isRatesQuery(text: string): boolean {
    if (/reservar|reserva una mesa|mesa para|quiero una mesa/.test(text)) return false;
    return /tarifa|precio|costo|cuesta|cuánto|cuanto|valor|cuánto cuesta/.test(text);
  }

  private async hasSeenWelcome(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    const ctx = session.contextJson as { seenWelcome?: boolean } | null;
    return ctx?.seenWelcome === true;
  }

  private async getSession(id: string) {
    return this.prisma.conversationSession.findUniqueOrThrow({ where: { id } });
  }

  private async updateSession(
    id: string,
    data: Partial<{
      state: string;
      bookingDate: string | null;
      bookingTime: string | null;
      partySize: number;
      selectedDiningZoneId: string | null;
      occasionType: string;
      selectedAddOnsJson: RestaurantAddOnSelection[] | null;
      reservationId: string | null;
      contextJson: Record<string, unknown> | null;
    }>,
  ) {
    const { selectedAddOnsJson, contextJson, ...rest } = data;
    return this.prisma.conversationSession.update({
      where: { id },
      data: {
        ...rest,
        ...(selectedAddOnsJson !== undefined && {
          selectedAddOnsJson:
            selectedAddOnsJson === null
              ? Prisma.DbNull
              : (selectedAddOnsJson as unknown as Prisma.InputJsonValue),
        }),
        ...(contextJson !== undefined && {
          contextJson:
            contextJson === null
              ? Prisma.DbNull
              : (contextJson as Prisma.InputJsonValue),
        }),
      },
    });
  }
}
