import { Module } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { HotelsController } from './hotels.controller';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    CoreIntegratorModule,
    AuthModule,
    WhatsAppModule,
    CheckoutModule,
    SubscriptionModule,
  ],
  controllers: [HotelsController],
  providers: [HotelsService],
})
export class HotelsModule {}
