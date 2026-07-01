import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RESTAURANT_OCCASION_LABELS,
  RESTAURANT_OCCASIONS,
  formatDisplayDate,
  type RestaurantAddOnSelection,
  type RestaurantOccasion,
} from '@hotel-bot/shared';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { SubscriptionLimitError } from '../subscription/subscription.errors';
import { RestaurantInventoryService } from './restaurant-inventory.service';

const DASHBOARD_SESSION_PHONE = 'dashboard-manual';

export interface CreateManualReservationInput {
  booking_date: string;
  booking_time: string;
  party_size: number;
  dining_zone_id: string;
  occasion_type: RestaurantOccasion;
  guest_first_name: string;
  guest_last_name?: string;
  guest_phone?: string;
  special_requests?: string;
  addon_ids?: string[];
}

@Injectable()
export class RestaurantReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: RestaurantInventoryService,
    private readonly subscription: SubscriptionService,
    private readonly email: EmailService,
  ) {}

  async createManualReservation(hotelId: string, body: CreateManualReservationInput) {
    try {
      await this.subscription.assertCanCreateReservation(hotelId);
    } catch (error) {
      if (error instanceof SubscriptionLimitError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    if (!body.booking_date || !body.booking_time) {
      throw new BadRequestException('Fecha y hora son obligatorias');
    }
    if (!body.party_size || body.party_size < 1) {
      throw new BadRequestException('Indica el número de personas');
    }
    if (!body.dining_zone_id) {
      throw new BadRequestException('Selecciona una zona o ambiente');
    }
    if (!body.guest_first_name?.trim()) {
      throw new BadRequestException('Indica el nombre del comensal');
    }
    if (!RESTAURANT_OCCASIONS.includes(body.occasion_type)) {
      throw new BadRequestException('Ocasión no válida');
    }

    await this.inventory.assertZoneAvailable(
      hotelId,
      body.dining_zone_id,
      body.booking_date,
      body.booking_time,
      body.party_size,
      { forManual: true },
    );

    const quote = await this.inventory.buildQuote(hotelId, {
      dining_zone_id: body.dining_zone_id,
      date: body.booking_date,
      time: body.booking_time,
      party_size: body.party_size,
      addon_ids: body.addon_ids ?? [],
    });

    const zones = await this.inventory.listZones(hotelId);
    const zone = zones.find((z) => z.id === body.dining_zone_id);
    if (!zone) throw new NotFoundException('Zona no encontrada');

    const session = await this.ensureDashboardSession(hotelId);
    const idempotencyKey = `manual-${hotelId}-${body.dining_zone_id}-${body.booking_date}-${body.booking_time}-${Date.now()}`;

    const addonIds = body.addon_ids ?? [];
    const addons = addonIds.length
      ? ((await this.inventory.listAddOns(hotelId))
          .filter((a) => addonIds.includes(a.id))
          .map((a) => ({ id: a.id, name: a.name, price: a.price, quantity: 1 })) as RestaurantAddOnSelection[])
      : [];

    const reservation = await this.prisma.reservation.create({
      data: {
        hotelId,
        whatsappSessionId: session.id,
        idempotencyKey,
        status: 'confirmed',
        bookingKind: 'restaurant_table',
        diningZoneId: body.dining_zone_id,
        diningZoneName: zone.name,
        bookingDate: body.booking_date,
        bookingTime: body.booking_time,
        partySize: body.party_size,
        occasionType: body.occasion_type,
        specialRequests: body.special_requests?.trim() || null,
        addOnsJson: addons.length ? (addons as object) : Prisma.DbNull,
        totalAmount: quote.total,
        currency: quote.currency,
        guestFirstName: body.guest_first_name.trim(),
        guestLastName: body.guest_last_name?.trim() || body.guest_first_name.trim(),
        guestPhone: body.guest_phone?.trim() || null,
      },
    });

    await this.subscription.recordBillableReservation(hotelId, reservation.id);

    const settings = await this.inventory.getSettings(hotelId);
    const emailTo = settings.notification_email?.trim();
    if (emailTo) {
      const hotel = await this.prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { name: true },
      });
      const occasion =
        RESTAURANT_OCCASION_LABELS[body.occasion_type as RestaurantOccasion] ??
        body.occasion_type;
      await this.email.sendRestaurantReservationNotification(emailTo, {
        restaurantName: hotel?.name ?? 'Restaurante',
        guestName: [reservation.guestFirstName, reservation.guestLastName]
          .filter(Boolean)
          .join(' '),
        guestPhone: reservation.guestPhone,
        dateLabel: reservation.bookingDate
          ? formatDisplayDate(reservation.bookingDate)
          : body.booking_date,
        time: reservation.bookingTime ?? body.booking_time,
        partySize: reservation.partySize ?? body.party_size,
        zoneName: reservation.diningZoneName ?? zone.name,
        occasionLabel: occasion,
        totalLabel: `${reservation.currency ?? 'COP'} ${(reservation.totalAmount ?? 0).toLocaleString('es-CO')}`,
        specialRequests: reservation.specialRequests,
        receiptUrl: null,
      });
    }

    return {
      id: reservation.id,
      status: reservation.status,
      outcome: 'approved' as const,
      booking_date: reservation.bookingDate,
      booking_time: reservation.bookingTime,
      party_size: reservation.partySize,
      dining_zone_name: reservation.diningZoneName,
      guest: {
        first_name: reservation.guestFirstName,
        last_name: reservation.guestLastName,
        full_name: [reservation.guestFirstName, reservation.guestLastName]
          .filter(Boolean)
          .join(' '),
        whatsapp: reservation.guestPhone,
      },
      total_amount: reservation.totalAmount,
      currency: reservation.currency,
    };
  }

  private async ensureDashboardSession(hotelId: string) {
    return this.prisma.conversationSession.upsert({
      where: {
        hotelId_whatsappPhone: {
          hotelId,
          whatsappPhone: DASHBOARD_SESSION_PHONE,
        },
      },
      create: {
        hotelId,
        whatsappPhone: DASHBOARD_SESSION_PHONE,
        state: 'idle',
      },
      update: {
        lastMessageAt: new Date(),
      },
    });
  }
}
