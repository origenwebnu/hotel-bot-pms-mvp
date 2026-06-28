import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  DEFAULT_SERVICE_HOURS,
  buildRestaurantQuote,
  generateTimeSlots,
  getServiceHoursForDate,
  type RestaurantAddOnSelection,
  type ServiceHoursMap,
} from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';

const BLOCKING_STATUSES = ['hold', 'payment_pending', 'confirmed'];

@Injectable()
export class RestaurantInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSettings(hotelId: string) {
    return this.prisma.restaurantSettings.upsert({
      where: { hotelId },
      create: {
        hotelId,
        serviceHoursJson: DEFAULT_SERVICE_HOURS as object,
      },
      update: {},
    });
  }

  async getSettings(hotelId: string) {
    const settings = await this.ensureSettings(hotelId);
    return this.formatSettings(settings);
  }

  async updateSettings(
    hotelId: string,
    data: Partial<{
      require_payment: boolean;
      post_payment_message: string;
      post_payment_link: string;
      slot_interval_minutes: number;
      default_duration_minutes: number;
      max_covers_per_slot: number | null;
      advance_booking_days: number;
      min_advance_hours: number;
      service_hours_json: ServiceHoursMap;
    }>,
  ) {
    await this.ensureSettings(hotelId);
    const settings = await this.prisma.restaurantSettings.update({
      where: { hotelId },
      data: {
        ...(data.require_payment !== undefined && {
          requirePayment: data.require_payment,
        }),
        ...(data.post_payment_message !== undefined && {
          postPaymentMessage: data.post_payment_message.trim() || null,
        }),
        ...(data.post_payment_link !== undefined && {
          postPaymentLink: data.post_payment_link.trim() || null,
        }),
        ...(data.slot_interval_minutes !== undefined && {
          slotIntervalMinutes: data.slot_interval_minutes,
        }),
        ...(data.default_duration_minutes !== undefined && {
          defaultDurationMinutes: data.default_duration_minutes,
        }),
        ...(data.max_covers_per_slot !== undefined && {
          maxCoversPerSlot: data.max_covers_per_slot,
        }),
        ...(data.advance_booking_days !== undefined && {
          advanceBookingDays: data.advance_booking_days,
        }),
        ...(data.min_advance_hours !== undefined && {
          minAdvanceHours: data.min_advance_hours,
        }),
        ...(data.service_hours_json !== undefined && {
          serviceHoursJson: data.service_hours_json as object,
        }),
      },
    });
    return this.formatSettings(settings);
  }

  async listZones(hotelId: string) {
    const zones = await this.prisma.diningZone.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return zones.map((z) => this.formatZone(z));
  }

  async createZone(
    hotelId: string,
    body: {
      name: string;
      description?: string;
      min_party_size?: number;
      max_party_size: number;
      capacity_per_slot?: number;
      base_reservation_fee?: number;
      base_price_per_guest?: number;
      currency?: string;
    },
  ) {
    const zone = await this.prisma.diningZone.create({
      data: {
        hotelId,
        name: body.name.trim(),
        description: body.description?.trim(),
        minPartySize: body.min_party_size ?? 1,
        maxPartySize: body.max_party_size,
        capacityPerSlot: body.capacity_per_slot ?? 1,
        baseReservationFee: body.base_reservation_fee ?? 0,
        basePricePerGuest: body.base_price_per_guest ?? 0,
        currency: body.currency ?? 'COP',
      },
    });
    return this.formatZone(zone);
  }

  async updateZone(hotelId: string, id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.diningZone.findFirst({
      where: { id, hotelId },
    });
    if (!existing) throw new NotFoundException('Zona no encontrada');

    const zone = await this.prisma.diningZone.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.description !== undefined && {
          description: String(body.description).trim(),
        }),
        ...(body.min_party_size !== undefined && {
          minPartySize: Number(body.min_party_size),
        }),
        ...(body.max_party_size !== undefined && {
          maxPartySize: Number(body.max_party_size),
        }),
        ...(body.capacity_per_slot !== undefined && {
          capacityPerSlot: Number(body.capacity_per_slot),
        }),
        ...(body.base_reservation_fee !== undefined && {
          baseReservationFee: Number(body.base_reservation_fee),
        }),
        ...(body.base_price_per_guest !== undefined && {
          basePricePerGuest: Number(body.base_price_per_guest),
        }),
        ...(body.is_active !== undefined && { isActive: Boolean(body.is_active) }),
        ...(body.sort_order !== undefined && { sortOrder: Number(body.sort_order) }),
      },
    });
    return this.formatZone(zone);
  }

  async deleteZone(hotelId: string, id: string) {
    await this.prisma.diningZone.deleteMany({ where: { id, hotelId } });
    return { ok: true };
  }

  async listAddOns(hotelId: string) {
    const items = await this.prisma.restaurantAddOn.findMany({
      where: { hotelId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map((a) => this.formatAddOn(a));
  }

  async createAddOn(
    hotelId: string,
    body: { name: string; description?: string; price: number; max_quantity?: number },
  ) {
    const item = await this.prisma.restaurantAddOn.create({
      data: {
        hotelId,
        name: body.name.trim(),
        description: body.description?.trim(),
        price: body.price,
        maxQuantity: body.max_quantity ?? 1,
      },
    });
    return this.formatAddOn(item);
  }

  async updateAddOn(hotelId: string, id: string, body: Record<string, unknown>) {
    const existing = await this.prisma.restaurantAddOn.findFirst({
      where: { id, hotelId },
    });
    if (!existing) throw new NotFoundException('Adicional no encontrado');

    const item = await this.prisma.restaurantAddOn.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: String(body.name).trim() }),
        ...(body.description !== undefined && {
          description: String(body.description).trim(),
        }),
        ...(body.price !== undefined && { price: Number(body.price) }),
        ...(body.max_quantity !== undefined && {
          maxQuantity: Number(body.max_quantity),
        }),
        ...(body.is_active !== undefined && { isActive: Boolean(body.is_active) }),
        ...(body.sort_order !== undefined && { sortOrder: Number(body.sort_order) }),
      },
    });
    return this.formatAddOn(item);
  }

  async deleteAddOn(hotelId: string, id: string) {
    await this.prisma.restaurantAddOn.deleteMany({ where: { id, hotelId } });
    return { ok: true };
  }

  async listDateRates(hotelId: string, from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const rates = await this.prisma.restaurantDateRate.findMany({
      where: { hotelId, date: { gte: fromDate, lte: toDate } },
      include: { diningZone: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    return rates.map((r) => this.formatDateRate(r));
  }

  async upsertDateRate(
    hotelId: string,
    body: {
      date: string;
      dining_zone_id?: string | null;
      closed?: boolean;
      label?: string;
      reservation_fee_override?: number | null;
      price_per_guest_override?: number | null;
    },
  ) {
    const date = new Date(`${body.date}T00:00:00.000Z`);
    if (body.dining_zone_id) {
      const zone = await this.prisma.diningZone.findFirst({
        where: { id: body.dining_zone_id, hotelId },
      });
      if (!zone) throw new BadRequestException('Zona inválida');
    }

    const diningZoneId = body.dining_zone_id ?? null;
    const existing = await this.prisma.restaurantDateRate.findFirst({
      where: { hotelId, diningZoneId, date },
    });

    const data = {
      closed: body.closed ?? false,
      label: body.label?.trim() || null,
      reservationFeeOverride: body.reservation_fee_override ?? null,
      pricePerGuestOverride: body.price_per_guest_override ?? null,
    };

    const rate = existing
      ? await this.prisma.restaurantDateRate.update({
          where: { id: existing.id },
          data,
          include: { diningZone: { select: { id: true, name: true } } },
        })
      : await this.prisma.restaurantDateRate.create({
          data: { hotelId, diningZoneId, date, ...data },
          include: { diningZone: { select: { id: true, name: true } } },
        });

    return this.formatDateRate(rate);
  }

  async deleteDateRate(hotelId: string, id: string) {
    await this.prisma.restaurantDateRate.deleteMany({ where: { id, hotelId } });
    return { ok: true };
  }

  async getAvailableTimeSlots(hotelId: string, date: string) {
    const settings = await this.ensureSettings(hotelId);
    this.assertBookableDate(settings, date);

    const hours = getServiceHoursForDate(
      date,
      settings.serviceHoursJson as ServiceHoursMap | null,
    );
    if (hours.closed) return [];

    const allSlots = generateTimeSlots(
      hours.open,
      hours.close,
      settings.slotIntervalMinutes,
      settings.defaultDurationMinutes,
    );

    const globalRate = await this.getDateRate(hotelId, date, null);
    if (globalRate?.closed) return [];

    const available: string[] = [];
    for (const time of allSlots) {
      if (await this.isSlotOpen(hotelId, date, time, settings)) {
        available.push(time);
      }
    }
    return available;
  }

  async getAvailableZones(
    hotelId: string,
    date: string,
    time: string,
    partySize: number,
  ) {
    const zones = await this.prisma.diningZone.findMany({
      where: { hotelId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const result = [];
    for (const zone of zones) {
      if (partySize < zone.minPartySize || partySize > zone.maxPartySize) continue;
      const zoneRate = await this.getDateRate(hotelId, date, zone.id);
      if (zoneRate?.closed) continue;
      const globalRate = await this.getDateRate(hotelId, date, null);
      if (globalRate?.closed) continue;

      const booked = await this.countZoneBookings(hotelId, date, time, zone.id);
      if (booked >= zone.capacityPerSlot) continue;

      const pricing = this.resolvePricing(zone, globalRate, zoneRate);
      result.push({
        ...this.formatZone(zone),
        quote: buildRestaurantQuote({
          partySize,
          reservationFee: pricing.reservationFee,
          pricePerGuest: pricing.pricePerGuest,
          currency: zone.currency,
          addons: [],
          rateLabel: pricing.label,
        }),
      });
    }
    return result;
  }

  async buildQuote(
    hotelId: string,
    params: {
      dining_zone_id: string;
      date: string;
      time: string;
      party_size: number;
      addon_ids?: string[];
    },
  ) {
    const zone = await this.prisma.diningZone.findFirst({
      where: { id: params.dining_zone_id, hotelId, isActive: true },
    });
    if (!zone) throw new NotFoundException('Zona no encontrada');

    const globalRate = await this.getDateRate(hotelId, params.date, null);
    const zoneRate = await this.getDateRate(hotelId, params.date, zone.id);
    const pricing = this.resolvePricing(zone, globalRate, zoneRate);
    const addons = await this.resolveAddOns(hotelId, params.addon_ids ?? []);

    return buildRestaurantQuote({
      partySize: params.party_size,
      reservationFee: pricing.reservationFee,
      pricePerGuest: pricing.pricePerGuest,
      currency: zone.currency,
      addons,
      rateLabel: pricing.label,
    });
  }

  async assertZoneAvailable(
    hotelId: string,
    zoneId: string,
    date: string,
    time: string,
    partySize: number,
  ) {
    const zones = await this.getAvailableZones(hotelId, date, time, partySize);
    if (!zones.some((z) => z.id === zoneId)) {
      throw new BadRequestException('No hay disponibilidad para esa zona y horario');
    }
  }

  private async isSlotOpen(
    hotelId: string,
    date: string,
    time: string,
    settings: Awaited<ReturnType<typeof this.ensureSettings>>,
  ) {
    const now = new Date();
    const slotStart = new Date(`${date}T${time}:00`);
    const minAdvanceMs = settings.minAdvanceHours * 60 * 60 * 1000;
    if (slotStart.getTime() - now.getTime() < minAdvanceMs) return false;

    if (settings.maxCoversPerSlot != null) {
      const covers = await this.sumCoversInSlot(hotelId, date, time);
      if (covers >= settings.maxCoversPerSlot) return false;
    }
    return true;
  }

  private async countZoneBookings(
    hotelId: string,
    date: string,
    time: string,
    zoneId: string,
  ) {
    const now = new Date();
    return this.prisma.reservation.count({
      where: {
        hotelId,
        bookingKind: 'restaurant_table',
        bookingDate: date,
        bookingTime: time,
        diningZoneId: zoneId,
        status: { in: BLOCKING_STATUSES },
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
      },
    });
  }

  private async sumCoversInSlot(hotelId: string, date: string, time: string) {
    const now = new Date();
    const rows = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        bookingKind: 'restaurant_table',
        bookingDate: date,
        bookingTime: time,
        status: { in: BLOCKING_STATUSES },
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
      },
      select: { partySize: true },
    });
    return rows.reduce((sum, r) => sum + (r.partySize ?? 0), 0);
  }

  private async getDateRate(hotelId: string, date: string, zoneId: string | null) {
    return this.prisma.restaurantDateRate.findFirst({
      where: {
        hotelId,
        diningZoneId: zoneId,
        date: new Date(`${date}T00:00:00.000Z`),
      },
    });
  }

  private resolvePricing(
    zone: { baseReservationFee: number; basePricePerGuest: number },
    globalRate: Awaited<ReturnType<typeof this.getDateRate>>,
    zoneRate: Awaited<ReturnType<typeof this.getDateRate>>,
  ) {
    const reservationFee =
      zoneRate?.reservationFeeOverride ??
      globalRate?.reservationFeeOverride ??
      zone.baseReservationFee;
    const pricePerGuest =
      zoneRate?.pricePerGuestOverride ??
      globalRate?.pricePerGuestOverride ??
      zone.basePricePerGuest;
    const label = zoneRate?.label ?? globalRate?.label ?? null;
    return { reservationFee, pricePerGuest, label };
  }

  private async resolveAddOns(hotelId: string, ids: string[]) {
    if (!ids.length) return [] as RestaurantAddOnSelection[];
    const items = await this.prisma.restaurantAddOn.findMany({
      where: { hotelId, id: { in: ids }, isActive: true },
    });
    return items.map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      quantity: 1,
    }));
  }

  private assertBookableDate(
    settings: Awaited<ReturnType<typeof this.ensureSettings>>,
    date: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${date}T00:00:00`);
    const max = new Date(today);
    max.setDate(max.getDate() + settings.advanceBookingDays);
    if (target < today) throw new BadRequestException('La fecha ya pasó');
    if (target > max) {
      throw new BadRequestException(
        `Solo puedes reservar hasta ${settings.advanceBookingDays} días adelante`,
      );
    }
  }

  private formatSettings(s: {
    requirePayment: boolean;
    postPaymentMessage: string | null;
    postPaymentLink: string | null;
    slotIntervalMinutes: number;
    defaultDurationMinutes: number;
    maxCoversPerSlot: number | null;
    advanceBookingDays: number;
    minAdvanceHours: number;
    serviceHoursJson: unknown;
  }) {
    return {
      require_payment: s.requirePayment,
      post_payment_message: s.postPaymentMessage ?? '',
      post_payment_link: s.postPaymentLink ?? '',
      slot_interval_minutes: s.slotIntervalMinutes,
      default_duration_minutes: s.defaultDurationMinutes,
      max_covers_per_slot: s.maxCoversPerSlot,
      advance_booking_days: s.advanceBookingDays,
      min_advance_hours: s.minAdvanceHours,
      service_hours_json: (s.serviceHoursJson as ServiceHoursMap) ?? DEFAULT_SERVICE_HOURS,
    };
  }

  private formatZone(z: {
    id: string;
    name: string;
    description: string | null;
    minPartySize: number;
    maxPartySize: number;
    capacityPerSlot: number;
    baseReservationFee: number;
    basePricePerGuest: number;
    currency: string;
    isActive: boolean;
    sortOrder: number;
  }) {
    return {
      id: z.id,
      name: z.name,
      description: z.description,
      min_party_size: z.minPartySize,
      max_party_size: z.maxPartySize,
      capacity_per_slot: z.capacityPerSlot,
      base_reservation_fee: z.baseReservationFee,
      base_price_per_guest: z.basePricePerGuest,
      currency: z.currency,
      is_active: z.isActive,
      sort_order: z.sortOrder,
    };
  }

  private formatAddOn(a: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    maxQuantity: number;
    isActive: boolean;
    sortOrder: number;
  }) {
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      price: a.price,
      currency: a.currency,
      max_quantity: a.maxQuantity,
      is_active: a.isActive,
      sort_order: a.sortOrder,
    };
  }

  private formatDateRate(r: {
    id: string;
    date: Date;
    diningZoneId: string | null;
    closed: boolean;
    label: string | null;
    reservationFeeOverride: number | null;
    pricePerGuestOverride: number | null;
    diningZone?: { id: string; name: string } | null;
  }) {
    return {
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      dining_zone_id: r.diningZoneId,
      dining_zone_name: r.diningZone?.name ?? null,
      closed: r.closed,
      label: r.label,
      reservation_fee_override: r.reservationFeeOverride,
      price_per_guest_override: r.pricePerGuestOverride,
    };
  }
}
