export type PaymentProvider = 'wompi' | 'stripe' | 'payu';

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'error';

export interface PaymentLinkRequest {
  amount: number;
  currency: string;
  reservation_id: string;
  hold_id: string;
  expires_at: string;
  guest_email: string;
  guest_name: string;
  metadata?: Record<string, string>;
}

export interface PaymentLinkResult {
  payment_id: string;
  payment_url: string;
  expires_at: string;
  provider: PaymentProvider;
}

export interface PaymentWebhookPayload {
  provider: PaymentProvider;
  payment_id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  raw: unknown;
}

export interface PaymentCredentials {
  provider: PaymentProvider;
  public_key?: string;
  private_key?: string;
  webhook_secret?: string;
}
