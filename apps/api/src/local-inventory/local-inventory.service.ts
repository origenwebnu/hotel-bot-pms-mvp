import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type {
  AvailabilityQuery,
  AvailabilityResult,
  ConfirmReservationRequest,
  RoomHoldRequest,
  RoomHoldResult,
  StandardRoomAvailability,
} from '@hotel-bot/shared';
import { filterValidMediaUrls, sanitizeWhatsAppText } from '@hotel-bot/shared';
import { PrismaService } from '../prisma/prisma.service';

const BLOCKING_STATUSES = ['hold', 'payment_pending', 'confirmed'];

@Injectable()
export class LocalInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getAvailability(
    hotelId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResult> {
    const roomTypes = await this.prisma.roomType.findMany({
      where: { hotelId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const blocking = await this.getBlockingReservations(
      hotelId,
      query.check_in,
      query.check_out,
    );

    const guests = query.adults + (query.children ?? 0);
    const rooms: StandardRoomAvailability[] = [];

    for (const rt of roomTypes) {
      if (guests > rt.maxOccupancy) continue;

      const used = this.countUsedUnits(
        blocking.filter((r) => r.roomTypeId === rt.id),
      );
      const available = rt.totalUnits - used;
      if (available <= 0) continue;

      rooms.push({
        room_type_id: rt.id,
        name: sanitizeWhatsAppText(rt.name, 60),
        description: rt.description
          ? sanitizeWhatsAppText(rt.description, 200)
          : undefined,
        price: rt.pricePerNight,
        currency: rt.currency,
        photos_urls: filterValidMediaUrls(rt.photoUrls),
        max_occupancy: rt.maxOccupancy,
        available_units: available,
      });
    }

    return {
      rooms,
      pms_source: 'local',
      queried_at: new Date().toISOString(),
    };
  }

  async holdRoom(
    hotelId: string,
    request: RoomHoldRequest,
  ): Promise<RoomHoldResult> {
    const roomType = await this.prisma.roomType.findFirst({
      where: { id: request.room_type_id, hotelId, isActive: true },
    });
    if (!roomType) {
      throw new NotFoundException('Tipo de habitación no encontrado');
    }

    const guests = request.adults + (request.children ?? 0);
    if (guests > roomType.maxOccupancy) {
      throw new BadRequestException('Excede la capacidad de la habitación');
    }

    const blocking = await this.getBlockingReservations(
      hotelId,
      request.check_in,
      request.check_out,
    );
    const used = this.countUsedUnits(
      blocking.filter((r) => r.roomTypeId === roomType.id),
    );
    if (used >= roomType.totalUnits) {
      throw new ConflictException('No hay unidades disponibles para esas fechas');
    }

    const nights = this.nightsBetween(request.check_in, request.check_out);
    const total = roomType.pricePerNight * nights;
    const expiresAt = new Date(
      Date.now() + request.hold_ttl_minutes * 60 * 1000,
    );
    const holdId = `local-${request.idempotency_key}`;

    return {
      hold_id: holdId,
      pms_reservation_id: holdId,
      expires_at: expiresAt.toISOString(),
      room_type_id: roomType.id,
      total_amount: total,
      currency: roomType.currency,
    };
  }

  async confirmReservation(
    _hotelId: string,
    request: ConfirmReservationRequest,
  ): Promise<{ reservation_id: string; confirmation_code?: string }> {
    const code = request.pms_reservation_id.replace('local-', '').slice(-8).toUpperCase();
    return {
      reservation_id: request.pms_reservation_id,
      confirmation_code: `BK-${code}`,
    };
  }

  async releaseHold(hotelId: string, pmsReservationId: string): Promise<void> {
    await this.prisma.reservation.updateMany({
      where: {
        hotelId,
        pmsReservationId,
        status: { in: ['hold', 'payment_pending'] },
      },
      data: { status: 'expired' },
    });
  }

  async hasInventory(hotelId: string): Promise<boolean> {
    const count = await this.prisma.roomType.count({
      where: { hotelId, isActive: true },
    });
    return count > 0;
  }

  private async getBlockingReservations(
    hotelId: string,
    checkIn: string,
    checkOut: string,
  ) {
    const now = new Date();
    const reservations = await this.prisma.reservation.findMany({
      where: {
        hotelId,
        roomTypeId: { not: null },
        status: { in: BLOCKING_STATUSES },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });

    return reservations.filter((r) => {
      if (r.status === 'confirmed') return true;
      if (!r.holdExpiresAt) return true;
      return r.holdExpiresAt > now;
    });
  }

  private countUsedUnits(
    reservations: Array<{ roomTypeId: string | null }>,
  ): number {
    return reservations.length;
  }

  private nightsBetween(checkIn: string, checkOut: string): number {
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    const nights = Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    return Math.max(1, nights);
  }
}
