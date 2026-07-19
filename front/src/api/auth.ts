import { API_BASE_URL } from './config';

export type AuthUser = {
  id: number;
  username: string;
  role: string;
  status: string;
  last_login_at?: string | null;
};

export type AuthResponse = {
  user: AuthUser;
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export const AUTH_STORAGE_KEYS = {
  accessToken: 'soft_web_access_token',
  refreshToken: 'soft_web_refresh_token',
  user: 'soft_web_user',
} as const;

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : '请求失败';
    throw new Error(detail);
  }

  return body as T;
}

export function saveAuthSession(auth: AuthResponse) {
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, auth.access_token);
  localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, auth.refresh_token);
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(auth.user));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
}

export function getStoredAccessToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
}

export function login(username: string, password: string) {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string, confirmPassword: string) {
  return requestJson<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      confirm_password: confirmPassword,
    }),
  });
}

export function getCurrentUser(accessToken: string) {
  return requestJson<AuthUser>('/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function logout() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearAuthSession();
    return;
  }

  try {
    await requestJson<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } finally {
    clearAuthSession();
  }
}
