import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { HotelsService } from './hotels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoreIntegratorService } from '../core-integrator/core-integrator.service';

class UpdateWhatsAppDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  phone_number_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  access_token?: string;
}

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

  @Get('me/payment-config')
  getPaymentConfig(@Request() req: { user: { hotelId: string } }) {
    return this.hotels.getPaymentConfig(req.user.hotelId);
  }

  @Get('me/whatsapp')
  getWhatsApp(@Request() req: { user: { hotelId: string } }) {
    return this.hotels.getWhatsAppConfig(req.user.hotelId);
  }

  @Put('me/whatsapp')
  updateWhatsApp(
    @Request() req: { user: { hotelId: string } },
    @Body() body: UpdateWhatsAppDto,
  ) {
    return this.hotels.updateWhatsApp(req.user.hotelId, body);
  }

  @Post('me/whatsapp/validate')
  async validateWhatsApp(@Request() req: { user: { hotelId: string } }) {
    const valid = await this.hotels.validateWhatsApp(req.user.hotelId);
    return { valid };
  }
}
