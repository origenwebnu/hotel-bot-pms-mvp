import { Module } from '@nestjs/common';
import { SubscriptionBillingService } from './subscription-billing.service';
import { SubscriptionBillingWebhookController } from './subscription-billing-webhook.controller';
import { PlatformCredentialService } from './platform-credential.service';
import { MercadoPagoBillingService } from './mercadopago-billing.service';
import { CryptoModule } from '../crypto/crypto.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [CryptoModule, SubscriptionModule],
  controllers: [SubscriptionBillingWebhookController],
  providers: [
    PlatformCredentialService,
    MercadoPagoBillingService,
    SubscriptionBillingService,
  ],
  exports: [SubscriptionBillingService, PlatformCredentialService],
})
export class PlatformBillingModule {}
