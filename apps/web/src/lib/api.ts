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
    businessVertical: string;
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

  listSubscriptionPlans: () =>
    request<SubscriptionPlanCatalogItem[]>('/hotels/me/subscription/plans'),

  createSubscriptionCheckout: (planId: string, payerEmail?: string) =>
    request<SubscriptionCheckoutResult>('/hotels/me/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        ...(payerEmail ? { payer_email: payerEmail } : {}),
      }),
    }),

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

  getSimulatorBootstrap: () =>
    request<SimulatorBootstrap>('/hotels/me/simulator/bootstrap'),

  simulatorChat: (message: string, session?: SimulatorSession) =>
    request<SimulatorChatResponse>('/hotels/me/simulator/chat', {
      method: 'POST',
      body: JSON.stringify({ message, session }),
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
    booking_from?: string;
    booking_to?: string;
    booking_kind?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.outcome) query.set('outcome', params.outcome);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.booking_from) query.set('booking_from', params.booking_from);
    if (params?.booking_to) query.set('booking_to', params.booking_to);
    if (params?.booking_kind) query.set('booking_kind', params.booking_kind);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<ReservationHistoryResponse>(`/hotels/me/reservations${suffix}`);
  },

  getRestaurantSettings: () =>
    request<RestaurantSettings>('/hotels/me/restaurant/settings'),

  updateRestaurantSettings: (data: Partial<RestaurantSettings>) =>
    request<RestaurantSettings>('/hotels/me/restaurant/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  listRestaurantZones: () => request<DiningZone[]>('/hotels/me/restaurant/zones'),

  createRestaurantZone: (data: {
    name: string;
    description?: string;
    min_party_size?: number;
    max_party_size: number;
    capacity_per_slot?: number;
    base_reservation_fee?: number;
    base_price_per_guest?: number;
  }) =>
    request<DiningZone>('/hotels/me/restaurant/zones', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRestaurantZone: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      min_party_size: number;
      max_party_size: number;
      capacity_per_slot: number;
      base_reservation_fee: number;
      base_price_per_guest: number;
      is_active: boolean;
    }>,
  ) =>
    request<DiningZone>(`/hotels/me/restaurant/zones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRestaurantZone: (id: string) =>
    request<void>(`/hotels/me/restaurant/zones/${id}`, { method: 'DELETE' }),

  listRestaurantAddOns: () => request<RestaurantAddOn[]>('/hotels/me/restaurant/addons'),

  createRestaurantAddOn: (data: {
    name: string;
    description?: string;
    price: number;
    max_quantity?: number;
  }) =>
    request<RestaurantAddOn>('/hotels/me/restaurant/addons', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRestaurantAddOn: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      price: number;
      max_quantity: number;
      is_active: boolean;
    }>,
  ) =>
    request<RestaurantAddOn>(`/hotels/me/restaurant/addons/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRestaurantAddOn: (id: string) =>
    request<void>(`/hotels/me/restaurant/addons/${id}`, { method: 'DELETE' }),

  listRestaurantCalendar: (params: { from: string; to: string }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return request<RestaurantDateRate[]>(`/hotels/me/restaurant/calendar?${query.toString()}`);
  },

  upsertRestaurantCalendar: (data: {
    date: string;
    dining_zone_id?: string | null;
    closed?: boolean;
    label?: string;
    open_time_override?: string | null;
    close_time_override?: string | null;
    reservation_fee_override?: number | null;
    price_per_guest_override?: number | null;
  }) =>
    request<RestaurantDateRate>('/hotels/me/restaurant/calendar', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  bulkUpsertRestaurantCalendar: (data: {
    dates: string[];
    dining_zone_id?: string | null;
    closed?: boolean;
    label?: string;
    open_time_override?: string | null;
    close_time_override?: string | null;
    reservation_fee_override?: number | null;
    price_per_guest_override?: number | null;
  }) =>
    request<{ updated: number; rates: RestaurantDateRate[] }>('/hotels/me/restaurant/calendar/bulk', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  bulkClearRestaurantCalendar: (data: { dates: string[]; dining_zone_id?: string | null }) =>
    request<{ deleted: number }>('/hotels/me/restaurant/calendar/bulk', {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),

  listRestaurantAvailabilitySlots: (date: string, forManual = true) => {
    const query = new URLSearchParams({ date, for_manual: forManual ? 'true' : 'false' });
    return request<string[]>(`/hotels/me/restaurant/availability/slots?${query.toString()}`);
  },

  listRestaurantAvailabilityZones: (params: {
    date: string;
    time: string;
    party_size: number;
    for_manual?: boolean;
  }) => {
    const query = new URLSearchParams({
      date: params.date,
      time: params.time,
      party_size: String(params.party_size),
      for_manual: params.for_manual === false ? 'false' : 'true',
    });
    return request<Array<DiningZone & { quote: RestaurantQuote }>>(
      `/hotels/me/restaurant/availability/zones?${query.toString()}`,
    );
  },

  buildRestaurantQuote: (data: {
    dining_zone_id: string;
    date: string;
    time: string;
    party_size: number;
    addon_ids?: string[];
  }) =>
    request<RestaurantQuote>('/hotels/me/restaurant/quote', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  createManualRestaurantReservation: (data: {
    booking_date: string;
    booking_time: string;
    party_size: number;
    dining_zone_id: string;
    occasion_type: string;
    guest_first_name: string;
    guest_last_name?: string;
    guest_phone?: string;
    special_requests?: string;
    addon_ids?: string[];
  }) =>
    request<ManualRestaurantReservationResult>('/hotels/me/restaurant/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
  currency: string;
  businessVertical?: string;
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

export interface SubscriptionPlanCatalogItem {
  id: string;
  name: string;
  max_reservations_per_month: number;
  price_monthly: number;
  currency: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SubscriptionCheckoutResult {
  payment_id: string;
  checkout_url: string;
  preference_id: string;
  plan: {
    id: string;
    name: string;
    amount: number;
    currency: string;
  };
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
  has_customer_id: boolean;
  public_key_hint: string | null;
  customer_id_hint: string | null;
  webhook_url: string;
  wompi_webhook_url: string;
  bold_webhook_url: string;
  epayco_webhook_url: string;
  stripe_webhook_url: string;
  reservation_recommendations: string;
  setup_steps: string[];
  webhook_help: string;
  requires_public_key: boolean;
  requires_customer_id: boolean;
  private_key_label: string;
  public_key_label: string;
  webhook_secret_label: string;
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
  booking_kind?: string;
  room_type_id: string | null;
  room_name: string | null;
  dining_zone_id?: string | null;
  dining_zone_name?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  party_size?: number | null;
  occasion_type?: string | null;
  special_requests?: string | null;
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

export interface RestaurantQuote {
  reservation_fee: number;
  price_per_guest: number;
  party_size: number;
  addons_total: number;
  total: number;
  currency: string;
  rate_label?: string | null;
}

export interface ManualRestaurantReservationResult {
  id: string;
  status: string;
  outcome: ReservationOutcome;
  booking_date: string | null;
  booking_time: string | null;
  party_size: number | null;
  dining_zone_name: string | null;
  guest: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    whatsapp: string | null;
  };
  total_amount: number | null;
  currency: string | null;
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

export interface DiningZone {
  id: string;
  name: string;
  description: string | null;
  min_party_size: number;
  max_party_size: number;
  capacity_per_slot: number;
  base_reservation_fee: number;
  base_price_per_guest: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
}

export interface RestaurantAddOn {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  max_quantity: number;
  is_active: boolean;
  sort_order: number;
}

export interface RestaurantDateRate {
  id: string;
  date: string;
  dining_zone_id: string | null;
  dining_zone_name: string | null;
  closed: boolean;
  label: string | null;
  open_time_override: string | null;
  close_time_override: string | null;
  reservation_fee_override: number | null;
  price_per_guest_override: number | null;
}

export interface ServiceHoursDay {
  open: string;
  close: string;
  closed?: boolean;
}

export type ServiceHoursMap = Record<string, ServiceHoursDay>;

export interface RestaurantSettings {
  require_payment: boolean;
  post_payment_message: string;
  post_payment_link: string;
  summary_footer_message: string;
  summary_footer_link: string;
  notification_email: string;
  slot_interval_minutes: number;
  default_duration_minutes: number;
  max_covers_per_slot: number | null;
  advance_booking_days: number;
  min_advance_hours: number;
  default_reservation_fee: number;
  default_price_per_guest: number;
  service_hours_json: ServiceHoursMap;
}

export interface SimulatorSession {
  state: string;
  bookingDate?: string;
  bookingTime?: string;
  partySize?: number;
  selectedDiningZoneId?: string;
  occasionType?: string;
  selectedAddOnIds?: string[];
  guestFirstName?: string;
  guestLastName?: string;
  pendingTimeSlots?: string[];
}

export interface SimulatorBootstrap {
  business_name: string;
  business_vertical: string;
  welcome_message: string;
  inventory_summary: string;
  suggestions: string[];
}

export interface SimulatorChatResponse {
  replies: string[];
  session: SimulatorSession;
  suggestions: string[];
}
