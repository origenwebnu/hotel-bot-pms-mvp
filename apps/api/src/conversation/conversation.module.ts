import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import { ConversationService } from './conversation.service';
import { ConversationProcessor } from './conversation.processor';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { AiModule } from './ai.module';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { LocalInventoryModule } from '../local-inventory/local-inventory.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { ConversationHistoryModule } from '../conversation-history/conversation-history.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.WHATSAPP_INBOUND },
      { name: QUEUE_NAMES.WHATSAPP_OUTBOUND },
    ),
    CoreIntegratorModule,
    KnowledgeModule,
    CheckoutModule,
    WhatsAppModule,
    AiModule,
    LocalInventoryModule,
    SubscriptionModule,
    RestaurantModule,
    ConversationHistoryModule,
  ],
  controllers: [WhatsAppWebhookController],
  providers: [
    ConversationService,
    ConversationProcessor,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
