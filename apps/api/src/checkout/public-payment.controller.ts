import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDisplayDate } from '@hotel-bot/shared';

@Controller('public/payments')
export class PublicPaymentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getPaymentCheckout(
    @Param('id') id: string,
    @Query('token') token?: string,
  ) {
    const reservation = await this.loadReservation(id, token);
    const hotel = reservation.hotel;

    return {
      reservation_id: reservation.id,
      status: reservation.status,
      payment_status: reservation.paymentStatus,
      hotel_name: hotel.name,
      room_name: reservation.roomName,
      check_in: reservation.checkIn,
      check_out: reservation.checkOut,
      check_in_label: reservation.checkIn
        ? formatDisplayDate(reservation.checkIn)
        : null,
      check_out_label: reservation.checkOut
        ? formatDisplayDate(reservation.checkOut)
        : null,
      guests: (reservation.adults ?? 0) + (reservation.children ?? 0),
      amount: reservation.totalAmount,
      original_amount: reservation.originalAmount,
      discount_percent: reservation.discountPercent,
      currency: reservation.currency,
      guest_name: [reservation.guestFirstName, reservation.guestLastName]
        .filter(Boolean)
        .join(' '),
      guest_email: reservation.guestEmail,
      hold_expires_at: reservation.holdExpiresAt,
      payment_provider_url: reservation.paymentLink,
      payment_page_token: reservation.paymentAccessToken,
    };
  }

  @Get(':id/status')
  async getPaymentStatus(
    @Param('id') id: string,
    @Query('token') token?: string,
  ) {
    const reservation = await this.loadReservation(id, token);
    const latestEvent = await this.prisma.paymentEvent.findFirst({
      where: { reservationId: reservation.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      reservation_id: reservation.id,
      status: reservation.status,
      payment_status: reservation.paymentStatus ?? latestEvent?.status ?? 'pending',
      payment_event_id: latestEvent?.externalId ?? reservation.paymentId,
      amount: reservation.totalAmount,
      currency: reservation.currency,
      hotel_name: reservation.hotel.name,
      room_name: reservation.roomName,
      check_in_label: reservation.checkIn
        ? formatDisplayDate(reservation.checkIn)
        : null,
      check_out_label: reservation.checkOut
        ? formatDisplayDate(reservation.checkOut)
        : null,
      guest_name: [reservation.guestFirstName, reservation.guestLastName]
        .filter(Boolean)
        .join(' '),
      guest_email: reservation.guestEmail,
      guests: (reservation.adults ?? 0) + (reservation.children ?? 0),
      original_amount: reservation.originalAmount,
      discount_percent: reservation.discountPercent,
      recommendations: reservation.hotel.reservationRecommendations,
    };
  }

  private async loadReservation(id: string, token?: string) {
    if (!token) {
      throw new UnauthorizedException('Token de pago requerido');
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        hotel: {
          select: {
            name: true,
            reservationRecommendations: true,
          },
        },
      },
    });

    if (!reservation || reservation.paymentAccessToken !== token) {
      throw new NotFoundException('Reserva no encontrada');
    }

    if (reservation.holdExpiresAt && reservation.holdExpiresAt < new Date()) {
      if (!['confirmed', 'payment_pending'].includes(reservation.status)) {
        throw new NotFoundException('El tiempo para pagar esta reserva expiró');
      }
    }

    return reservation;
  }
}
