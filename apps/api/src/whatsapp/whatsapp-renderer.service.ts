import { Injectable } from '@nestjs/common';
import {
  MAX_LIST_MESSAGE_ROWS,
  WHATSAPP_BUTTON_IDS,
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
  ): WhatsAppListMessage | WhatsAppTextMessage {
    if (rooms.length === 0) {
      return {
        type: 'text',
        text: {
          body: 'Lo sentimos, no hay habitaciones disponibles para esas fechas. ¿Te gustaría probar con otras fechas?',
        },
      };
    }

    if (rooms.length <= 2) {
      const lines = rooms.map(
        (r) =>
          `• *${r.name}* — ${r.currency} ${r.price.toLocaleString()}/noche\n  ID: ${r.room_type_id}`,
      );
      return {
        type: 'text',
        text: {
          body: `Habitaciones disponibles (${checkIn} → ${checkOut}):\n\n${lines.join('\n\n')}\n\nResponde con el nombre o ID de la habitación que prefieres.`,
        },
      };
    }

    const rows = rooms.slice(0, MAX_LIST_MESSAGE_ROWS).map((r) => ({
      id: `room_${r.room_type_id}`,
      title: r.name.slice(0, 24),
      description: `${r.currency} ${r.price.toLocaleString()}/noche`.slice(0, 72),
    }));

    return {
      type: 'list',
      header: { type: 'text', text: 'Habitaciones disponibles' },
      body: {
        text: `Encontramos ${rooms.length} opciones para ${checkIn} al ${checkOut}. Selecciona una:`,
      },
      footer: { text: 'Precios por noche, impuestos pueden aplicar' },
      action: {
        button: 'Ver habitaciones',
        sections: [{ title: 'Disponibles', rows }],
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
    summary: {
      roomName: string;
      checkIn: string;
      checkOut: string;
      guests: number;
      amount: number;
      currency: string;
    },
    url: string,
    expiresMinutes: number,
  ): import('@hotel-bot/shared').WhatsAppCtaUrlMessage {
    const nights = this.estimateNights(summary.checkIn, summary.checkOut);
    return {
      type: 'cta_url',
      body: {
        text:
          `📋 *Resumen de tu reserva*\n\n` +
          `🏨 ${summary.roomName}\n` +
          `📅 ${summary.checkIn} → ${summary.checkOut} (${nights} noche${nights > 1 ? 's' : ''})\n` +
          `👥 ${summary.guests} huésped${summary.guests > 1 ? 'es' : ''}\n` +
          `💰 *Total: ${summary.currency} ${summary.amount.toLocaleString()}*\n\n` +
          `⏱ Tienes *${expiresMinutes} minutos* para pagar. Después se libera la habitación.`,
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
}
