import { Body, Controller, Logger, Post, Query } from '@nestjs/common';
import { SubscriptionBillingService } from './subscription-billing.service';
import { MercadoPagoBillingService } from './mercadopago-billing.service';

@Controller('webhooks/mercadopago')
export class SubscriptionBillingWebhookController {
  private readonly logger = new Logger(SubscriptionBillingWebhookController.name);

  constructor(
    private readonly billing: SubscriptionBillingService,
    private readonly mercadopago: MercadoPagoBillingService,
  ) {}

  @Post('subscriptions')
  async handleSubscriptionWebhook(
    @Body() body: unknown,
    @Query('topic') topic?: string,
    @Query('id') id?: string,
  ) {
    const paymentId = this.mercadopago.parseWebhookPaymentId(body, { topic, id });
    if (!paymentId) {
      this.logger.warn('Mercado Pago webhook ignored: no payment id');
      return { status: 'ignored' };
    }

    try {
      const result = await this.billing.handleMercadoPagoWebhook(paymentId);
      return { status: 'ok', ...result };
    } catch (error) {
      this.logger.error(
        `Mercado Pago subscription webhook failed for payment ${paymentId}: ${error}`,
      );
      return { status: 'error' };
    }
  }
}
