import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PaymentProcessor } from './payment.processor';
import { WompiProvider } from './providers/wompi.provider';
import { StripeProvider } from './providers/stripe.provider';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [CoreIntegratorModule, WhatsAppModule],
  controllers: [CheckoutController],
  providers: [
    CheckoutService,
    PaymentProcessor,
    WompiProvider,
    StripeProvider,
  ],
  exports: [CheckoutService],
})
export class CheckoutModule {}
