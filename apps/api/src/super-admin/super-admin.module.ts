import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminBillingController } from './super-admin-billing.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { PlatformBillingModule } from '../platform-billing/subscription-billing.module';

@Module({
  imports: [AuthModule, SubscriptionModule, ReservationsModule, PlatformBillingModule],
  controllers: [SuperAdminController, SuperAdminBillingController],
  providers: [SuperAdminService, SuperAdminBootstrapService],
})
export class SuperAdminModule {}
