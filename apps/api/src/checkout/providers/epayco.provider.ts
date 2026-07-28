import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  buildPaymentPageUrl,
  type PaymentCredentials,
  type PaymentLinkRequest,
  type PaymentLinkResult,
  type PaymentWebhookPayload,
} from '@hotel-bot/shared';
import type { PaymentProviderAdapter } from './payment-provider.interface';

const EPAYCO_APIFY_BASE = 'https://apify.epayco.co';

@Injectable()
export class EpaycoProvider implements PaymentProviderAdapter {
  async createPaymentLink(
    credentials: PaymentCredentials,
    request: PaymentLinkRequest,
    metadata: Record<string, string>,
  ): Promise<PaymentLinkResult> {
    const publicKey = credentials.public_key?.trim();
    const privateKey = credentials.private_key?.trim();
    if (!publicKey || !privateKey) {
      throw new Error('ePayco: faltan Public Key y Private Key');
    }

    const token = await this.login(publicKey, privateKey);
    const appUrl = process.env.APP_URL ?? 'https://app.bookichat.com';
    const redirectUrl =
      metadata.redirect_url ??
      `${appUrl.replace(/\/$/, '')}/payment/result/${request.reservation_id}?token=${encodeURIComponent(metadata.payment_access_token ?? '')}`;
    const confirmationUrl =
      metadata.confirmation_url ??
      `${appUrl.replace(/\/$/, '')}/api/webhooks/epayco`;

    const sessionResponse = await fetch(`${EPAYCO_APIFY_BASE}/payment/session/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        checkout_version: '2',
        name: metadata.hotel_name ?? 'Reserva hotel',
        description: `Reserva ${request.reservation_id.slice(-8).toUpperCase()}`,
        currency: request.currency ?? 'COP',
        amount: request.amount,
        lang: 'ES',
        invoice: request.reservation_id,
        response: redirectUrl,
        confirmation: confirmationUrl,
        method: 'POST',
        extras: {
          extra1: request.reservation_id,
          extra2: request.hold_id,
        },
        billing: {
          email: request.guest_email,
          name: request.guest_name,
        },
      }),
    });

    const sessionJson = (await sessionResponse.json()) as EpaycoSessionResponse;
    if (!sessionResponse.ok || !sessionJson.success) {
      throw new Error(
        `ePayco session failed: ${sessionResponse.status} ${sessionJson.textResponse ?? ''}`.slice(
          0,
          500,
        ),
      );
    }

    const sessionId = sessionJson.data?.sessionId;
    if (!sessionId) {
      throw new Error('ePayco session failed: respuesta sin sessionId');
    }

    const paymentPageUrl = buildPaymentPageUrl(
      request.reservation_id,
      metadata.payment_access_token ?? '',
      appUrl,
    );

    return {
      payment_id: sessionId,
      payment_url: paymentPageUrl,
      expires_at: request.expires_at,
      provider: 'epayco',
    };
  }

  parseWebhook(body: unknown, _signature?: string): PaymentWebhookPayload {
    const data = normalizeEpaycoBody(body);
    const status = this.mapResponse(data.x_response);
    const reservationId = data.x_extra1?.trim() ?? '';

    return {
      provider: 'epayco',
      payment_id: data.x_transaction_id ?? data.ref_payco ?? data.x_ref_payco ?? 'unknown',
      status,
      amount: parseAmount(data.x_amount),
      currency: data.x_currency_code ?? 'COP',
      metadata: {
        ...(reservationId ? { reservation_id: reservationId } : {}),
        ...(data.ref_payco ? { payment_link_id: data.ref_payco } : {}),
      },
      raw: body,
    };
  }

  verifySignature(data: EpaycoWebhookFields, customerId: string, pKey: string): boolean {
    if (!data.x_signature || !customerId || !pKey) return false;
    const payload = `${customerId}^${pKey}^${data.x_ref_payco}^${data.x_transaction_id}^${data.x_amount}^${data.x_currency_code}`;
    const expected = createHash('sha256').update(payload).digest('hex');
    return expected === data.x_signature;
  }

  async validateCredentials(credentials: PaymentCredentials): Promise<boolean> {
    const publicKey = credentials.public_key?.trim();
    const privateKey = credentials.private_key?.trim();
    if (!publicKey || !privateKey) return false;

    try {
      await this.login(publicKey, privateKey);
      return true;
    } catch {
      return false;
    }
  }

  private async login(publicKey: string, privateKey: string): Promise<string> {
    const basic = Buffer.from(`${publicKey}:${privateKey}`).toString('base64');
    const response = await fetch(`${EPAYCO_APIFY_BASE}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basic}`,
      },
      signal: AbortSignal.timeout(12_000),
    });

    const json = (await response.json()) as { token?: string };
    if (!response.ok || !json.token) {
      throw new Error(`ePayco login failed: ${response.status}`);
    }
    return json.token;
  }

  private mapResponse(response?: string): PaymentWebhookPayload['status'] {
    switch (response?.trim()) {
      case 'Aceptada':
        return 'approved';
      case 'Rechazada':
        return 'declined';
      case 'Fallida':
        return 'error';
      case 'Pendiente':
        return 'pending';
      default:
        return 'pending';
    }
  }
}

function normalizeEpaycoBody(body: unknown): EpaycoWebhookFields {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const normalized: EpaycoWebhookFields = {};
  for (const [key, value] of Object.entries(record)) {
    if (value == null) continue;
    normalized[key as keyof EpaycoWebhookFields] = String(value);
  }
  return normalized;
}

function parseAmount(value?: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

interface EpaycoSessionResponse {
  success?: boolean;
  textResponse?: string;
  data?: { sessionId?: string };
}

interface EpaycoWebhookFields {
  ref_payco?: string;
  x_ref_payco?: string;
  x_transaction_id?: string;
  x_response?: string;
  x_amount?: string;
  x_currency_code?: string;
  x_signature?: string;
  x_extra1?: string;
  [key: string]: string | undefined;
}
