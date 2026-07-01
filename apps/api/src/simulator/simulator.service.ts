import { Injectable } from '@nestjs/common';
import {
  BUSINESS_VERTICAL_LABELS,
  RESTAURANT_OCCASION_LABELS,
  type BusinessVertical,
  type RestaurantOccasion,
  isBusinessVertical,
  matchTimeToAvailableSlot,
  parseRestaurantBookingDate,
  parseRestaurantBookingIntent,
  parseRestaurantBookingTime,
  parsePartySizeFromText,
  supportsTransactionalFlow,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../conversation/ai.service';
import { RestaurantInventoryService } from '../restaurant/restaurant-inventory.service';

export type SimulatorSession = {
  state: string;
  bookingDate?: string;
  bookingTime?: string;
  partySize?: number;
  selectedDiningZoneId?: string;
  occasionType?: string;
  selectedAddOnIds?: string[];
  guestFirstName?: string;
  guestLastName?: string;
  pendingTimeSlots?: string[];
  checkIn?: string;
  checkOut?: string;
  adults?: number;
};

const RESTAURANT_FLOW_STATES = new Set([
  'rest_collecting_date',
  'rest_collecting_time',
  'rest_collecting_party',
  'rest_selecting_zone',
  'rest_collecting_occasion',
  'rest_selecting_addons',
  'rest_collecting_guest_info',
  'rest_confirming',
]);

@Injectable()
export class SimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly restaurant: RestaurantInventoryService,
  ) {}

  async bootstrap(hotelId: string) {
    const business = await this.getBusiness(hotelId);
    const inventorySummary = await this.buildInventorySummary(hotelId, business.vertical);
    const suggestions = this.defaultSuggestions(business.vertical);

    return {
      business_name: business.name,
      business_vertical: business.vertical,
      welcome_message: this.welcomeMessage(business),
      inventory_summary: inventorySummary,
      suggestions,
    };
  }

  async chat(
    hotelId: string,
    message: string,
    session: SimulatorSession = { state: 'idle' },
  ): Promise<{ replies: string[]; session: SimulatorSession; suggestions: string[] }> {
    const business = await this.getBusiness(hotelId);
    const text = message.trim();
    const normalized = text.toLowerCase();

    if (this.isReset(normalized)) {
      return {
        replies: [this.welcomeMessage(business)],
        session: { state: 'idle' },
        suggestions: this.defaultSuggestions(business.vertical),
      };
    }

    if (session.state === 'idle' && this.isBookingIntent(normalized, business.vertical)) {
      if (!supportsTransactionalFlow(business.vertical)) {
        return {
          replies: [
            `Las reservas por chat para ${BUSINESS_VERTICAL_LABELS[business.vertical].toLowerCase()} estarán disponibles pronto. Mientras tanto puedo responder preguntas sobre el negocio.`,
          ],
          session: { state: 'faq' },
          suggestions: ['¿Cuál es el horario?', '¿Dónde están ubicados?'],
        };
      }
      if (business.vertical === 'restaurant') {
        const intent = parseRestaurantBookingIntent(text);
        if (intent.date || intent.time || intent.partySize) {
          if (intent.date) {
            const dateStep = await this.handleRestaurantDate(hotelId, text, {
              state: 'rest_collecting_date',
              ...(intent.partySize ? { partySize: intent.partySize } : {}),
            });
            if (
              intent.partySize &&
              intent.time &&
              dateStep.session.bookingDate &&
              dateStep.session.bookingTime
            ) {
              return this.handleRestaurantParty(hotelId, String(intent.partySize), {
                ...dateStep.session,
                partySize: intent.partySize,
              });
            }
            return dateStep;
          }
          if (intent.partySize) {
            return {
              replies: [
                `¡Perfecto! Anoté *${intent.partySize}* personas. ¿Para qué *fecha* y a qué *hora*?\n\nEjemplo: *domingo 8pm*`,
              ],
              session: { state: 'rest_collecting_date', partySize: intent.partySize },
              suggestions: ['domingo 8pm', 'mañana 20:00', 'menu'],
            };
          }
        }
        return this.startRestaurantBooking(hotelId, business);
      }
      return {
        replies: [
          'Para simular una reserva de habitación escribe fechas y huéspedes, por ejemplo: *2 personas del 28 al 29 de junio*.\n\n_Escribe *menu* para volver al inicio._',
        ],
        session: { state: 'collecting_dates' },
        suggestions: ['2 personas del 28 al 29 de junio', 'menu'],
      };
    }

    if (business.vertical === 'restaurant' && RESTAURANT_FLOW_STATES.has(session.state)) {
      return this.advanceRestaurantFlow(hotelId, business, text, session);
    }

    if (this.isRatesQuery(normalized) && business.vertical === 'restaurant') {
      const summary = await this.buildRestaurantRatesAnswer(hotelId, text);
      return {
        replies: [summary],
        session,
        suggestions: ['Reservar mesa', 'menu'],
      };
    }

    if (session.state === 'collecting_dates' && business.vertical === 'hotel') {
      const reply = await this.buildHotelAvailabilityHint(hotelId, text);
      return {
        replies: [reply],
        session: { state: 'idle' },
        suggestions: ['menu', '¿Aceptan mascotas?'],
      };
    }

    const operationalContext = await this.buildOperationalContext(hotelId, business.vertical);
    const aiReply = await this.ai.generateResponse(
      hotelId,
      text,
      `Modo simulador. Estado: ${session.state}.\n\nDATOS OPERATIVOS DEL NEGOCIO (usa estos datos para precios, zonas, horarios y capacidad):\n${operationalContext}`,
      business,
    );

    return {
      replies: [aiReply],
      session: { state: session.state === 'idle' ? 'faq' : session.state },
      suggestions: this.defaultSuggestions(business.vertical),
    };
  }

  private async startRestaurantBooking(
    hotelId: string,
    business: { name: string; vertical: BusinessVertical },
  ) {
    const zones = await this.restaurant.listZones(hotelId);
    if (!zones.filter((z) => z.is_active).length) {
      return {
        replies: [
          'Aún no hay zonas configuradas en Inventario. Agrega al menos una zona/mesa para simular reservas.',
        ],
        session: { state: 'idle' } satisfies SimulatorSession,
        suggestions: ['menu'],
      };
    }

    return {
      replies: [
        `¡Perfecto! Simulación de reserva en *${business.name}* 📅\n\n` +
          'Cuéntame *fecha*, *hora* y *personas* en un solo mensaje o paso a paso.\n\n' +
          'Ejemplo: *domingo 8pm 4 personas*',
      ],
      session: { state: 'rest_collecting_date' },
      suggestions: ['domingo 8pm 4 personas', 'mañana 20:00', 'menu'],
    };
  }

  private async advanceRestaurantFlow(
    hotelId: string,
    business: { name: string; vertical: BusinessVertical },
    text: string,
    session: SimulatorSession,
  ): Promise<{ replies: string[]; session: SimulatorSession; suggestions: string[] }> {
    switch (session.state) {
      case 'rest_collecting_date':
        return this.handleRestaurantDate(hotelId, text, session);
      case 'rest_collecting_time':
        return this.handleRestaurantTime(hotelId, text, session);
      case 'rest_collecting_party':
        return this.handleRestaurantParty(hotelId, text, session);
      case 'rest_selecting_zone':
        return this.handleRestaurantZone(hotelId, text, session);
      case 'rest_collecting_occasion':
        return this.handleRestaurantOccasion(text, session);
      case 'rest_selecting_addons':
        return this.handleRestaurantAddons(hotelId, text, session);
      case 'rest_collecting_guest_info':
        return this.handleRestaurantGuestInfo(hotelId, business.name, text, session);
      case 'rest_confirming':
        if (/^(si|sí|confirmar|ok|dale)$/i.test(text.trim())) {
          return this.confirmRestaurantBooking(hotelId, business.name, session);
        }
        return {
          replies: ['Escribe *confirmar* para finalizar la simulación o *menu* para cancelar.'],
          session,
          suggestions: ['confirmar', 'menu'],
        };
      default:
        return {
          replies: [this.welcomeMessage(business)],
          session: { state: 'idle' },
          suggestions: this.defaultSuggestions(business.vertical),
        };
    }
  }

  private async handleRestaurantDate(
    hotelId: string,
    text: string,
    session: SimulatorSession,
  ) {
    const intent = parseRestaurantBookingIntent(text);
    const date = intent.date ?? parseRestaurantBookingDate(text);
    if (!date) {
      return {
        replies: [
          'No entendí la fecha. Prueba: *domingo*, *15 de julio*, *mañana*\n\nO todo junto: *domingo 8pm 4 personas*',
        ],
        session,
        suggestions: ['domingo 8pm 4 personas', 'mañana', 'menu'],
      };
    }

    try {
      const slots = await this.restaurant.getAvailableTimeSlots(hotelId, date);
      if (!slots.length) {
        return {
          replies: [`No hay horarios disponibles para el *${date}*. Prueba otra fecha.`],
          session: { ...session, state: 'rest_collecting_date' },
          suggestions: ['menu'],
        };
      }

      const partySize = intent.partySize ?? session.partySize;

      if (intent.time) {
        const { slot, snapped } = matchTimeToAvailableSlot(intent.time, slots);
        if (!slot) {
          return {
            replies: [
              `Fecha *${date}* anotada. El horario *${intent.time}* no está disponible.\n\n${this.buildTimePrompt(slots)}`,
            ],
            session: {
              ...session,
              bookingDate: date,
              partySize,
              state: 'rest_collecting_time',
              pendingTimeSlots: slots,
            },
            suggestions: slots.slice(0, 3),
          };
        }

        const snapNote = snapped ? ` (ajustado al más cercano: *${slot}*)` : '';
        if (partySize) {
          return this.handleRestaurantParty(hotelId, String(partySize), {
            ...session,
            bookingDate: date,
            bookingTime: slot,
            partySize,
            state: 'rest_collecting_party',
            pendingTimeSlots: undefined,
          });
        }

        return {
          replies: [`Fecha *${date}*, horario *${slot}*${snapNote}. ¿Cuántas *personas* serán?`],
          session: {
            ...session,
            bookingDate: date,
            bookingTime: slot,
            state: 'rest_collecting_party',
            pendingTimeSlots: undefined,
          },
          suggestions: ['2', '4 personas', '6 personas'],
        };
      }

      return {
        replies: [
          partySize
            ? `Fecha *${date}* y *${partySize}* personas anotadas.\n\n${this.buildTimePrompt(slots)}`
            : `Fecha *${date}* anotada.\n\n${this.buildTimePrompt(slots)}`,
        ],
        session: {
          ...session,
          bookingDate: date,
          partySize,
          state: 'rest_collecting_time',
          pendingTimeSlots: slots,
        },
        suggestions: slots.slice(0, 3),
      };
    } catch (error) {
      return {
        replies: [error instanceof Error ? error.message : 'Fecha no válida'],
        session: { ...session, state: 'rest_collecting_date' },
        suggestions: ['menu'],
      };
    }
  }

  private buildTimePrompt(slots: string[]): string {
    if (!slots.length) return 'No hay horarios disponibles.';
    const first = slots[0];
    const last = slots[slots.length - 1];
    const examples =
      slots.length <= 3
        ? slots.join(', ')
        : `${slots[0]}, ${slots[Math.floor(slots.length / 2)]}, ${slots[slots.length - 1]}`;
    return `¿A qué *hora*?\n\nHorarios disponibles: *${first}* – *${last}*\nEjemplos: ${examples}`;
  }

  private async handleRestaurantTime(
    hotelId: string,
    text: string,
    session: SimulatorSession,
  ) {
    if (!session.bookingDate) {
      return this.handleRestaurantDate(hotelId, text, session);
    }

    const slots =
      session.pendingTimeSlots ??
      (await this.restaurant.getAvailableTimeSlots(hotelId, session.bookingDate));

    const intent = parseRestaurantBookingIntent(text);
    if (intent.date && intent.date !== session.bookingDate) {
      return this.handleRestaurantDate(hotelId, text, session);
    }

    const requested = parseRestaurantBookingTime(text) ?? this.parseTimeChoice(text, slots);
    if (!requested) {
      return {
        replies: [`No entendí la hora.\n\n${this.buildTimePrompt(slots)}`],
        session: { ...session, pendingTimeSlots: slots },
        suggestions: slots.slice(0, 3),
      };
    }

    const { slot, snapped } = matchTimeToAvailableSlot(requested, slots);
    if (!slot) {
      return {
        replies: [
          `El horario *${requested}* no está disponible.\n\n${this.buildTimePrompt(slots)}`,
        ],
        session: { ...session, pendingTimeSlots: slots },
        suggestions: slots.slice(0, 3),
      };
    }

    const partySize = intent.partySize ?? session.partySize;
    const snapNote = snapped ? ' (ajustado al más cercano)' : '';

    if (partySize) {
      return this.handleRestaurantParty(hotelId, String(partySize), {
        ...session,
        bookingTime: slot,
        partySize,
        state: 'rest_collecting_party',
        pendingTimeSlots: undefined,
      });
    }

    return {
      replies: [`Horario *${slot}*${snapNote} seleccionado. ¿Cuántas *personas* serán?`],
      session: {
        ...session,
        bookingTime: slot,
        state: 'rest_collecting_party',
        pendingTimeSlots: undefined,
      },
      suggestions: ['2', '4 personas', '6 personas'],
    };
  }

  private async handleRestaurantParty(
    hotelId: string,
    text: string,
    session: SimulatorSession,
  ) {
    const partySize = this.parsePartySize(text);
    if (!partySize || !session.bookingDate || !session.bookingTime) {
      return {
        replies: ['Indica cuántas personas (ej: *4* o *4 personas*)'],
        session,
        suggestions: ['2', '4 personas'],
      };
    }

    const zones = await this.restaurant.getAvailableZones(
      hotelId,
      session.bookingDate,
      session.bookingTime,
      partySize,
    );

    if (!zones.length) {
      return {
        replies: [
          `No hay zonas para *${partySize}* personas a las ${session.bookingTime}. Prueba otro horario o cantidad.`,
        ],
        session: { ...session, partySize, state: 'rest_collecting_party' },
        suggestions: ['menu'],
      };
    }

    const lines = zones
      .map(
        (z, i) =>
          `${i + 1}. *${z.name}* — ${z.quote.currency} ${z.quote.total.toLocaleString('es-CO')} total`,
      )
      .join('\n');

    return {
      replies: [
        `Zonas disponibles:\n\n${lines}\n\nResponde con el *número* o *nombre* de la zona.`,
      ],
      session: { ...session, partySize, state: 'rest_selecting_zone' },
      suggestions: zones.slice(0, 2).map((z) => z.name),
    };
  }

  private async handleRestaurantZone(
    hotelId: string,
    text: string,
    session: SimulatorSession,
  ) {
    if (!session.bookingDate || !session.bookingTime || !session.partySize) {
      return this.startRestaurantBooking(hotelId, { name: '', vertical: 'restaurant' });
    }

    const zones = await this.restaurant.getAvailableZones(
      hotelId,
      session.bookingDate,
      session.bookingTime,
      session.partySize,
    );

    const zone = this.pickFromList(text, zones, (z) => z.name);
    if (!zone) {
      return {
        replies: ['No encontré esa zona. Responde con el número o nombre exacto.'],
        session,
        suggestions: zones.map((z) => z.name).slice(0, 3),
      };
    }

    const occasions = Object.entries(RESTAURANT_OCCASION_LABELS)
      .map(([key, label], i) => `${i + 1}. ${label}`)
      .join('\n');

    return {
      replies: [
        `Zona *${zone.name}* seleccionada.\n\n¿Cuál es el motivo de la visita?\n\n${occasions}\n\nResponde con el número o nombre.`,
      ],
      session: { ...session, selectedDiningZoneId: zone.id, state: 'rest_collecting_occasion' },
      suggestions: ['Cumpleaños', 'Cena romántica', 'Celebración'],
    };
  }

  private handleRestaurantOccasion(text: string, session: SimulatorSession) {
    const entries = Object.entries(RESTAURANT_OCCASION_LABELS);
    const match = this.pickFromList(
      text,
      entries.map(([key, label]) => ({ key, label })),
      (o) => o.label,
    );

    if (!match) {
      return {
        replies: ['Elige un motivo de la lista (ej: *Cumpleaños* o *1*)'],
        session,
        suggestions: ['Cumpleaños', 'Aniversario', 'Otro'],
      };
    }

    return {
      replies: [
        `Motivo: *${match.label}*.\n\n¿Deseas agregar un adicional?\n` +
          `Escribe *adicionales* para ver la lista o *reservar* para continuar sin extras.`,
      ],
      session: { ...session, occasionType: match.key, state: 'rest_selecting_addons', selectedAddOnIds: [] },
      suggestions: ['adicionales', 'reservar'],
    };
  }

  private async handleRestaurantAddons(
    hotelId: string,
    text: string,
    session: SimulatorSession,
  ) {
    if (/^(reservar|continuar|sin extras|no|ninguno)$/i.test(text.trim())) {
      return {
        replies: [
          'Perfecto. Comparte tu *nombre y apellido*. Si tienes peticiones especiales, inclúyelas en el mismo mensaje.',
        ],
        session: { ...session, state: 'rest_collecting_guest_info' },
        suggestions: ['María García'],
      };
    }

    const addons = (await this.restaurant.listAddOns(hotelId)).filter((a) => a.is_active);
    if (/^adicionales?$/i.test(text.trim()) || !addons.some((a) => a.name.toLowerCase().includes(text.toLowerCase()))) {
      if (!addons.length) {
        return {
          replies: ['No hay adicionales. Escribe *reservar* para continuar.'],
          session: { ...session, state: 'rest_collecting_guest_info' },
          suggestions: ['reservar'],
        };
      }
      const list = addons
        .map((a, i) => `${i + 1}. *${a.name}* — ${a.currency} ${a.price.toLocaleString('es-CO')}`)
        .join('\n');
      return {
        replies: [
          `*Adicionales disponibles:*\n${list}\n\nResponde con el *número* o *nombre* del adicional, o *reservar* para continuar sin extras.`,
        ],
        session,
        suggestions: addons.slice(0, 3).map((a) => a.name).concat(['reservar']),
      };
    }

    const trimmed = text.trim();
    const byIndex = trimmed.match(/^(\d+)$/);
    const match = byIndex
      ? addons[Number(byIndex[1]) - 1]
      : addons.find((a) => a.name.toLowerCase().includes(trimmed.toLowerCase()));
    if (!match) {
      return {
        replies: ['No encontré ese adicional. Escribe *adicionales* para ver la lista o *reservar* para continuar.'],
        session,
        suggestions: ['adicionales', 'reservar'],
      };
    }

    return {
      replies: [
        `Agregamos *${match.name}*. Ahora comparte tu *nombre y apellido*.`,
      ],
      session: {
        ...session,
        selectedAddOnIds: [match.id],
        state: 'rest_collecting_guest_info',
      },
      suggestions: ['Juan Pérez'],
    };
  }

  private async handleRestaurantGuestInfo(
    hotelId: string,
    businessName: string,
    text: string,
    session: SimulatorSession,
  ) {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 1) {
      return {
        replies: ['Necesito al menos tu nombre. Ejemplo: *María García*'],
        session,
        suggestions: ['María García'],
      };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || firstName;
    const nextSession: SimulatorSession = {
      ...session,
      guestFirstName: firstName,
      guestLastName: lastName,
      state: 'rest_confirming',
    };

    const summary = await this.buildBookingSummary(hotelId, businessName, nextSession);
    return {
      replies: [
        `${summary}\n\n¿Confirmamos la simulación? Escribe *confirmar*.`,
      ],
      session: nextSession,
      suggestions: ['confirmar', 'menu'],
    };
  }

  private async confirmRestaurantBooking(
    hotelId: string,
    businessName: string,
    session: SimulatorSession,
  ) {
    const settings = await this.restaurant.getSettings(hotelId);
    const quote = await this.restaurant.buildQuote(hotelId, {
      dining_zone_id: session.selectedDiningZoneId!,
      date: session.bookingDate!,
      time: session.bookingTime!,
      party_size: session.partySize!,
      addon_ids: session.selectedAddOnIds ?? [],
    });

    const zones = await this.restaurant.listZones(hotelId);
    const zone = zones.find((z) => z.id === session.selectedDiningZoneId);
    const requiresPayment = settings.require_payment && quote.total > 0;

    let footer = requiresPayment
      ? `\n\n💳 En WhatsApp real se enviaría el link de pago (${quote.currency} ${quote.total.toLocaleString('es-CO')}).`
      : `\n\n✅ Reserva confirmada *sin cobro* (según tu configuración).`;

    if (settings.post_payment_message) {
      footer += `\n\n📋 *Indicaciones:* ${settings.post_payment_message}`;
    }

    return {
      replies: [
        `🎉 *Simulación completada*\n\n` +
          `🍽 ${businessName}\n` +
          `📍 ${zone?.name ?? 'Mesa'}\n` +
          `📅 ${session.bookingDate} · 🕐 ${session.bookingTime}\n` +
          `👥 ${session.partySize} personas\n` +
          `👤 ${session.guestFirstName} ${session.guestLastName}\n` +
          `💰 Total: ${quote.currency} ${quote.total.toLocaleString('es-CO')}` +
          footer +
          `\n\n_Escribe *menu* o *reservar* para probar de nuevo._`,
      ],
      session: { state: 'idle' },
      suggestions: ['menu', 'Reservar mesa', '¿Cuánto cuesta la reserva?'],
    };
  }

  private async buildBookingSummary(
    hotelId: string,
    businessName: string,
    session: SimulatorSession,
  ) {
    const settings = await this.restaurant.getSettings(hotelId);
    const quote = await this.restaurant.buildQuote(hotelId, {
      dining_zone_id: session.selectedDiningZoneId!,
      date: session.bookingDate!,
      time: session.bookingTime!,
      party_size: session.partySize!,
      addon_ids: session.selectedAddOnIds ?? [],
    });
    const zones = await this.restaurant.listZones(hotelId);
    const zone = zones.find((z) => z.id === session.selectedDiningZoneId);
    const occasion =
      RESTAURANT_OCCASION_LABELS[(session.occasionType ?? 'other') as RestaurantOccasion] ??
      session.occasionType;

    const reservationTotal =
      quote.reservation_fee + quote.price_per_guest * quote.party_size;
    const addons = await this.restaurant.listAddOns(hotelId);
    const selectedAddons = (session.selectedAddOnIds ?? [])
      .map((id) => addons.find((a) => a.id === id))
      .filter(Boolean);

    let pricing =
      `\n💵 *Valor reserva:* ${quote.currency} ${reservationTotal.toLocaleString('es-CO')}`;
    for (const addon of selectedAddons) {
      if (!addon) continue;
      pricing += `\n✨ *Extra (${addon.name}):* ${quote.currency} ${addon.price.toLocaleString('es-CO')}`;
    }
    pricing += `\n\n💰 *Total:* ${quote.currency} ${quote.total.toLocaleString('es-CO')}`;

    if (settings.summary_footer_message) {
      pricing += `\n\n📋 ${settings.summary_footer_message}`;
    }
    if (settings.summary_footer_link) {
      pricing += `\n\n🔗 ${settings.summary_footer_link}`;
    }

    return (
      `📋 *Resumen simulado*\n\n` +
      `🍽 ${businessName}\n` +
      `📅 ${session.bookingDate} · 🕐 ${session.bookingTime}\n` +
      `📍 ${zone?.name ?? 'Mesa'}\n` +
      `👥 ${session.partySize} personas\n` +
      `🎉 ${occasion}\n` +
      `👤 ${session.guestFirstName} ${session.guestLastName}` +
      pricing
    );
  }

  private async buildRestaurantRatesAnswer(hotelId: string, text: string) {
    const zones = (await this.restaurant.listZones(hotelId)).filter((z) => z.is_active);
    if (!zones.length) {
      return 'No hay zonas configuradas aún. Ve a *Inventario* y crea al menos una zona con tarifas.';
    }

    const settings = await this.restaurant.getSettings(hotelId);
    const date = parseRestaurantBookingDate(text);
    let header = '*Tarifas de reserva de mesa*\n\n';

    const defaultFee = settings.default_reservation_fee ?? 0;
    const defaultPerGuest = settings.default_price_per_guest ?? 0;
    if (defaultFee > 0 || defaultPerGuest > 0) {
      header +=
        `*Tarifas generales:* fee ${defaultFee.toLocaleString('es-CO')} + ${defaultPerGuest.toLocaleString('es-CO')}/persona\n` +
        `(Ejemplo 4 personas: ~${(defaultFee + defaultPerGuest * 4).toLocaleString('es-CO')})\n\n`;
    }

    if (date) {
      header = `*Tarifas para ${date}*\n\n`;
      try {
        const slots = await this.restaurant.getAvailableTimeSlots(hotelId, date);
        header += slots.length
          ? `Hay ${slots.length} horario(s) disponible(s).\n\n`
          : `Sin horarios disponibles ese día.\n\n`;
      } catch {
        /* ignore invalid date in rates query */
      }
    }

    const lines = zones.map((z) => {
      const fee = (z.base_reservation_fee > 0 ? z.base_reservation_fee : defaultFee).toLocaleString(
        'es-CO',
      );
      const perGuest = (
        z.base_price_per_guest > 0 ? z.base_price_per_guest : defaultPerGuest
      ).toLocaleString('es-CO');
      const effectiveFee = z.base_reservation_fee > 0 ? z.base_reservation_fee : defaultFee;
      const effectivePerGuest =
        z.base_price_per_guest > 0 ? z.base_price_per_guest : defaultPerGuest;
      const example = effectiveFee + effectivePerGuest * 4;
      return (
        `• *${z.name}* (${z.min_party_size}–${z.max_party_size} pax)\n` +
        `  Fee reserva: ${z.currency} ${fee} + ${z.currency} ${perGuest}/persona\n` +
        `  Ejemplo 4 personas: ~${z.currency} ${example.toLocaleString('es-CO')}`
      );
    });

    const paymentNote = settings.require_payment
      ? '\n\n💳 Tu restaurante *requiere pago* al reservar.'
      : '\n\n✅ Tu restaurante permite reservar *sin cobro anticipado*.';

    return `${header}${lines.join('\n\n')}${paymentNote}\n\n_Escribe *Reservar mesa* para simular una reserva completa._`;
  }

  private async buildHotelAvailabilityHint(hotelId: string, text: string) {
    const rooms = await this.prisma.roomType.findMany({
      where: { hotelId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!rooms.length) {
      return 'No hay habitaciones en inventario local. Configúralas en *Inventario* o conecta tu PMS.\n\n_Escribe *menu* para volver._';
    }

    const lines = rooms.map(
      (r) =>
        `• *${r.name}* — ${r.currency} ${r.pricePerNight.toLocaleString('es-CO')}/noche (máx. ${r.maxOccupancy} pax)`,
    );

    return (
      `Para una cotización exacta necesito fechas válidas en el simulador de WhatsApp.\n\n` +
      `*Tarifas base actuales:*\n${lines.join('\n')}\n\n` +
      `_En producción el bot consulta disponibilidad en tiempo real._`
    );
  }

  private async buildInventorySummary(hotelId: string, vertical: BusinessVertical) {
    if (vertical === 'restaurant') {
      return this.buildRestaurantRatesAnswer(hotelId, '');
    }
    if (vertical === 'hotel') {
      const rooms = await this.prisma.roomType.findMany({
        where: { hotelId, isActive: true },
        take: 5,
      });
      if (!rooms.length) return 'Sin habitaciones en inventario local.';
      return rooms
        .map((r) => `${r.name}: ${r.currency} ${r.pricePerNight.toLocaleString('es-CO')}/noche`)
        .join(' · ');
    }
    return '';
  }

  private async buildOperationalContext(hotelId: string, vertical: BusinessVertical) {
    if (vertical === 'restaurant') {
      const settings = await this.restaurant.getSettings(hotelId);
      const zones = await this.restaurant.listZones(hotelId);
      const addons = await this.restaurant.listAddOns(hotelId);
      const activeZones = zones.filter((z) => z.is_active);
      const activeAddons = addons.filter((a) => a.is_active);

      return [
        `Tipo: Restaurante`,
        `Requiere pago al reservar: ${settings.require_payment ? 'sí' : 'no'}`,
        `Tarifas generales: fee ${settings.default_reservation_fee ?? 0}, ${settings.default_price_per_guest ?? 0}/persona`,
        `Antelación mínima: ${settings.min_advance_hours} horas`,
        `Reserva hasta: ${settings.advance_booking_days} días adelante`,
        `Intervalo de horarios: ${settings.slot_interval_minutes} minutos`,
        settings.max_covers_per_slot != null
          ? `Máximo cubiertos por horario: ${settings.max_covers_per_slot}`
          : null,
        activeZones.length
          ? `Zonas/mesas:\n${activeZones
              .map(
                (z) =>
                  `- ${z.name}: ${z.min_party_size}-${z.max_party_size} personas, fee ${z.currency} ${z.base_reservation_fee}, ${z.currency} ${z.base_price_per_guest}/persona`,
              )
              .join('\n')}`
          : 'Zonas: ninguna configurada',
        activeAddons.length
          ? `Adicionales:\n${activeAddons.map((a) => `- ${a.name}: ${a.currency} ${a.price}`).join('\n')}`
          : null,
        settings.post_payment_message
          ? `Mensaje post-reserva: ${settings.post_payment_message}`
          : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (vertical === 'hotel') {
      const rooms = await this.prisma.roomType.findMany({
        where: { hotelId, isActive: true },
      });
      return rooms.length
        ? `Habitaciones:\n${rooms
            .map(
              (r) =>
                `- ${r.name}: ${r.currency} ${r.pricePerNight}/noche, máx ${r.maxOccupancy} huéspedes, ${r.totalUnits} unidad(es)`,
            )
            .join('\n')}`
        : 'Sin habitaciones en inventario local.';
    }

    return `Vertical: ${BUSINESS_VERTICAL_LABELS[vertical]}`;
  }

  private async getBusiness(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: { name: true, businessVertical: true },
    });
    const vertical = isBusinessVertical(hotel.businessVertical)
      ? hotel.businessVertical
      : 'hotel';
    return { name: hotel.name, vertical };
  }

  private welcomeMessage(business: { name: string; vertical: BusinessVertical }) {
    const label = BUSINESS_VERTICAL_LABELS[business.vertical].toLowerCase();
    if (business.vertical === 'restaurant') {
      return (
        `Hola, bienvenido a *${business.name}* 👋\n\n` +
        `Simulador del bot de restaurante. Puedo mostrar *tarifas de mesa*, responder preguntas con tu knowledge base + inventario, o simular una *reserva completa*.\n\n` +
        `Prueba: *¿Cuánto cuesta la reserva?* o *Reservar mesa*`
      );
    }
    if (business.vertical === 'hotel') {
      return (
        `Hola, bienvenido a *${business.name}* 👋\n\n` +
        `Simulador del bot hotelero. Pregúntame sobre políticas y servicios, o escribe *reservar* con fechas y huéspedes.\n\n` +
        `También uso tu inventario y documentos de entrenamiento AI.`
      );
    }
    return `Hola, soy el asistente de *${business.name}* (${label}). ¿En qué te ayudo?`;
  }

  private defaultSuggestions(vertical: BusinessVertical): string[] {
    if (vertical === 'restaurant') {
      return ['¿Cuánto cuesta la reserva?', 'Reservar mesa', 'menu'];
    }
    if (vertical === 'hotel') {
      return ['¿Aceptan mascotas?', 'reservar', 'menu'];
    }
    return ['menu'];
  }

  private isReset(text: string) {
    return /^(menu|inicio|cancelar|volver|empezar de nuevo)$/.test(text);
  }

  private isBookingIntent(text: string, vertical: BusinessVertical) {
    if (vertical === 'restaurant') {
      return /reservar|reserva de mesa|reserva una mesa|mesa para|quiero una mesa/.test(text);
    }
    if (vertical === 'hotel') {
      return text === 'reservar' || text.includes('reservar habitación');
    }
    return false;
  }

  private isRatesQuery(text: string) {
    if (/reservar|reserva una mesa|mesa para/.test(text)) return false;
    return /tarifa|precio|costo|cuesta|cuánto|cuanto|valor|cuánto cuesta/.test(text);
  }

  private parsePartySize(text: string): number | undefined {
    const bare = text.trim().match(/^(\d+)$/);
    if (bare) {
      const n = parseInt(bare[1], 10);
      if (n > 0 && n < 100) return n;
    }
    const match = text.match(/(\d+)\s*(?:personas?|pax|comensales?)/i);
    if (match) return parseInt(match[1], 10);
    if (/pareja/i.test(text)) return 2;
    return undefined;
  }

  private parseTimeChoice(text: string, slots?: string[]): string | null {
    const trimmed = text.trim();
    const num = trimmed.match(/^(\d+)$/);
    if (num && slots?.length) {
      const idx = parseInt(num[1], 10) - 1;
      return slots[idx] ?? null;
    }
    const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
    }
    return null;
  }

  private pickFromList<T>(
    text: string,
    items: T[],
    labelFn: (item: T) => string,
  ): T | undefined {
    const trimmed = text.trim();
    const num = trimmed.match(/^(\d+)$/);
    if (num) {
      const idx = parseInt(num[1], 10) - 1;
      if (idx >= 0 && idx < items.length) return items[idx];
    }
    const lower = trimmed.toLowerCase();
    return items.find((item) => labelFn(item).toLowerCase().includes(lower));
  }
}
