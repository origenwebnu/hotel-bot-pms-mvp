import { request } from './api-core';

export const superAdminApi = {
  getStats: () =>
    request<PlatformStats>('/super-admin/stats'),

  listHotels: () => request<PlatformHotel[]>('/super-admin/hotels'),

  getHotel: (id: string) => request<PlatformHotelDetail>(`/super-admin/hotels/${id}`),

  updateHotel: (
    id: string,
    data: {
      name?: string;
      timezone?: string;
      currency?: string;
      is_active?: boolean;
    },
  ) =>
    request<PlatformHotel>(`/super-admin/hotels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listUsers: () => request<PlatformUser[]>('/super-admin/users'),

  updateUser: (id: string, data: { name?: string; role?: string }) =>
    request<{ id: string; email: string; name: string; role: string }>(
      `/super-admin/users/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  listPlatformAdmins: () =>
    request<PlatformAdminUser[]>('/super-admin/platform-admins'),

  createPlatformAdmin: (data: {
    email: string;
    password: string;
    name: string;
  }) =>
    request<PlatformAdminUser>('/super-admin/platform-admins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePlatformAdmin: (
    id: string,
    data: { name?: string; is_active?: boolean; password?: string },
  ) =>
    request<PlatformAdminUser>(`/super-admin/platform-admins/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getSettings: () => request<Record<string, string>>('/super-admin/settings'),

  updateSettings: (settings: Record<string, string>) =>
    request<Record<string, string>>('/super-admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

export interface PlatformStats {
  hotels: { total: number; active: number };
  users: { total: number };
  reservations: { total: number };
  conversations: { total: number };
  knowledge_documents: { total: number };
  integrations: {
    pms_connected: number;
    payment_connected: number;
    whatsapp_connected: number;
  };
}

export interface PlatformHotel {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  is_active: boolean;
  whatsapp_phone_number_id: string | null;
  created_at: string;
  integration: {
    pms_provider: string | null;
    pms_connected: boolean;
    payment_provider: string | null;
    payment_connected: boolean;
    whatsapp_connected: boolean;
  } | null;
  counts: {
    users: number;
    knowledge: number;
    reservations: number;
    conversations: number;
  };
}

export interface PlatformHotelDetail extends Omit<PlatformHotel, 'counts'> {
  updated_at: string;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    created_at: string;
  }>;
  counts: {
    knowledge: number;
    reservations: number;
    conversations: number;
    credentials: number;
  };
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  hotel: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
  };
}

export interface PlatformAdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}
