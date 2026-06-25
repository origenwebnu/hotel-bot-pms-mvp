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

    if (amountInCents < 1000) {
      throw new Error(
        `Wompi payment link failed: monto mínimo 1000 centavos (actual: ${amountInCents})`,
      );
    }

    const apiBase = resolveWompiApiBase(credentials.private_key);
    const redirectUrl =
      metadata.redirect_url ??
      `${process.env.APP_URL?.replace(/\/$/, '')}/payment/result/${request.reservation_id}?token=${encodeURIComponent(metadata.payment_access_token ?? '')}`;

    const body: Record<string, unknown> = {
      name: `Reserva ${reference}`,
      description: `Pago reserva hotel - ${reference}`,
      single_use: true,
      collect_shipping: false,
      amount_in_cents: amountInCents,
      currency: request.currency ?? 'COP',
      redirect_url: redirectUrl,
      sku: request.reservation_id.slice(0, 36),
    };

    if (request.expires_at) {
      body.expires_at = formatWompiExpiresAt(request.expires_at);
    }

    const response = await fetch(`${apiBase}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.private_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Wompi payment link failed: ${response.status} ${errorBody.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      data: { id: string; payment_link_url?: string };
    };

    const linkId = data.data?.id;
    if (!linkId) {
      throw new Error('Wompi payment link failed: respuesta sin id de link');
    }

    const paymentUrl =
      data.data.payment_link_url ?? buildWompiCheckoutUrl(linkId);

    return {
      payment_id: linkId,
      payment_url: paymentUrl,
      expires_at: request.expires_at,
      provider: 'wompi',
    };
  }

  parseWebhook(body: unknown, _checksum?: string): PaymentWebhookPayload {
    const event = body as WompiEvent;
    const transaction = event.data?.transaction;
    const status = this.mapStatus(transaction?.status);
    const txMetadata = (transaction?.metadata as Record<string, string>) ?? {};
    const paymentLinkId = extractPaymentLinkId(transaction);
    const reference = transaction?.reference ?? '';

    let reservationId = txMetadata.reservation_id;
    if (!reservationId && reference.startsWith('res-')) {
      reservationId = reference.slice(4);
    }

    return {
      provider: 'wompi',
      payment_id: transaction?.id ?? 'unknown',
      status,
      amount: (transaction?.amount_in_cents ?? 0) / 100,
      currency: transaction?.currency ?? 'COP',
      metadata: {
        ...txMetadata,
        ...(paymentLinkId ? { payment_link_id: paymentLinkId } : {}),
        ...(reservationId ? { reservation_id: reservationId } : {}),
      },
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

function extractPaymentLinkId(transaction?: {
  payment_link_id?: string | null;
  reference?: string;
}): string | undefined {
  if (!transaction) return undefined;
  if (transaction.payment_link_id) {
    return transaction.payment_link_id;
  }
  if (transaction.reference) {
    const [first] = transaction.reference.split('_');
    if (first && /^[A-Za-z0-9]{4,12}$/.test(first)) {
      return first;
    }
  }
  return undefined;
}

function buildWompiCheckoutUrl(linkId: string): string {
  return `https://checkout.wompi.co/l/${linkId}`;
}

function formatWompiExpiresAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toISOString().slice(0, 19);
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
  event?: string;
  data?: {
    transaction?: {
      id: string;
      status: string;
      amount_in_cents: number;
      currency: string;
      reference?: string;
      payment_link_id?: string | null;
      metadata?: Record<string, string>;
    };
  };
}
