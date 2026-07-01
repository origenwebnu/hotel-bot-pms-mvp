import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { SubscriptionBillingService } from '../platform-billing/subscription-billing.service';

@Controller('super-admin/billing')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SuperAdminBillingController {
  constructor(private readonly billing: SubscriptionBillingService) {}

  @Get('config')
  getConfig() {
    return this.billing.getPlatformBillingConfig();
  }

  @Put('config')
  updateConfig(
    @Body()
    body: {
      mercadopago_access_token?: string;
      mercadopago_public_key?: string;
    },
  ) {
    return this.billing.updatePlatformBillingConfig(body);
  }

  @Post('config/validate')
  validateConfig() {
    return this.billing.validatePlatformBillingConfig();
  }
}
