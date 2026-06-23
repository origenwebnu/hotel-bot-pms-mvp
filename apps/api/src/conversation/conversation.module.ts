import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationProcessor } from './conversation.processor';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { AiModule } from './ai.module';
import { CoreIntegratorModule } from '../core-integrator/core-integrator.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [CoreIntegratorModule, KnowledgeModule, CheckoutModule, WhatsAppModule, AiModule],
  controllers: [WhatsAppWebhookController],
  providers: [
    ConversationService,
    ConversationProcessor,
  ],
  exports: [ConversationService],
})
export class ConversationModule {}
