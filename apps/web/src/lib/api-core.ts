const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

function parseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as { message?: string | string[]; error?: string };
  if (Array.isArray(record.message)) return record.message.join('. ');
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.error === 'string' && record.error) return record.error;
  return fallback;
}

export async function request<T>(
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

export function saveAuthSession(data: {
  access_token: string;
  role: string;
  hotel_id: string | null;
  name?: string;
}) {
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('role', data.role);
  if (data.hotel_id) {
    localStorage.setItem('hotel_id', data.hotel_id);
  } else {
    localStorage.removeItem('hotel_id');
  }
  if (data.name) {
    localStorage.setItem('user_name', data.name);
  }
}

export function clearAuthSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('hotel_id');
  localStorage.removeItem('user_name');
}

export function getPostLoginPath(role: string) {
  return role === 'super_admin' ? '/super-admin' : '/dashboard';
}
