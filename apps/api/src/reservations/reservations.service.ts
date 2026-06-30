import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildOutcomeFilter,
  getReservationOutcome,
  type ReservationOutcome,
} from './reservation-outcome';

export interface ReservationListFilters {
  outcome?: ReservationOutcome;
  from?: string;
  to?: string;
  booking_from?: string;
  booking_to?: string;
  booking_kind?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    const filter: Prisma.DateTimeFilter = {};
    if (from) {
      const start = new Date(from);
      if (!Number.isNaN(start.getTime())) filter.gte = start;
    }
    if (to) {
      const end = new Date(to);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filter.lte = end;
      }
    }
    return Object.keys(filter).length ? filter : undefined;
  }

  private formatReservation(row: {
    id: string;
    hotelId: string;
    whatsappSessionId: string;
    status: string;
    bookingKind: string;
    roomTypeId: string | null;
    roomName: string | null;
    diningZoneId: string | null;
    diningZoneName: string | null;
    bookingDate: string | null;
    bookingTime: string | null;
    partySize: number | null;
    occasionType: string | null;
    specialRequests: string | null;
    checkIn: string | null;
    checkOut: string | null;
    adults: number | null;
    children: number | null;
    totalAmount: number | null;
    currency: string | null;
    paymentStatus: string | null;
    guestFirstName: string | null;
    guestLastName: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const outcome = getReservationOutcome(row.status, row.paymentStatus);
    return {
      id: row.id,
      hotel_id: row.hotelId,
      whatsapp_session_id: row.whatsappSessionId,
      status: row.status,
      outcome,
      booking_kind: row.bookingKind,
      room_type_id: row.roomTypeId,
      room_name: row.roomName,
      dining_zone_id: row.diningZoneId,
      dining_zone_name: row.diningZoneName,
      booking_date: row.bookingDate,
      booking_time: row.bookingTime,
      party_size: row.partySize,
      occasion_type: row.occasionType,
      special_requests: row.specialRequests,
      check_in: row.checkIn,
      check_out: row.checkOut,
      adults: row.adults,
      children: row.children,
      total_amount: row.totalAmount,
      currency: row.currency,
      payment_status: row.paymentStatus,
      guest: {
        first_name: row.guestFirstName,
        last_name: row.guestLastName,
        email: row.guestEmail,
        whatsapp: row.guestPhone,
        full_name: [row.guestFirstName, row.guestLastName].filter(Boolean).join(' ') || null,
      },
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private parseBookingDateRange(from?: string, to?: string): Prisma.StringFilter | undefined {
    const filter: Prisma.StringFilter = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) filter.gte = from;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) filter.lte = to;
    return Object.keys(filter).length ? filter : undefined;
  }

  async listForHotel(hotelId: string, filters: ReservationListFilters = {}) {
    await this.assertHotelExists(hotelId);

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
    const skip = (page - 1) * limit;

    const createdAt = this.parseDateRange(filters.from, filters.to);
    const bookingDate = this.parseBookingDateRange(filters.booking_from, filters.booking_to);
    const where: Prisma.ReservationWhereInput = {
      hotelId,
      ...(createdAt && { createdAt }),
      ...(bookingDate && { bookingDate }),
      ...(filters.booking_kind && { bookingKind: filters.booking_kind }),
      ...(filters.outcome && buildOutcomeFilter(filters.outcome)),
    };

    const orderBy = bookingDate
      ? [{ bookingDate: 'asc' as const }, { bookingTime: 'asc' as const }]
      : [{ createdAt: 'desc' as const }];

    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.formatReservation(r)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStatsForHotel(
    hotelId: string,
    filters: { from?: string; to?: string } = {},
  ) {
    await this.assertHotelExists(hotelId);

    const createdAt = this.parseDateRange(filters.from, filters.to);
    const reservationDate = createdAt ? { createdAt } : {};
    const conversationDate = this.parseDateRange(filters.from, filters.to);
    const sessionDate = conversationDate ? { lastMessageAt: conversationDate } : {};

    const baseWhere: Prisma.ReservationWhereInput = {
      hotelId,
      ...reservationDate,
    };

    const [approved, rejected, pending, conversations, totalReservations] =
      await Promise.all([
        this.prisma.reservation.count({
          where: { ...baseWhere, ...buildOutcomeFilter('approved') },
        }),
        this.prisma.reservation.count({
          where: { ...baseWhere, ...buildOutcomeFilter('rejected') },
        }),
        this.prisma.reservation.count({
          where: { ...baseWhere, ...buildOutcomeFilter('pending') },
        }),
        this.prisma.conversationSession.count({
          where: { hotelId, ...sessionDate },
        }),
        this.prisma.reservation.count({ where: baseWhere }),
      ]);

    return {
      reservations: {
        total: totalReservations,
        approved,
        rejected,
        pending,
      },
      conversations: { total: conversations },
      period: {
        from: filters.from ?? null,
        to: filters.to ?? null,
      },
    };
  }

  private async assertHotelExists(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: { id: true, name: true },
    });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    return hotel;
  }
}
