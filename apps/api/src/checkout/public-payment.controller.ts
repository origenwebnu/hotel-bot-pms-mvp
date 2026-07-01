import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { formatDisplayDate } from '@hotel-bot/shared';

@Controller('public/payments')
export class PublicPaymentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  @Get(':id')
  async getPaymentCheckout(
    @Param('id') id: string,
    @Query('token') token?: string,
  ) {
    const reservation = await this.loadReservation(id, token);
    const hotel = reservation.hotel;
    const integration = await this.prisma.hotelIntegration.findUnique({
      where: { hotelId: reservation.hotelId },
      select: { paymentProvider: true },
    });
    const paymentProvider = integration?.paymentProvider ?? 'wompi';
    let epaycoPublicKey: string | null = null;
    if (paymentProvider === 'epayco') {
      epaycoPublicKey = await this.loadPublicPaymentKey(reservation.hotelId);
    }

    const guestName = [reservation.guestFirstName, reservation.guestLastName]
      .filter(Boolean)
      .join(' ');

    return {
      reservation_id: reservation.id,
      status: reservation.status,
      payment_status: reservation.paymentStatus,
      booking_kind: reservation.bookingKind,
      business_vertical: hotel.businessVertical,
      hotel_name: hotel.name,
      room_name: reservation.roomName,
      dining_zone_name: reservation.diningZoneName,
      booking_date: reservation.bookingDate,
      booking_time: reservation.bookingTime,
      party_size: reservation.partySize,
      check_in: reservation.checkIn,
      check_out: reservation.checkOut,
      check_in_label: reservation.checkIn
        ? formatDisplayDate(reservation.checkIn)
        : null,
      check_out_label: reservation.checkOut
        ? formatDisplayDate(reservation.checkOut)
        : null,
      booking_date_label: reservation.bookingDate
        ? formatDisplayDate(reservation.bookingDate)
        : null,
      guests: (reservation.adults ?? 0) + (reservation.children ?? 0),
      amount: reservation.totalAmount,
      original_amount: reservation.originalAmount,
      discount_percent: reservation.discountPercent,
      currency: reservation.currency,
      guest_name: guestName,
      guest_email: reservation.guestEmail,
      hold_expires_at: reservation.holdExpiresAt,
      payment_provider: paymentProvider,
      payment_provider_url: reservation.paymentLink,
      epayco_session_id:
        paymentProvider === 'epayco' ? reservation.paymentId : null,
      epayco_public_key: epaycoPublicKey,
      epayco_test_mode: epaycoPublicKey?.includes('test') ?? false,
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

    const guestName = [reservation.guestFirstName, reservation.guestLastName]
      .filter(Boolean)
      .join(' ');

    const recommendations =
      reservation.bookingKind === 'restaurant_table'
        ? reservation.hotel.restaurantSettings?.postPaymentMessage ??
          reservation.hotel.reservationRecommendations
        : reservation.hotel.reservationRecommendations;

    return {
      reservation_id: reservation.id,
      status: reservation.status,
      payment_status: reservation.paymentStatus ?? latestEvent?.status ?? 'pending',
      payment_event_id: latestEvent?.externalId ?? reservation.paymentId,
      booking_kind: reservation.bookingKind,
      business_vertical: reservation.hotel.businessVertical,
      amount: reservation.totalAmount,
      currency: reservation.currency,
      hotel_name: reservation.hotel.name,
      room_name: reservation.roomName,
      dining_zone_name: reservation.diningZoneName,
      booking_date: reservation.bookingDate,
      booking_time: reservation.bookingTime,
      party_size: reservation.partySize,
      check_in_label: reservation.checkIn
        ? formatDisplayDate(reservation.checkIn)
        : null,
      check_out_label: reservation.checkOut
        ? formatDisplayDate(reservation.checkOut)
        : null,
      booking_date_label: reservation.bookingDate
        ? formatDisplayDate(reservation.bookingDate)
        : null,
      guest_name: guestName,
      guest_email: reservation.guestEmail,
      guests: (reservation.adults ?? 0) + (reservation.children ?? 0),
      original_amount: reservation.originalAmount,
      discount_percent: reservation.discountPercent,
      recommendations,
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
            businessVertical: true,
            reservationRecommendations: true,
            restaurantSettings: {
              select: { postPaymentMessage: true },
            },
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

  private async loadPublicPaymentKey(hotelId: string): Promise<string | null> {
    const cred = await this.prisma.encryptedCredential.findUnique({
      where: {
        hotelId_credentialType: {
          hotelId,
          credentialType: 'payment_public_key',
        },
      },
    });
    if (!cred) return null;
    try {
      return this.crypto.decrypt(cred.encryptedValue);
    } catch {
      return null;
    }
  }
}
