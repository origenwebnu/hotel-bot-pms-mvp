import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';

@Controller('hotels')
@UseGuards(JwtAuthGuard)
export class HotelsController {
  constructor(
    private readonly hotels: HotelsService,
    private readonly pms: CoreIntegratorService,
  ) {}

  @Get('me')
  getMyHotel(@Request() req: { user: { hotelId: string } }) {
    return this.hotels.getHotel(req.user.hotelId);
  }

  @Get('me/integration')
  getIntegration(@Request() req: { user: { hotelId: string } }) {
    return this.hotels.getIntegrationStatus(req.user.hotelId);
  }

  @Put('me/integration')
  updateIntegration(
    @Request() req: { user: { hotelId: string } },
    @Body() body: Record<string, string>,
  ) {
    return this.hotels.updateIntegration(req.user.hotelId, body);
  }

  @Get('me/integration/validate-pms')
  async validatePms(@Request() req: { user: { hotelId: string } }) {
    const valid = await this.pms.validatePmsCredentials(req.user.hotelId);
    return { valid };
  }
}
