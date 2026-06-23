const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

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
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `Error ${res.status}`);
  }

  return res.json();
}

export const api = {
  register: (data: {
    email: string;
    password: string;
    name: string;
    hotelName: string;
  }) =>
    request<{ access_token: string; hotel_id: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; hotel_id: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHotel: () => request<Hotel>('/hotels/me'),

  getIntegration: () => request<IntegrationStatus>('/hotels/me/integration'),

  updateIntegration: (data: Record<string, string>) =>
    request<IntegrationStatus>('/hotels/me/integration', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  validatePms: () =>
    request<{ valid: boolean }>('/hotels/me/integration/validate-pms'),

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
  last_validated_at: string | null;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  isIndexed: boolean;
  createdAt: string;
}
