import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReservationsService } from './reservations.service';
import type { ReservationOutcome } from './reservation-outcome';

@Controller('hotels/me/reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  list(
    @Request() req: { user: { hotelId: string } },
    @Query('outcome') outcome?: ReservationOutcome,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('booking_from') bookingFrom?: string,
    @Query('booking_to') bookingTo?: string,
    @Query('booking_kind') bookingKind?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reservations.listForHotel(req.user.hotelId, {
      outcome,
      from,
      to,
      booking_from: bookingFrom,
      booking_to: bookingTo,
      booking_kind: bookingKind,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats')
  stats(
    @Request() req: { user: { hotelId: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reservations.getStatsForHotel(req.user.hotelId, { from, to });
  }
}
