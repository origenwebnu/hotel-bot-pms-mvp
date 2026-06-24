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
    request<{
      id: string;
      email: string;
      name: string;
      role: string;
      hotel_id: string | null;
      hotel_name?: string;
    }>('/auth/me'),

  getHotel: () => request<Hotel>('/hotels/me'),

  getIntegration: () => request<IntegrationStatus>('/hotels/me/integration'),

  updateIntegration: (data: Record<string, string>) =>
    request<IntegrationStatus>('/hotels/me/integration', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  validatePms: () =>
    request<{ valid: boolean }>('/hotels/me/integration/validate-pms'),

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
