import { Injectable } from '@nestjs/common';
import {
  MAX_LIST_MESSAGE_ROWS,
  WHATSAPP_BUTTON_IDS,
  formatDisplayDate,
  formatDisplayDateRange,
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
      title: r.name.slice(0, 24),
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
    const trimmed = name.trim();
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
    const photoUrl = room.photos_urls[0];
    const description = room.description?.slice(0, 200) ?? 'Habitación confortable para tu estadía.';

    return {
      type: 'button',
      header: photoUrl
        ? { type: 'image', image: { link: photoUrl } }
        : { type: 'text', text: room.name },
      body: {
        text: `*${room.name}*\n\n${description}\n\n💰 *${room.currency} ${room.price.toLocaleString()}* / noche`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.RESERVE, title: 'Reservar' },
          },
          {
            type: 'reply',
            reply: { id: WHATSAPP_BUTTON_IDS.BACK_TO_ROOMS, title: 'Ver opciones' },
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
          `Pulsa el botón para completar el pago.\n` +
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

  renderWelcomeMenu(hotelName: string): WhatsAppButtonMessage {
    return {
      type: 'button',
      body: {
        text:
          `Hola, bienvenido a *${hotelName}* 👋\n\n` +
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
}
