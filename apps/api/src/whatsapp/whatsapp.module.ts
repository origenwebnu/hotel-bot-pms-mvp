import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppRendererService } from './whatsapp-renderer.service';
import { WhatsAppCredentialsService } from './whatsapp-credentials.service';
import { ConversationHistoryModule } from '../conversation-history/conversation-history.module';

@Module({
  imports: [ConversationHistoryModule],
  providers: [
    WhatsAppCredentialsService,
    WhatsAppService,
    WhatsAppRendererService,
  ],
  exports: [
    WhatsAppCredentialsService,
    WhatsAppService,
    WhatsAppRendererService,
  ],
})
export class WhatsAppModule {}
