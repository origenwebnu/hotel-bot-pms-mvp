import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, type PaymentWebhookPayload } from '@hotel-bot/shared';
import { CheckoutService } from './checkout.service';

@Processor(QUEUE_NAMES.PAYMENT_WEBHOOK)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(private readonly checkout: CheckoutService) {
    super();
  }

  async process(job: Job<PaymentWebhookPayload>) {
    this.logger.debug(`Processing payment webhook ${job.data.payment_id}`);
    await this.checkout.processPaymentWebhook(job.data);
  }
}
