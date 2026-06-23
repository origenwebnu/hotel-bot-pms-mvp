import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import type {
  PaymentCredentials,
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentWebhookPayload,
} from '@hotel-bot/shared';

@Injectable()
export class StripeProvider {
  parseWebhook(rawBody: Buffer | unknown, signature?: string): PaymentWebhookPayload {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-02-24.acacia',
    });

    const event =
      signature && Buffer.isBuffer(rawBody)
        ? stripe.webhooks.constructEvent(rawBody, signature, secret)
        : (rawBody as Stripe.Event);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        provider: 'stripe',
        payment_id: session.id,
        status: session.payment_status === 'paid' ? 'approved' : 'pending',
        amount: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? 'usd').toUpperCase(),
        metadata: (session.metadata as Record<string, string>) ?? {},
        raw: event,
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      return {
        provider: 'stripe',
        payment_id: pi.id,
        status: 'declined',
        amount: (pi.amount ?? 0) / 100,
        currency: (pi.currency ?? 'usd').toUpperCase(),
        metadata: (pi.metadata as Record<string, string>) ?? {},
        raw: event,
      };
    }

    const obj = event.data.object as { id?: string; metadata?: Record<string, string> };
    return {
      provider: 'stripe',
      payment_id: obj.id ?? event.id,
      status: 'pending',
      amount: 0,
      currency: 'USD',
      metadata: obj.metadata ?? {},
      raw: event,
    };
  }

  async createPaymentLink(
    credentials: PaymentCredentials,
    request: PaymentLinkRequest,
    metadata: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const stripe = new Stripe(credentials.private_key ?? process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-02-24.acacia',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: request.guest_email,
      line_items: [
        {
          price_data: {
            currency: request.currency.toLowerCase(),
            product_data: {
              name: 'Reserva de habitación',
              description: `Reserva ${request.reservation_id}`,
            },
            unit_amount: Math.round(request.amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata,
      expires_at: Math.floor(new Date(request.expires_at).getTime() / 1000),
      success_url: `${process.env.APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/payment/cancel`,
    });

    return {
      payment_id: session.id,
      payment_url: session.url ?? '',
      expires_at: request.expires_at,
      provider: 'stripe',
    };
  }
}
