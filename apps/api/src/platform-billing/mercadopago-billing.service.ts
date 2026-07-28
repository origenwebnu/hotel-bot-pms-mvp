import { Injectable, Logger } from '@nestjs/common';
import { PlatformCredentialService, PLATFORM_CREDENTIAL_TYPES } from './platform-credential.service';

export interface MercadoPagoPreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

export interface MercadoPagoPreferenceRequest {
  items: MercadoPagoPreferenceItem[];
  payer?: { email?: string; name?: string };
  external_reference: string;
  metadata?: Record<string, string>;
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: 'approved' | 'all';
  notification_url?: string;
}

@Injectable()
export class MercadoPagoBillingService {
  private readonly logger = new Logger(MercadoPagoBillingService.name);

  constructor(private readonly credentials: PlatformCredentialService) {}

  async validateAccessToken(): Promise<{ valid: boolean; reason?: string; user_id?: string }> {
    const token = await this.credentials.getCredential(
      PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN,
    );
    if (!token) {
      return { valid: false, reason: 'Falta el Access Token de Mercado Pago' };
    }

    try {
      const response = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.text();
        return {
          valid: false,
          reason: `Mercado Pago rechazó el token (${response.status}): ${body.slice(0, 200)}`,
        };
      }
      const data = (await response.json()) as { id?: number };
      return { valid: true, user_id: data.id != null ? String(data.id) : undefined };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Error conectando con Mercado Pago',
      };
    }
  }

  async createPreference(request: MercadoPagoPreferenceRequest) {
    const token = await this.credentials.getCredential(
      PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN,
    );
    if (!token) {
      throw new Error('Mercado Pago no está configurado. Agrega el Access Token en Super Admin.');
    }

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        notification_url: request.notification_url ?? this.credentials.buildWebhookUrl(),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Mercado Pago preference failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    const checkoutUrl =
      token.startsWith('TEST-') && data.sandbox_init_point
        ? data.sandbox_init_point
        : data.init_point;

    if (!data.id || !checkoutUrl) {
      throw new Error('Mercado Pago no devolvió URL de checkout');
    }

    return {
      preference_id: data.id,
      checkout_url: checkoutUrl,
    };
  }

  async getPayment(paymentId: string) {
    const token = await this.credentials.getCredential(
      PLATFORM_CREDENTIAL_TYPES.MERCADOPAGO_ACCESS_TOKEN,
    );
    if (!token) {
      throw new Error('Mercado Pago no configurado');
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mercado Pago payment fetch failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return (await response.json()) as {
      id: number;
      status: string;
      status_detail?: string;
      external_reference?: string | null;
      transaction_amount?: number;
      currency_id?: string;
      metadata?: Record<string, string>;
    };
  }

  parseWebhookPaymentId(body: unknown, query: Record<string, string | undefined>): string | null {
    if (query.topic === 'payment' && query.id) {
      return query.id;
    }

    if (body && typeof body === 'object') {
      const record = body as {
        type?: string;
        action?: string;
        topic?: string;
        data?: { id?: string | number };
      };
      const topic = record.type ?? record.topic ?? record.action ?? '';
      if (topic.includes('payment') && record.data?.id != null) {
        return String(record.data.id);
      }
    }

    return null;
  }
}
