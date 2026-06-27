import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import type {
  PaymentCredentials,
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentWebhookPayload,
} from '@hotel-bot/shared';
import type { PaymentProviderAdapter } from './payment-provider.interface';

const BOLD_API_BASE = 'https://integrations.api.bold.co';

@Injectable()
export class BoldProvider implements PaymentProviderAdapter {
  async createPaymentLink(
    credentials: PaymentCredentials,
    request: PaymentLinkRequest,
    metadata: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const apiKey = credentials.private_key?.trim();
    if (!apiKey) {
      throw new Error('Bold: falta la API Key (llave de identidad)');
    }

    const total = Math.round(request.amount);
    if (total < 1000) {
      throw new Error(`Bold: monto mínimo 1000 COP (actual: ${total})`);
    }

    const reference = `res-${request.reservation_id}`;
    const body: Record<string, unknown> = {
      amount_type: 'CLOSE',
      amount: { total_amount: total },
      reference,
      description: `Reserva hotel - ${reference}`,
    };

    if (request.expires_at) {
      body.expiration_date = toBoldExpirationNanos(request.expires_at);
    }

    const response = await fetch(`${BOLD_API_BASE}/online/link/v1`, {
      method: 'POST',
      headers: {
        Authorization: `x-api-key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const raw = (await response.json()) as BoldLinkResponse;
    if (!response.ok || raw.errors?.length) {
      const detail = raw.errors?.[0]?.message ?? JSON.stringify(raw).slice(0, 400);
      throw new Error(`Bold payment link failed: ${response.status} ${detail}`);
    }

    const paymentLink = raw.payload?.payment_link;
    const paymentUrl = raw.payload?.url;
    if (!paymentLink || !paymentUrl) {
      throw new Error('Bold payment link failed: respuesta sin link');
    }

    return {
      payment_id: paymentLink,
      payment_url: paymentUrl,
      expires_at: request.expires_at,
      provider: 'bold',
    };
  }

  parseWebhook(body: unknown, signature?: string): PaymentWebhookPayload {
    const event = body as BoldWebhookEvent;
    const status = this.mapEventType(event.type);
    const reference = event.data?.metadata?.reference ?? '';
    let reservationId = '';
    if (reference.startsWith('res-')) {
      reservationId = reference.slice(4);
    }

    const amountTotal = event.data?.amount?.total ?? 0;

    return {
      provider: 'bold',
      payment_id: event.data?.payment_id ?? event.subject ?? 'unknown',
      status,
      amount: amountTotal,
      currency: 'COP',
      metadata: {
        ...(reservationId ? { reservation_id: reservationId } : {}),
        ...(event.data?.payment_id ? { payment_link_id: event.data.payment_id } : {}),
        reference,
      },
      raw: body,
    };
  }

  verifySignature(rawBody: string, signature: string | undefined, apiKey: string): boolean {
    if (!signature?.trim() || !apiKey.trim()) return false;
    const encoded = Buffer.from(rawBody, 'utf-8').toString('base64');
    const expected = createHmac('sha256', apiKey).update(encoded).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature.trim()));
    } catch {
      return expected === signature.trim();
    }
  }

  async validateCredentials(credentials: PaymentCredentials): Promise<boolean> {
    const apiKey = credentials.private_key?.trim();
    if (!apiKey) return false;

    try {
      const response = await fetch(`${BOLD_API_BASE}/online/link/v1/payment_methods`, {
        headers: { Authorization: `x-api-key ${apiKey}` },
        signal: AbortSignal.timeout(12_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private mapEventType(type?: string): PaymentWebhookPayload['status'] {
    switch (type) {
      case 'SALE_APPROVED':
        return 'approved';
      case 'SALE_REJECTED':
        return 'declined';
      default:
        return 'pending';
    }
  }
}

function toBoldExpirationNanos(isoDate: string): number {
  const ms = new Date(isoDate).getTime();
  if (Number.isNaN(ms)) {
    return Date.now() * 1_000_000 + 60 * 60 * 1_000_000_000;
  }
  return ms * 1_000_000;
}

interface BoldLinkResponse {
  payload?: { payment_link?: string; url?: string };
  errors?: Array<{ message?: string }>;
}

interface BoldWebhookEvent {
  type?: string;
  subject?: string;
  data?: {
    payment_id?: string;
    amount?: { total?: number };
    metadata?: { reference?: string | null };
  };
}
