import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [AuthModule, SubscriptionModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminBootstrapService],
})
export class SuperAdminModule {}
