import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@hotel-bot/shared';
import { ConversationService } from './conversation.service';
import type { WhatsAppInboundMessage } from '@hotel-bot/shared';

@Processor(QUEUE_NAMES.WHATSAPP_INBOUND)
export class ConversationProcessor extends WorkerHost {
  private readonly logger = new Logger(ConversationProcessor.name);

  constructor(private readonly conversation: ConversationService) {
    super();
  }

  async process(job: Job<{ hotelId: string; message: WhatsAppInboundMessage }>) {
    const { hotelId, message } = job.data;
    this.logger.debug(`Processing message ${message.message_id} for hotel ${hotelId}`);
    await this.conversation.processMessage(hotelId, message);
  }
}
