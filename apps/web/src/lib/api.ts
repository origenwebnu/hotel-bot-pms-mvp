const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

function parseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as { message?: string | string[]; error?: string };
  if (Array.isArray(record.message)) return record.message.join('. ');
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.error === 'string' && record.error) return record.error;
  return fallback;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(parseErrorMessage(err, res.statusText || `Error ${res.status}`));
  }

  return res.json();
}

export const api = {
  register: (data: {
    email: string;
    password: string;
    passwordConfirm: string;
    name: string;
    hotelName: string;
  }) =>
    request<{ message: string; email: string; expires_in_seconds: number }>(
      '/auth/register/send-code',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  sendRegistrationCode: (data: {
    email: string;
    password: string;
    passwordConfirm: string;
    name: string;
    hotelName: string;
  }) =>
    request<{ message: string; email: string; expires_in_seconds: number }>(
      '/auth/register/send-code',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  verifyRegistration: (data: { email: string; code: string }) =>
    request<{ access_token: string; hotel_id: string }>('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendRegistrationCode: (email: string) =>
    request<{ message: string; expires_in_seconds: number }>(
      '/auth/register/resend-code',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; hotel_id: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHotel: () => request<Hotel>('/hotels/me'),

  getIntegration: () => request<IntegrationStatus>('/hotels/me/integration'),

  getPaymentConfig: () => request<PaymentConfig>('/hotels/me/payment-config'),

  updateIntegration: (data: Record<string, string>) =>
    request<IntegrationStatus>('/hotels/me/integration', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  validatePms: () =>
    request<{ valid: boolean }>('/hotels/me/integration/validate-pms'),

  validatePayment: () =>
    request<{ valid: boolean; reason?: string; api_base?: string }>(
      '/hotels/me/integration/validate-payment',
      { method: 'POST' },
    ),

  getWhatsApp: () => request<WhatsAppConfig>('/hotels/me/whatsapp'),

  updateWhatsApp: (data: { phone_number_id?: string; access_token?: string }) =>
    request<WhatsAppConfig>('/hotels/me/whatsapp', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  validateWhatsApp: () =>
    request<{ valid: boolean }>('/hotels/me/whatsapp/validate', {
      method: 'POST',
    }),

  listKnowledge: () => request<KnowledgeDoc[]>('/hotels/me/knowledge'),

  createKnowledge: (data: { title: string; content: string }) =>
    request<KnowledgeDoc>('/hotels/me/knowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteKnowledge: (id: string) =>
    request<void>(`/hotels/me/knowledge/${id}`, { method: 'DELETE' }),

  testChat: (message: string) =>
    request<{ reply: string }>('/hotels/me/knowledge/test-chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  listInventory: () => request<RoomType[]>('/hotels/me/inventory'),

  createInventory: (data: {
    name: string;
    description?: string;
    price_per_night: number;
    total_units?: number;
    max_occupancy?: number;
    photo_urls?: string[];
  }) =>
    request<RoomType>('/hotels/me/inventory', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateInventory: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price_per_night: number;
      total_units: number;
      max_occupancy: number;
      photo_urls: string[];
      is_active: boolean;
    }>,
  ) =>
    request<RoomType>(`/hotels/me/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteInventory: (id: string) =>
    request<void>(`/hotels/me/inventory/${id}`, { method: 'DELETE' }),

  seedDemoInventory: () =>
    request<{ message: string; rooms_created?: number }>(
      '/hotels/me/inventory/seed-demo',
      { method: 'POST' },
    ),

  listDiscountTiers: () => request<DiscountTier[]>('/hotels/me/discount-tiers'),

  createDiscountTier: (data: {
    min_total: number;
    max_total?: number | null;
    discount_percent: number;
    sort_order?: number;
  }) =>
    request<DiscountTier>('/hotels/me/discount-tiers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDiscountTier: (
    id: string,
    data: Partial<{
      min_total: number;
      max_total: number | null;
      discount_percent: number;
      is_active: boolean;
      sort_order: number;
    }>,
  ) =>
    request<DiscountTier>(`/hotels/me/discount-tiers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteDiscountTier: (id: string) =>
    request<void>(`/hotels/me/discount-tiers/${id}`, { method: 'DELETE' }),

  seedDefaultDiscountTiers: () =>
    request<{ message: string; tiers_created?: number }>(
      '/hotels/me/discount-tiers/seed-default',
      { method: 'POST' },
    ),
};

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  currency: string;
  integration?: IntegrationStatus;
}

export interface IntegrationStatus {
  pms_provider: string | null;
  pms_connected: boolean;
  payment_provider: string | null;
  payment_connected: boolean;
  whatsapp_connected: boolean;
  whatsapp_phone_number_id: string | null;
  whatsapp_has_token: boolean;
  last_validated_at: string | null;
}

export interface PaymentConfig {
  provider: string | null;
  connected: boolean;
  webhook_url: string;
  stripe_webhook_url: string;
  reservation_recommendations: string;
  setup_steps: string[];
}

export interface WhatsAppConfig {
  phone_number_id: string | null;
  connected: boolean;
  has_token: boolean;
  webhook_url: string;
  verify_token_hint: string | null;
  setup_steps: string[];
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  isIndexed: boolean;
  createdAt: string;
}

export interface RoomType {
  id: string;
  name: string;
  description: string | null;
  price_per_night: number;
  currency: string;
  max_occupancy: number;
  total_units: number;
  photo_urls: string[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface DiscountTier {
  id: string;
  min_total: number;
  max_total: number | null;
  discount_percent: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}
