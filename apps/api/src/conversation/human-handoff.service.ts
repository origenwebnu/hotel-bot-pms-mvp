import { Injectable, Logger } from '@nestjs/common';
import {
  BUSINESS_VERTICAL_LABELS,
  DEFAULT_SERVICE_HOURS,
  HUMAN_HANDOFF_STATE,
  formatDisplayDate,
  formatServiceHoursSummary,
  isWithinServiceHoursNow,
  supportsRestaurantBooking,
  supportsHotelBooking,
  type BusinessVertical,
  type ServiceHoursMap,
} from '@hotel-bot/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

export interface HandoffBusinessContext {
  name: string;
  vertical: BusinessVertical;
}

@Injectable()
export class HumanHandoffService {
  private readonly logger = new Logger(HumanHandoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  isHumanHandoffState(state: string): boolean {
    return state === HUMAN_HANDOFF_STATE;
  }

  isMenuActionId(id: string): boolean {
    return id.startsWith('btn_menu_');
  }

  async shouldBotStaySilent(
    session: { state: string },
    text: string,
    wantsMainMenu: (text: string) => boolean,
  ): Promise<boolean> {
    if (!this.isHumanHandoffState(session.state)) return false;
    return !wantsMainMenu(text);
  }

  async getChatSettings(hotelId: string, vertical: BusinessVertical) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotelId },
      select: {
        timezone: true,
        chatNotificationEmail: true,
        serviceHoursJson: true,
        restaurantSettings: {
          select: {
            notificationEmail: true,
            serviceHoursJson: true,
          },
        },
      },
    });

    if (supportsRestaurantBooking(vertical) && hotel.restaurantSettings) {
      return {
        timezone: hotel.timezone,
        notificationEmail:
          hotel.restaurantSettings.notificationEmail?.trim() ||
          hotel.chatNotificationEmail?.trim() ||
          null,
        serviceHours:
          (hotel.restaurantSettings.serviceHoursJson as ServiceHoursMap | null) ??
          (hotel.serviceHoursJson as ServiceHoursMap | null) ??
          DEFAULT_SERVICE_HOURS,
      };
    }

    return {
      timezone: hotel.timezone,
      notificationEmail: hotel.chatNotificationEmail?.trim() || null,
      serviceHours:
        (hotel.serviceHoursJson as ServiceHoursMap | null) ?? DEFAULT_SERVICE_HOURS,
    };
  }

  async requestHumanHandoff(
    hotelId: string,
    session: { id: string; whatsappPhone: string; state: string },
    business: HandoffBusinessContext,
    options?: { contextNote?: string },
  ): Promise<void> {
    const settings = await this.getChatSettings(hotelId, business.vertical);
    const openNow = isWithinServiceHoursNow(settings.timezone, settings.serviceHours);
    const hoursLabel = formatServiceHoursSummary(settings.serviceHours);
    const teamLabel = BUSINESS_VERTICAL_LABELS[business.vertical].toLowerCase();

    const existingContext = await this.readContext(session.id);
    await this.prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        state: HUMAN_HANDOFF_STATE,
        contextJson: {
          ...existingContext,
          handoffRequestedAt: new Date().toISOString(),
          handoffFromState: session.state,
          handoffNote: options?.contextNote ?? null,
        },
      },
    });

    if (openNow) {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Te conectamos con nuestro equipo 👤\n\n` +
          `Un asesor del ${teamLabel} verá tu mensaje por este mismo WhatsApp. ` +
          `Puedes seguir escribiendo aquí.\n\n` +
          `_Escribe *menu* cuando quieras volver al asistente virtual._`,
      );
    } else {
      await this.whatsapp.sendText(
        hotelId,
        session.whatsappPhone,
        `Ahora estamos fuera de horario de atención humana (${hoursLabel}).\n\n` +
          `Deja tu mensaje y el equipo del ${teamLabel} te responderá en cuanto esté disponible.\n\n` +
          `_Para reservar con el asistente escribe *reservar*. Para volver al menú: *menu*._`,
      );
    }

    await this.notifyStaff(
      hotelId,
      business,
      session.whatsappPhone,
      options?.contextNote,
      openNow,
    );
  }

  async releaseToBot(
    hotelId: string,
    sessionId: string,
    phone: string,
    business: HandoffBusinessContext,
  ): Promise<void> {
    const existingContext = await this.readContext(sessionId);
    const { handoffRequestedAt: _a, handoffFromState: _b, handoffNote: _c, ...rest } =
      existingContext;

    await this.prisma.conversationSession.update({
      where: { id: sessionId },
      data: {
        state: 'idle',
        contextJson: Object.keys(rest).length
          ? (rest as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });

    await this.whatsapp.sendText(
      hotelId,
      phone,
      `Volviste al asistente virtual de *${business.name}*.\n\n_Escribe *menu* para ver las opciones._`,
    );
  }

  async lookupReservations(
    hotelId: string,
    phone: string,
    vertical: BusinessVertical,
  ) {
    const normalized = phone.replace(/\D/g, '');
    const suffix = normalized.slice(-10);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        OR: [
          { guestPhone: phone },
          { guestPhone: { endsWith: suffix } },
          { guestPhone: { contains: suffix } },
        ],
        status: { in: ['confirmed', 'hold', 'payment_pending'] },
      },
      orderBy: [{ bookingDate: 'asc' }, { checkIn: 'asc' }, { createdAt: 'desc' }],
      take: 5,
    });

    return reservations.filter((r) => {
      if (supportsRestaurantBooking(vertical)) {
        return r.bookingKind === 'restaurant_table';
      }
      if (supportsHotelBooking(vertical)) {
        return r.bookingKind === 'hotel_stay';
      }
      return true;
    });
  }

  async sendReservationLookupReply(
    hotelId: string,
    phone: string,
    business: HandoffBusinessContext,
  ): Promise<void> {
    const reservations = await this.lookupReservations(hotelId, phone, business.vertical);
    const teamLabel = BUSINESS_VERTICAL_LABELS[business.vertical].toLowerCase();

    if (!reservations.length) {
      await this.whatsapp.sendText(
        hotelId,
        phone,
        `No encontré reservas activas con este número de WhatsApp.\n\n` +
          `Si reservaste con otro teléfono, escribe *asesor* para hablar con el equipo.\n` +
          `Para hacer una nueva reserva escribe *reservar* o *menu*.`,
      );
      return;
    }

    const lines = reservations.map((r, index) => {
      if (r.bookingKind === 'restaurant_table') {
        const date = r.bookingDate ? formatDisplayDate(r.bookingDate) : '—';
        const paid = r.paymentStatus === 'approved' ? ' ✅ Pagada' : '';
        return (
          `*${index + 1}.* ${date} · ${r.bookingTime ?? '—'}\n` +
          `   ${r.partySize ?? '?'} pax · ${r.diningZoneName ?? 'Mesa'}${paid}`
        );
      }
      const checkIn = r.checkIn ? formatDisplayDate(r.checkIn) : '—';
      const checkOut = r.checkOut ? formatDisplayDate(r.checkOut) : '—';
      const paid = r.paymentStatus === 'approved' ? ' ✅ Pagada' : '';
      return (
        `*${index + 1}.* ${checkIn} → ${checkOut}\n` +
        `   ${r.roomName ?? 'Habitación'} · ${r.adults ?? '?'} huésped(es)${paid}`
      );
    });

    await this.whatsapp.sendText(
      hotelId,
      phone,
      `Estas son las reservas que encontré para tu número:\n\n${lines.join('\n\n')}\n\n` +
        `¿Necesitas cambiar algo? Escribe *asesor* para hablar con el ${teamLabel}.\n` +
        `_Escribe *menu* para volver al inicio._`,
    );
  }

  buildFlowContextNote(session: {
    state: string;
    bookingDate?: string | null;
    bookingTime?: string | null;
    partySize?: number | null;
    checkIn?: string | null;
    checkOut?: string | null;
    adults?: number | null;
  }): string | undefined {
    if (session.state === 'idle' || session.state === 'faq') return undefined;

    const parts: string[] = [`Estado: ${session.state}`];
    if (session.bookingDate) parts.push(`Fecha: ${session.bookingDate}`);
    if (session.bookingTime) parts.push(`Hora: ${session.bookingTime}`);
    if (session.partySize) parts.push(`Personas: ${session.partySize}`);
    if (session.checkIn) parts.push(`Check-in: ${session.checkIn}`);
    if (session.checkOut) parts.push(`Check-out: ${session.checkOut}`);
    if (session.adults) parts.push(`Huéspedes: ${session.adults}`);
    return parts.join(' · ');
  }

  private async notifyStaff(
    hotelId: string,
    business: HandoffBusinessContext,
    guestPhone: string,
    contextNote: string | undefined,
    openNow: boolean,
  ) {
    const settings = await this.getChatSettings(hotelId, business.vertical);
    if (!settings.notificationEmail) {
      this.logger.warn(`Handoff sin email de notificación para hotel ${hotelId}`);
      return;
    }

    await this.email.sendHumanHandoffNotification(settings.notificationEmail, {
      businessName: business.name,
      verticalLabel: BUSINESS_VERTICAL_LABELS[business.vertical],
      guestPhone,
      contextNote,
      openNow,
    });
  }

  private async readContext(sessionId: string): Promise<Record<string, unknown>> {
    const session = await this.prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: { contextJson: true },
    });
    const raw = session?.contextJson;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }
}
