import { Injectable } from '@nestjs/common';
import type {
  PaymentCredentials,
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentWebhookPayload,
} from '@hotel-bot/shared';

@Injectable()
export class WompiProvider {
  resolveApiBase(privateKey?: string): string {
    return resolveWompiApiBase(privateKey);
  }

  async createPaymentLink(
    credentials: PaymentCredentials,
    request: PaymentLinkRequest,
    metadata: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const reference = `res-${request.reservation_id}`;
    const amountInCents = Math.round(request.amount * 100);

    const apiBase = resolveWompiApiBase(credentials.private_key);

    const response = await fetch(`${apiBase}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.private_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Reserva ${reference}`,
        description: `Pago reserva hotel - ${reference}`,
        single_use: true,
        collect_shipping: false,
        amount_in_cents: amountInCents,
        currency: request.currency,
        reference,
        expires_at: request.expires_at,
        customer_email: request.guest_email,
        redirect_url:
          metadata.redirect_url ??
          `${process.env.APP_URL?.replace(/\/$/, '')}/payment/result/${request.reservation_id}?token=${encodeURIComponent(metadata.payment_access_token ?? '')}`,
        metadata,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Wompi payment link failed: ${response.status} ${errorBody.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      data: { id: string; payment_link_url: string };
    };

    return {
      payment_id: data.data.id,
      payment_url: data.data.payment_link_url,
      expires_at: request.expires_at,
      provider: 'wompi',
    };
  }

  parseWebhook(body: unknown, _checksum?: string): PaymentWebhookPayload {
    const event = body as WompiEvent;
    const transaction = event.data?.transaction;
    const status = this.mapStatus(transaction?.status);

    return {
      provider: 'wompi',
      payment_id: transaction?.id ?? event.event?.id ?? 'unknown',
      status,
      amount: (transaction?.amount_in_cents ?? 0) / 100,
      currency: transaction?.currency ?? 'COP',
      metadata: (transaction?.metadata as Record<string, string>) ?? {},
      raw: body,
    };
  }

  private mapStatus(status?: string): PaymentWebhookPayload['status'] {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return 'approved';
      case 'DECLINED':
      case 'VOIDED':
        return 'declined';
      case 'ERROR':
        return 'error';
      default:
        return 'pending';
    }
  }
}

function resolveWompiApiBase(privateKey?: string): string {
  if (process.env.WOMPI_API_BASE) {
    return process.env.WOMPI_API_BASE.replace(/\/$/, '');
  }
  const isTestKey =
    privateKey?.startsWith('prv_test_') || privateKey?.startsWith('pub_test_');
  return isTestKey
    ? 'https://sandbox.wompi.co/v1'
    : 'https://production.wompi.co/v1';
}

interface WompiEvent {
  event?: { id: string };
  data?: {
    transaction?: {
      id: string;
      status: string;
      amount_in_cents: number;
      currency: string;
      metadata?: Record<string, string>;
    };
  };
}
