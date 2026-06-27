import { request } from './api-core';

export { saveAuthSession, clearAuthSession, getPostLoginPath } from './api-core';

export interface AuthResponse {
  access_token: string;
  role: string;
  hotel_id: string | null;
  name?: string;
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
    request<AuthResponse>('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  resendRegistrationCode: (email: string) =>
    request<{ message: string; expires_in_seconds: number }>(
      '/auth/register/resend-code',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),

  login: (data: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProfile: () =>
    request<UserProfile>('/auth/me'),

  updateProfile: (data: { name: string }) =>
    request<UserProfile>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updatePassword: (data: { current_password: string; new_password: string }) =>
    request<{ message: string }>('/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getHotel: () => request<Hotel>('/hotels/me'),

  updateHotel: (data: { name?: string; timezone?: string; currency?: string }) =>
    request<Pick<Hotel, 'id' | 'name' | 'slug' | 'timezone' | 'currency'>>('/hotels/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getSubscription: () => request<HotelSubscription>('/hotels/me/subscription'),

  getBillingHistory: () =>
    request<BillingHistoryResponse>('/hotels/me/billing-history'),

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

  updateWhatsApp: (data: {
    phone_number_id?: string;
    access_token?: string;
    display_phone?: string;
  }) =>
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

  updateKnowledge: (id: string, data: { title: string; content: string }) =>
    request<KnowledgeDoc>(`/hotels/me/knowledge/${id}`, {
      method: 'PUT',
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

  getReservationStats: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<ReservationStats>(`/hotels/me/reservations/stats${suffix}`);
  },

  listReservations: (params?: {
    outcome?: ReservationOutcome;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.outcome) query.set('outcome', params.outcome);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<ReservationHistoryResponse>(`/hotels/me/reservations${suffix}`);
  },
};

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
  currency: string;
  integration?: IntegrationStatus;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  hotel_id: string | null;
  hotel_name?: string;
}

export interface BillingHistoryItem {
  id: string;
  period_month: string;
  amount: number;
  currency: string;
  plan_name: string | null;
  status: 'trial' | 'pending' | 'paid' | 'failed' | 'waived';
  description: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface BillingHistoryResponse {
  items: BillingHistoryItem[];
}

export interface HotelSubscription {
  status: 'trial' | 'active' | 'quota_reached' | 'trial_expired' | 'suspended';
  mode: 'trial' | 'plan';
  used: number;
  limit: number;
  remaining: number;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_price_monthly: number | null;
  plan_currency: string | null;
  period_month: string | null;
  can_create_reservations: boolean;
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
  has_public_key: boolean;
  has_private_key: boolean;
  has_webhook_secret: boolean;
  public_key_hint: string | null;
  webhook_url: string;
  stripe_webhook_url: string;
  reservation_recommendations: string;
  setup_steps: string[];
}

export interface WhatsAppConfig {
  phone_number_id: string | null;
  display_phone: string | null;
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
  aiUsageCount: number;
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

export type ReservationOutcome = 'approved' | 'rejected' | 'pending';

export interface ReservationStats {
  reservations: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
  };
  conversations: { total: number };
  period: { from: string | null; to: string | null };
}

export interface ReservationHistoryItem {
  id: string;
  hotel_id: string;
  whatsapp_session_id: string;
  status: string;
  outcome: ReservationOutcome;
  room_type_id: string | null;
  room_name: string | null;
  check_in: string | null;
  check_out: string | null;
  adults: number | null;
  children: number | null;
  total_amount: number | null;
  currency: string | null;
  payment_status: string | null;
  guest: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    whatsapp: string | null;
    full_name: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface ReservationHistoryResponse {
  items: ReservationHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
