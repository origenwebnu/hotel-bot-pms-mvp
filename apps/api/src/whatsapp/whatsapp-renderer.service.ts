import { Injectable } from '@nestjs/common';
import {
  MAX_LIST_MESSAGE_ROWS,
  WHATSAPP_BUTTON_IDS,
  BUSINESS_VERTICAL_LABELS,
  supportsTransactionalFlow,
  filterValidMediaUrls,
  formatDisplayDate,
  formatDisplayDateRange,
  sanitizeWhatsAppText,
  type BusinessVertical,
  type StandardRoomAvailability,
  type WhatsAppListMessage,
  type WhatsAppButtonMessage,
  type WhatsAppTextMessage,
} from '@hotel-bot/shared';

@Injectable()
export class WhatsAppRendererService {
  renderRoomList(
    rooms: StandardRoomAvailability[],
    checkIn: string,
    checkOut: string,
  ): WhatsAppListMessage | WhatsAppButtonMessage | WhatsAppTextMessage {
    if (rooms.length === 0) {
      return {
        type: 'text',
        text: {
          body: 'Lo sentimos, no hay habitaciones disponibles para esas fechas. ¿Te gustaría probar con otras fechas?',
        },
      };
    }

    const dateRange = formatDisplayDateRange(checkIn, checkOut, ' → ');

    if (rooms.length <= 3) {
      const lines = rooms.map(
        (r) => `• *${r.name}* — ${r.currency} ${r.price.toLocaleString()}/noche`,
      );

      return {
        type: 'button',
        body: {
          text:
            `Habitaciones disponibles (${dateRange}):\n\n${lines.join('\n')}\n\n` +
            `Pulsa el botón de la habitación que prefieres:`,
        },
        footer: { text: 'Precios por noche, impuestos pueden aplicar' },
        action: {
          buttons: rooms.map((r) => ({
            type: 'reply' as const,
            reply: {
              id: `room_${r.room_type_id}`,
              title: this.truncateButtonTitle(r.name),
            },
          })),
        },
      };
    }

    const listDateRange = formatDisplayDateRange(checkIn, checkOut);

    const rows = rooms.slice(0, MAX_LIST_MESSAGE_ROWS).map((r) => ({
      id: `room_${r.room_type_id}`,
      title: sanitizeWhatsAppText(r.name, 24),
      description: `${r.currency} ${r.price.toLocaleString()}/noche`.slice(0, 72),
    }));

    return {
      type: 'list',
      header: { type: 'text', text: 'Habitaciones disponibles' },
      body: {
        text: `Encontramos ${rooms.length} opciones para ${listDateRange}. Selecciona una:`,
      },
      footer: { text: 'Precios por noche, impuestos pueden aplicar' },
      action: {
        button: 'Ver habitaciones',
        sections: [{ title: 'Disponibles', rows }],
      },
    };
  }

  private truncateButtonTitle(name: string): string {
    const trimmed = sanitizeWhatsAppText(name, 20);
    if (trimmed.length <= 20) return trimmed;
    return `${trimmed.slice(0, 17)}…`;
  }

  renderDiscountOffer(data: {
    percent: number;
    originalTotal: number;
    discountedTotal: number;
    currency: string;
    expiresMinutes: number;
    roomName?: string;
  }): WhatsAppButtonMessage {
    const roomLine = data.roomName ? `\n🏠 *${data.roomName}*` : '';

    return {
      type: 'button',
      body: {
        text:
          `Comprendo 😊 Te ofrezco un *${data.percent}%* de descuento sobre el valor total de tu reserva.${roomLine}\n\n` +
          `💰 *${data.currency} ${data.discountedTotal.toLocaleString('es-CO')}*` +
          ` _(antes ${data.currency} ${data.originalTotal.toLocaleString('es-CO')})_\n\n` +
          `⏱ Válido si reservas en los próximos *${data.expiresMinutes} minutos*.`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.RESERVE, title: 'Reservar' },
          },
        ],
      },
    };
  }

  renderRoomDetail(room: StandardRoomAvailability): WhatsAppButtonMessage {
    return this.buildRoomDetailMessage(room, true);
  }

  renderRoomDetailWithoutHeader(room: StandardRoomAvailability): WhatsAppButtonMessage {
    return this.buildRoomDetailMessage(room, false);
  }

  private buildRoomDetailMessage(
    room: StandardRoomAvailability,
    includeHeader: boolean,
  ): WhatsAppButtonMessage {
    const name = sanitizeWhatsAppText(room.name, 60);
    const photos = filterValidMediaUrls(room.photos_urls);
    const photoUrl = photos[0];
    const description = sanitizeWhatsAppText(
      room.description ?? 'Habitación confortable para tu estadía.',
      200,
    );

    const message: WhatsAppButtonMessage = {
      type: 'button',
      body: {
        text: `*${name}*\n\n${description}\n\n💰 *${room.currency} ${room.price.toLocaleString()}* / noche`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.RESERVE, title: 'Reservar' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.VIEW_PHOTOS, title: 'Ver fotos' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.BACK_TO_ROOMS, title: 'Ver opciones' },
          },
        ],
      },
    };

    if (includeHeader) {
      if (photoUrl) {
        message.header = { type: 'image', image: { link: photoUrl } };
      } else if (name) {
        message.header = { type: 'text', text: name };
      }
    }

    return message;
  }

  renderRoomGalleryLink(
    url: string,
    roomName: string,
  ): import('@hotel-bot/shared').WhatsAppCtaUrlMessage {
    const name = sanitizeWhatsAppText(roomName, 40);

    return {
      type: 'cta_url',
      body: {
        text:
          `📸 Galería de *${name}*\n\n` +
          `Pulsa *Ver galería* para ver todas las fotos en la web.\n` +
          `Luego usa *Reservar* (mensaje siguiente) para continuar sin repetir la habitación.`,
      },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: 'Ver galería',
          url,
        },
      },
    };
  }

  renderGalleryReservePrompt(roomName: string): WhatsAppButtonMessage {
    const name = sanitizeWhatsAppText(roomName, 40);

    return {
      type: 'button',
      body: {
        text:
          `¿Listo para reservar *${name}*?\n\n` +
          `Pulsa *Reservar* para ingresar tus datos (nombre y email).`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.RESERVE, title: 'Reservar' },
          },
        ],
      },
    };
  }

  renderPaymentLink(
    url: string,
    expiresMinutes: number,
  ): import('@hotel-bot/shared').WhatsAppCtaUrlMessage {
    return {
      type: 'cta_url',
      body: {
        text:
          `✅ Recibo generado.\n\n` +
          `Pulsa el botón para abrir el formulario de pago seguro.\n` +
          `⏱ Tienes *${expiresMinutes} minutos* antes de que se libere la habitación.`,
      },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: 'Pagar reserva',
          url,
        },
      },
    };
  }

  renderReservationReceipt(data: {
    hotelName: string;
    reservationRef: string;
    guestName: string;
    guestEmail: string;
    guestPhone?: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    amount: number;
    originalAmount?: number;
    discountPercent?: number;
    currency: string;
    holdMinutes?: number;
  }): WhatsAppTextMessage {
    const nights = this.estimateNights(data.checkIn, data.checkOut);
    const checkInLabel = formatDisplayDate(data.checkIn);
    const checkOutLabel = formatDisplayDate(data.checkOut);

    let body =
      `🧾 *RECIBO DE RESERVA*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏨 *${data.hotelName}*\n` +
      `🔖 Ref: *${data.reservationRef}*\n\n` +
      `👤 *Cliente:* ${data.guestName}\n` +
      `✉️ *Email:* ${data.guestEmail}\n`;

    if (data.guestPhone) {
      body += `📱 *Teléfono:* ${data.guestPhone}\n`;
    }

    body +=
      `\n🏠 *Habitación:* ${data.roomName}\n` +
      `📅 *Desde:* ${checkInLabel}\n` +
      `📅 *Hasta:* ${checkOutLabel}\n` +
      `🌙 *Noches:* ${nights}\n` +
      `👥 *Huéspedes:* ${data.guests}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n`;

    if (data.originalAmount && data.discountPercent) {
      body +=
        `🏷 Descuento: *${data.discountPercent}%*\n` +
        `Subtotal: ~${data.currency} ${data.originalAmount.toLocaleString('es-CO')}~\n`;
    }

    body +=
      `💰 *TOTAL A PAGAR:* ${data.currency} ${data.amount.toLocaleString('es-CO')}\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    if (data.holdMinutes) {
      body += `\n\n⏱ Reserva temporal: *${data.holdMinutes} min* para pagar.`;
    }

    return { type: 'text', text: { body } };
  }

  private estimateNights(checkIn: string, checkOut: string): number {
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    return Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  renderPaymentStatusReceipt(data: {
    hotelName: string;
    reservationRef: string;
    paymentRef: string;
    guestName: string;
    guestEmail: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    amount: number;
    originalAmount?: number;
    discountPercent?: number;
    currency: string;
    paymentStatus: 'pending' | 'approved' | 'declined' | 'expired' | 'error';
  }): WhatsAppTextMessage {
    const nights = this.estimateNights(data.checkIn, data.checkOut);
    const statusLabel = this.paymentStatusLabel(data.paymentStatus);

    let body =
      `🧾 *RECIBO DE PAGO*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `Estado: *${statusLabel}*\n` +
      `🏨 *${data.hotelName}*\n` +
      `🔖 Reserva: *${data.reservationRef}*\n` +
      `💳 Transacción: *${data.paymentRef}*\n\n` +
      `👤 *Cliente:* ${data.guestName}\n` +
      `✉️ *Email:* ${data.guestEmail}\n` +
      `\n🏠 *Habitación:* ${data.roomName}\n` +
      `📅 *Desde:* ${formatDisplayDate(data.checkIn)}\n` +
      `📅 *Hasta:* ${formatDisplayDate(data.checkOut)}\n` +
      `🌙 *Noches:* ${nights}\n` +
      `👥 *Huéspedes:* ${data.guests}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n`;

    if (data.originalAmount && data.discountPercent) {
      body +=
        `🏷 Descuento: *${data.discountPercent}%*\n` +
        `Subtotal: ~${data.currency} ${data.originalAmount.toLocaleString('es-CO')}~\n`;
    }

    body +=
      `💰 *TOTAL:* ${data.currency} ${data.amount.toLocaleString('es-CO')}\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    return { type: 'text', text: { body } };
  }

  renderPaymentApprovedFollowUp(data: {
    guestName: string;
    confirmationCode?: string;
    recommendations?: string | null;
    note?: string;
  }): WhatsAppTextMessage {
    let body =
      `🎉 *¡Gracias, ${data.guestName}!*\n\n` +
      `Tu pago fue *aprobado* y tu reserva está confirmada.`;

    if (data.confirmationCode) {
      body += `\n\n🔖 *Código de confirmación:* ${data.confirmationCode}`;
    }

    if (data.note) {
      body += `\n\n_${data.note}_`;
    }

    if (data.recommendations?.trim()) {
      body +=
        `\n\n📋 *Recomendaciones para tu estadía:*\n${data.recommendations.trim()}`;
    }

    body += `\n\nTe esperamos. Si necesitas algo más, escríbenos por aquí.`;

    return { type: 'text', text: { body } };
  }

  renderResumeBookingOffer(data: {
    roomName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    amount: number;
    currency: string;
    paymentStatus?: string | null;
    holdExpired: boolean;
  }): import('@hotel-bot/shared').WhatsAppButtonMessage {
    const nights = this.estimateNights(data.checkIn, data.checkOut);
    const statusNote = data.holdExpired
      ? '⏱ El tiempo de pago anterior expiró, pero puedo *retomar* la misma reserva si aún hay disponibilidad.'
      : data.paymentStatus === 'declined' || data.paymentStatus === 'error'
        ? '💳 Tu último intento de pago no se completó.'
        : '💳 Tienes una reserva pendiente de pago.';

    return {
      type: 'button',
      body: {
        text:
          `Hola de nuevo 👋 Encontré tu reserva reciente:\n\n` +
          `🏠 *${data.roomName}*\n` +
          `📅 ${formatDisplayDate(data.checkIn)} → ${formatDisplayDate(data.checkOut)} (${nights} noche${nights > 1 ? 's' : ''})\n` +
          `👥 ${data.guests} huésped${data.guests > 1 ? 'es' : ''}\n` +
          `💰 ${data.currency} ${data.amount.toLocaleString('es-CO')}\n\n` +
          `${statusNote}\n\n` +
          `¿Qué prefieres hacer?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: WHATSAPP_BUTTON_IDS.RESUME_BOOKING,
              title: 'Retomar reserva',
            },
          },
          {
            type: 'reply',
            reply: {
              id: WHATSAPP_BUTTON_IDS.NEW_BOOKING,
              title: 'Reserva nueva',
            },
          },
        ],
      },
    };
  }

  renderPaymentDeclinedActions(data: {
    guestName: string;
    paymentPageUrl: string;
  }): import('@hotel-bot/shared').WhatsAppButtonMessage {
    return {
      type: 'button',
      body: {
        text:
          `Hola ${data.guestName}, no te preocupes 🙌\n\n` +
          `Tu pago *no pudo completarse* (fue rechazado o cancelado). ` +
          `La habitación sigue reservada *temporalmente* mientras tanto.\n\n` +
          `¿Qué te gustaría hacer?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: WHATSAPP_BUTTON_IDS.PAY_RETRY,
              title: 'Volver a pagar',
            },
          },
          {
            type: 'reply',
            reply: {
              id: WHATSAPP_BUTTON_IDS.PAY_CHANGE,
              title: 'Cambiar reserva',
            },
          },
        ],
      },
    };
  }

  renderPaymentRetryPrompt(
    paymentPageUrl: string,
  ): import('@hotel-bot/shared').WhatsAppCtaUrlMessage {
    return {
      type: 'cta_url',
      body: {
        text:
          `❌ *El pago no pudo completarse.*\n\n` +
          `Tu habitación sigue reservada temporalmente. Puedes intentar de nuevo con otro método de pago.\n\n` +
          `Pulsa el botón para volver al formulario de pago.`,
      },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: 'Volver a pagar',
          url: paymentPageUrl,
        },
      },
    };
  }

  private paymentStatusLabel(
    status: 'pending' | 'approved' | 'declined' | 'expired' | 'error',
  ): string {
    switch (status) {
      case 'approved':
        return '✅ Aprobado';
      case 'declined':
        return '❌ Rechazado';
      case 'error':
        return '⚠️ Error';
      case 'expired':
        return '⏱ Expirado';
      default:
        return '⏳ Pendiente';
    }
  }

  renderConfirmation(guestName: string, confirmationCode?: string): WhatsAppTextMessage {
    return {
      type: 'text',
      text: {
        body: `🎉 ¡Reserva confirmada, ${guestName}!\n\n${confirmationCode ? `Código: *${confirmationCode}*\n\n` : ''}Te esperamos. Si necesitas algo más, escríbenos.`,
      },
    };
  }

  renderPaymentFailed(): WhatsAppTextMessage {
    return {
      type: 'text',
      text: {
        body: '❌ El pago no pudo procesarse. Tu habitación sigue reservada temporalmente — intenta de nuevo o usa otro método de pago. Escribe "pagar" para recibir un nuevo link.',
      },
    };
  }

  renderWelcomeMenu(business: {
    name: string;
    vertical: BusinessVertical;
  }): WhatsAppButtonMessage {
    const { name, vertical } = business;
    const canTransact = supportsTransactionalFlow(vertical);

    if (!canTransact) {
      const typeLabel = BUSINESS_VERTICAL_LABELS[vertical].toLowerCase();
      const intro =
        `Hola, bienvenido a *${name}* 👋\n\n` +
        `Soy tu asistente virtual. Puedo responder preguntas sobre nuestro ${typeLabel}. ` +
        `Muy pronto también podrás reservar o comprar desde aquí.`;

      return {
        type: 'button',
        body: { text: `${intro}\n\n¿En qué te puedo ayudar?` },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: WHATSAPP_BUTTON_IDS.MENU_FAQ, title: 'Hacer una pregunta' },
            },
          ],
        },
      };
    }

    if (vertical === 'restaurant') {
      return {
        type: 'button',
        body: {
          text:
            `Hola, bienvenido a *${name}* 👋\n\n` +
            `Reserva tu mesa o pregúntanos lo que necesites, todo desde este chat.\n\n` +
            `¿Qué te gustaría hacer?`,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: WHATSAPP_BUTTON_IDS.MENU_BOOK, title: 'Reservar mesa' },
            },
            {
              type: 'reply',
              reply: { id: WHATSAPP_BUTTON_IDS.MENU_FAQ, title: 'Hacer una pregunta' },
            },
          ],
        },
      };
    }

    return {
      type: 'button',
      body: {
        text:
          `Hola, bienvenido a *${name}* 👋\n\n` +
          `Te ayudaré con tu reserva de forma ágil y todo desde este chat.\n\n` +
          `¿Qué te gustaría hacer?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.MENU_BOOK, title: 'Reservar habitación' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.MENU_FAQ, title: 'Resolver dudas' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.MENU_RATES, title: 'Conocer tarifas' },
          },
        ],
      },
    };
  }

  renderRatesList(
    rooms: Array<{ name: string; price: number; currency: string; description?: string | null }>,
    hotelName: string,
  ): WhatsAppTextMessage {
    if (rooms.length === 0) {
      return {
        type: 'text',
        text: {
          body: `*Tarifas de ${hotelName}*\n\nPor el momento no tenemos tarifas publicadas. Escribe *menu* para volver al inicio.`,
        },
      };
    }

    const lines = rooms.map(
      (r) =>
        `• *${r.name}* — ${r.currency} ${r.price.toLocaleString()}/noche` +
        (r.description ? `\n  _${r.description.slice(0, 80)}_${r.description.length > 80 ? '…' : ''}` : ''),
    );

    return {
      type: 'text',
      text: {
        body:
          `*Tarifas de ${hotelName}*\n\n${lines.join('\n\n')}\n\n` +
          `Para reservar, escribe *menu* y elige *Reservar habitación*, o indica fechas y huéspedes (ej: *2 personas del 28 al 29 de junio*).`,
      },
    };
  }

  renderRestaurantTimeList(
    date: string,
    slots: string[],
    startIndex = 0,
  ): WhatsAppListMessage | WhatsAppTextMessage {
    if (!slots.length) {
      return {
        type: 'text',
        text: {
          body: `No hay horarios disponibles para el *${formatDisplayDate(date)}*. Prueba otra fecha.`,
        },
      };
    }

    const sections = this.buildTimeSlotSections(slots, startIndex);
    const pageNote =
      startIndex > 0
        ? `\n(Mostrando ${startIndex + 1}–${Math.min(startIndex + 9, slots.length)} de ${slots.length})`
        : `\n(${slots.length} horario${slots.length !== 1 ? 's' : ''} disponible${slots.length !== 1 ? 's' : ''})`;

    return {
      type: 'list',
      header: { type: 'text', text: 'Horarios disponibles' },
      body: {
        text: `Elige la hora para el *${formatDisplayDate(date)}*:${pageNote}`,
      },
      action: {
        button: 'Ver horarios',
        sections,
      },
    };
  }

  /** WhatsApp allows max 10 rows total in a list — paginate with a "Ver más" row. */
  private buildTimeSlotSections(slots: string[], startIndex = 0) {
    const maxSlotsPerPage = 9;
    const pageSlots = slots.slice(startIndex, startIndex + maxSlotsPerPage);
    const hasMore = slots.length > startIndex + maxSlotsPerPage;

    const rows = pageSlots.map((t) => ({
      id: `rest_time_${t.replace(':', '')}`,
      title: t,
      description: 'Disponible',
    }));

    if (hasMore) {
      rows.push({
        id: `rest_time_more_${startIndex + maxSlotsPerPage}`,
        title: 'Ver más horarios',
        description: `${slots.length - startIndex - maxSlotsPerPage} restantes`,
      });
    }

    return [{ title: 'Horarios', rows }];
  }

  renderRestaurantZoneList(
    zones: Array<{
      id: string;
      name: string;
      quote: { total: number; currency: string };
    }>,
  ): WhatsAppListMessage | WhatsAppTextMessage {
    if (!zones.length) {
      return {
        type: 'text',
        text: {
          body: 'No hay zonas disponibles para ese horario y número de personas. Prueba otro horario o fecha.',
        },
      };
    }
    return {
      type: 'list',
      header: { type: 'text', text: 'Zonas disponibles' },
      body: { text: 'Selecciona la zona o ambiente que prefieres:' },
      action: {
        button: 'Ver zonas',
        sections: [
          {
            title: 'Ambientes',
            rows: zones.map((z) => ({
              id: `rest_zone_${z.id}`,
              title: sanitizeWhatsAppText(z.name, 24),
              description: `${z.quote.currency} ${z.quote.total.toLocaleString('es-CO')}`.slice(
                0,
                72,
              ),
            })),
          },
        ],
      },
    };
  }

  renderRestaurantOccasionButtons(): WhatsAppListMessage {
    return {
      type: 'list',
      header: { type: 'text', text: 'Motivo de la reserva' },
      body: { text: '¿Cuál es el motivo de tu visita?' },
      action: {
        button: 'Elegir motivo',
        sections: [
          {
            title: 'Ocasiones',
            rows: [
              { id: 'rest_occ_birthday', title: 'Cumpleaños', description: 'Celebración especial' },
              { id: 'rest_occ_anniversary', title: 'Aniversario', description: 'Pareja' },
              { id: 'rest_occ_romantic_dinner', title: 'Cena romántica', description: 'En pareja' },
              { id: 'rest_occ_business', title: 'Negocios', description: 'Reunión o trabajo' },
              { id: 'rest_occ_celebration', title: 'Celebración', description: 'Fiesta o brindis' },
              { id: 'rest_occ_other', title: 'Otro', description: 'Visita general' },
            ],
          },
        ],
      },
    };
  }

  renderRestaurantAddOnPrompt(): WhatsAppButtonMessage {
    return {
      type: 'button',
      body: {
        text:
          '¿Deseas agregar algo especial a tu reserva?\n\n' +
          'Puedes elegir un adicional de la lista o continuar sin extras.',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.REST_WANT_ADDONS, title: 'Quiero adicionales' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.REST_SKIP_ADDONS, title: 'Reservar' },
          },
        ],
      },
    };
  }

  renderRestaurantAddOnPickerList(
    addons: Array<{ id: string; name: string; price: number; currency: string }>,
  ): WhatsAppListMessage | WhatsAppTextMessage {
    if (!addons.length) {
      return {
        type: 'text',
        text: { body: 'No hay adicionales disponibles. Continuemos con tus datos.' },
      };
    }

    return {
      type: 'list',
      header: { type: 'text', text: 'Adicionales' },
      body: { text: 'Elige un adicional para tu reserva:' },
      action: {
        button: 'Ver adicionales',
        sections: [
          {
            title: 'Disponibles',
            rows: addons.slice(0, MAX_LIST_MESSAGE_ROWS).map((a) => ({
              id: `rest_addon_${a.id}`,
              title: sanitizeWhatsAppText(a.name, 24),
              description: `${a.currency} ${a.price.toLocaleString('es-CO')}`,
            })),
          },
        ],
      },
    };
  }

  renderRestaurantConfirmSummary(data: {
    businessName: string;
    date: string;
    time: string;
    zoneName: string;
    partySize: number;
    occasionLabel: string;
    reservationTotal: number;
    addons: Array<{ name: string; price: number }>;
    guestName: string;
    total: number;
    currency: string;
    requiresPayment: boolean;
    specialRequests?: string | null;
    summaryFooterMessage?: string;
    summaryFooterLink?: string;
  }): WhatsAppButtonMessage {
    let body =
      `📋 *Resumen de tu reserva*\n\n` +
      `🍽 *${data.businessName}*\n` +
      `📅 ${formatDisplayDate(data.date)} · 🕐 ${data.time}\n` +
      `📍 ${data.zoneName}\n` +
      `👥 ${data.partySize} persona${data.partySize > 1 ? 's' : ''}\n` +
      `🎉 ${data.occasionLabel}\n` +
      `👤 ${data.guestName}\n`;

    if (data.specialRequests?.trim()) {
      body += `\n📝 *Petición:* ${data.specialRequests.trim()}\n`;
    }

    body += `\n💵 *Valor reserva:* ${data.currency} ${data.reservationTotal.toLocaleString('es-CO')}`;

    for (const addon of data.addons) {
      body += `\n✨ *Extra (${addon.name}):* ${data.currency} ${addon.price.toLocaleString('es-CO')}`;
    }

    body += `\n\n💰 *Total:* ${data.currency} ${data.total.toLocaleString('es-CO')}`;

    if (!data.requiresPayment || data.total <= 0) {
      body += `\n\n✅ Esta reserva *no requiere pago* anticipado.`;
    } else {
      body += `\n\n💳 Al confirmar, recibirás el link de pago.`;
    }

    if (data.summaryFooterMessage?.trim()) {
      body += `\n\n📋 ${data.summaryFooterMessage.trim()}`;
    }
    if (data.summaryFooterLink?.trim()) {
      body += `\n\n🔗 ${data.summaryFooterLink.trim()}`;
    }

    return {
      type: 'button',
      body: { text: body },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.REST_CONFIRM_BOOKING, title: 'Confirmar reserva' },
          },
        ],
      },
    };
  }

  renderRestaurantReservationReceipt(data: {
    businessName: string;
    reservationRef: string;
    guestName: string;
    guestPhone?: string;
    zoneName: string;
    date: string;
    time: string;
    partySize: number;
    occasionLabel: string;
    amount: number;
    currency: string;
    holdMinutes?: number;
    specialRequests?: string | null;
  }): WhatsAppTextMessage {
    let body =
      `🧾 *RECIBO DE RESERVA*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🍽 *${data.businessName}*\n` +
      `🔖 Ref: *${data.reservationRef}*\n\n` +
      `👤 *Cliente:* ${data.guestName}\n`;

    if (data.guestPhone) {
      body += `📱 *WhatsApp:* ${data.guestPhone}\n`;
    }

    body +=
      `\n📍 *Zona:* ${data.zoneName}\n` +
      `📅 *Fecha:* ${formatDisplayDate(data.date)}\n` +
      `🕐 *Hora:* ${data.time}\n` +
      `👥 *Personas:* ${data.partySize}\n` +
      `🎉 *Motivo:* ${data.occasionLabel}\n`;

    if (data.specialRequests?.trim()) {
      body += `\n📝 *Petición especial:* ${data.specialRequests.trim()}\n`;
    }

    body +=
      `\n━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *TOTAL A PAGAR:* ${data.currency} ${data.amount.toLocaleString('es-CO')}\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    if (data.holdMinutes) {
      body += `\n\n⏱ Tienes *${data.holdMinutes} min* para completar el pago.`;
    }

    return { type: 'text', text: { body } };
  }

  renderRestaurantConfirmed(data: {
    guestName: string;
    reservationRef: string;
    date: string;
    time: string;
    zoneName: string;
    partySize: number;
    postPaymentMessage?: string | null;
    postPaymentLink?: string | null;
    specialRequests?: string | null;
  }): WhatsAppTextMessage {
    let body =
      `🎉 *¡Reserva confirmada, ${data.guestName}!*\n\n` +
      `📍 ${data.zoneName}\n` +
      `📅 ${formatDisplayDate(data.date)} · 🕐 ${data.time}\n` +
      `👥 ${data.partySize} persona${data.partySize > 1 ? 's' : ''}\n` +
      `🔖 Ref: *${data.reservationRef}*`;

    if (data.specialRequests?.trim()) {
      body += `\n\n📝 *Petición:* ${data.specialRequests.trim()}`;
    }

    if (data.postPaymentMessage?.trim()) {
      body += `\n\n📋 *Indicaciones:*\n${data.postPaymentMessage.trim()}`;
    }

    if (data.postPaymentLink?.trim()) {
      body += `\n\n🔗 ${data.postPaymentLink.trim()}`;
    }

    body += `\n\nTe esperamos. Si necesitas algo más, escríbenos.`;

    return { type: 'text', text: { body } };
  }
}
