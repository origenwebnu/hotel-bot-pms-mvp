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
    try {
      await this.conversation.processMessage(hotelId, message);
    } catch (err) {
      this.logger.error(
        `Failed processing message ${message.message_id}: ${err instanceof Error ? err.stack : err}`,
      );
      try {
        await this.conversation.notifyUnexpectedError(hotelId, message.from);
      } catch (notifyErr) {
        this.logger.error(
          `Failed to notify user of processing error: ${notifyErr instanceof Error ? notifyErr.message : notifyErr}`,
        );
      }
    }
  }
}
