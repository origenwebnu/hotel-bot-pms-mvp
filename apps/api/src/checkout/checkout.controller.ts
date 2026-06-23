import { Controller, Post, Req, Headers, RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { WompiProvider } from './providers/wompi.provider';
import { StripeProvider } from './providers/stripe.provider';

@Controller('webhooks')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly wompi: WompiProvider,
    private readonly stripe: StripeProvider,
  ) {}

  @Post('wompi')
  async wompiWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-event-checksum') checksum?: string,
  ) {
    const payload = this.wompi.parseWebhook(req.body, checksum);
    await this.checkout.enqueueWebhook(payload);
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
}
