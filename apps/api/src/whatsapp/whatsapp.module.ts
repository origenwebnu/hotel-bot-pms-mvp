import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppRendererService } from './whatsapp-renderer.service';
import { WhatsAppCredentialsService } from './whatsapp-credentials.service';
import { MetaEmbeddedSignupService } from './meta-embedded-signup.service';
import { ConversationHistoryModule } from '../conversation-history/conversation-history.module';

@Module({
  imports: [ConversationHistoryModule],
  providers: [
    WhatsAppCredentialsService,
    WhatsAppService,
    WhatsAppRendererService,
    MetaEmbeddedSignupService,
  ],
  exports: [
    WhatsAppCredentialsService,
    WhatsAppService,
    WhatsAppRendererService,
    MetaEmbeddedSignupService,
  ],
})
export class WhatsAppModule {}
