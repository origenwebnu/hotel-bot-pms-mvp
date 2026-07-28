import type {
  PaymentCredentials,
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentWebhookPayload,
} from '@hotel-bot/shared';

export interface PaymentProviderAdapter {
  createPaymentLink(
    credentials: PaymentCredentials,
    request: PaymentLinkRequest,
    metadata: Record<string, string>,
  ): Promise<PaymentLinkResult>;

  parseWebhook(body: unknown, signature?: string): PaymentWebhookPayload;

  validateCredentials?(credentials: PaymentCredentials): Promise<boolean>;
}
