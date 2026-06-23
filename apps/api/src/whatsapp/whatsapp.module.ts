import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppRendererService } from './whatsapp-renderer.service';

@Module({
  providers: [WhatsAppService, WhatsAppRendererService],
  exports: [WhatsAppService, WhatsAppRendererService],
})
export class WhatsAppModule {}
