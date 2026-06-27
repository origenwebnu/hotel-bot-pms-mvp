import { Controller, Post, Req, Headers, RawBodyRequest, Logger } from '@nestjs/common';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { WompiProvider } from './providers/wompi.provider';
import { StripeProvider } from './providers/stripe.provider';
import { BoldProvider } from './providers/bold.provider';
import { EpaycoProvider } from './providers/epayco.provider';

@Controller('webhooks')
export class CheckoutController {
  private readonly logger = new Logger(CheckoutController.name);

  constructor(
    private readonly checkout: CheckoutService,
    private readonly wompi: WompiProvider,
    private readonly stripe: StripeProvider,
    private readonly bold: BoldProvider,
    private readonly epayco: EpaycoProvider,
  ) {}

  @Post('wompi')
  async wompiWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-event-checksum') checksum?: string,
  ) {
    try {
      const payload = this.wompi.parseWebhook(req.body, checksum);
      await this.checkout.enqueueWebhook(payload);
    } catch (error) {
      this.logger.error(`Wompi webhook enqueue failed: ${error}`);
    }
    return { received: true };
  }

  @Post('stripe')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? req.body;
    const payload = this.stripe.parseWebhook(rawBody, signature);
    await this.checkout.enqueueWebhook(payload);
    return { received: true };
  }

  @Post('bold')
  async boldWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-bold-signature') signature?: string,
  ) {
    try {
      const payload = this.bold.parseWebhook(req.body, signature);
      await this.checkout.enqueueWebhook(payload);
    } catch (error) {
      this.logger.error(`Bold webhook enqueue failed: ${error}`);
    }
    return { received: true };
  }

  @Post('epayco')
  async epaycoWebhook(@Req() req: RawBodyRequest<Request>) {
    try {
      const payload = this.epayco.parseWebhook(req.body);
      await this.checkout.enqueueWebhook(payload);
    } catch (error) {
      this.logger.error(`ePayco webhook enqueue failed: ${error}`);
    }
    return 'OK';
  }
}
