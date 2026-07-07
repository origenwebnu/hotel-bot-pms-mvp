import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { HumanHandoffService } from './human-handoff.service';

@Module({
  imports: [EmailModule, WhatsAppModule],
  providers: [HumanHandoffService],
  exports: [HumanHandoffService],
})
export class HumanHandoffModule {}
