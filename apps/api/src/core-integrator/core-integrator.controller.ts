import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CoreIntegratorService } from './core-integrator.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('hotels/:hotelId/pms')
@UseGuards(JwtAuthGuard)
export class CoreIntegratorController {
  constructor(private readonly coreIntegrator: CoreIntegratorService) {}

  @Get('availability')
  async getAvailability(
    @Param('hotelId') hotelId: string,
    @Query('check_in') checkIn: string,
    @Query('check_out') checkOut: string,
    @Query('adults') adults: string,
    @Query('children') children?: string,
  ) {
    return this.coreIntegrator.getAvailability(hotelId, {
      check_in: checkIn,
      check_out: checkOut,
      adults: parseInt(adults, 10),
      children: children ? parseInt(children, 10) : 0,
    });
  }

  @Get('validate')
  async validateCredentials(@Param('hotelId') hotelId: string) {
    const valid = await this.coreIntegrator.validatePmsCredentials(hotelId);
    return { valid };
  }
}
