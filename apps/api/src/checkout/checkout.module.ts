import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PublicPaymentController } from './public-payment.controller';
import { PaymentProcessor } from './payment.processor';
import { WompiProvider } from './providers/wompi.provider';
import { StripeProvider } from './providers/stripe.provider';
import { BoldProvider } from './providers/bold.provider';
import { EpaycoProvider } from './providers/epayco.provider';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.PAYMENT_WEBHOOK }),
    CoreIntegratorModule,
    WhatsAppModule,
  ],
  controllers: [CheckoutController, PublicPaymentController],
  providers: [
    CheckoutService,
    PaymentProcessor,
    WompiProvider,
    StripeProvider,
    BoldProvider,
    EpaycoProvider,
  ],
  exports: [CheckoutService],
})
export class CheckoutModule {}
