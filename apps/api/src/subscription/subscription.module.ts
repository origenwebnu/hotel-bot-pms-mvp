import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  providers: [SubscriptionService, SubscriptionPlanService],
  exports: [SubscriptionService, SubscriptionPlanService],
})
export class SubscriptionModule {}
