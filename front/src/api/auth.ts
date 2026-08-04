import { API_BASE_URL } from './config';

export type AuthUser = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  last_login_at?: string | null;
};

export type AuthResponse = {
  user: AuthUser;
  access_token: string;
  token_type: string;
};

export type TurnstileAction = 'login' | 'register';

export type TurnstilePassResponse = {
  turnstile_pass_token: string;
  expires_at: string;
  expires_in_seconds: number;
};

export const AUTH_STORAGE_KEYS = {
  user: 'soft_web_user',
} as const;

const LEGACY_ACCESS_TOKEN_KEY = 'soft_web_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'soft_web_refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

function errorMessage(body: unknown, fallback = '请求失败') {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message?: unknown }).message || fallback);
    }
  }
  return fallback;
}

function buildHeaders(options: RequestInit, token?: string) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(options),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(errorMessage(body));
  }

  return body as T;
}

async function fetchWithToken(path: string, options: RequestInit, token: string) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(options, token),
  });
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function saveAuthSession(auth: AuthResponse) {
  accessToken = auth.access_token;
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(auth.user));
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function clearAuthSession() {
  accessToken = null;
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.access_token !== 'string' || !body.access_token) {
        clearAuthSession();
        return null;
      }
      accessToken = body.access_token;
      return accessToken;
    } catch {
      clearAuthSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authorizedFetch(
  path: string,
  options: RequestInit = {},
  unauthenticatedMessage = '请先登录后再操作',
) {
  const token = accessToken || await refreshAccessToken();
  if (!token) {
    throw new Error(unauthenticatedMessage);
  }

  const response = await fetchWithToken(path, options, token);
  if (response.status !== 401) {
    return response;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    clearAuthSession();
    throw new Error('登录已过期，请重新登录');
  }

  return fetchWithToken(path, options, refreshedToken);
}

export async function authorizedJson<T>(
  path: string,
  options: RequestInit = {},
  unauthenticatedMessage = '请先登录后再操作',
): Promise<T> {
  const response = await authorizedFetch(path, options, unauthenticatedMessage);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorMessage(body));
  }
  return body as T;
}

export async function restoreAuthSession(): Promise<AuthUser | null> {
  const user = await authorizedJson<AuthUser>('/auth/me', {}, '请先登录后再进入工作台');
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
  return user;
}

function buildTurnstilePayload(
  turnstileToken: string | null,
  turnstilePassToken: string | null,
) {
  const payload: {
    turnstile_token: string | null;
    turnstile_pass_token?: string;
  } = {
    turnstile_token: turnstilePassToken ? null : turnstileToken,
  };

  if (turnstilePassToken) {
    payload.turnstile_pass_token = turnstilePassToken;
  }

  return payload;
}

export function createTurnstilePass(turnstileToken: string, action: TurnstileAction) {
  return requestJson<TurnstilePassResponse>('/auth/turnstile-pass', {
    method: 'POST',
    body: JSON.stringify({ turnstile_token: turnstileToken, action }),
  });
}

export function login(
  username: string,
  password: string,
  turnstileToken: string | null = null,
  turnstilePassToken: string | null = null,
) {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username,
      password,
      ...buildTurnstilePayload(turnstileToken, turnstilePassToken),
    }),
  });
}

export function sendRegisterEmailCode(
  email: string,
  turnstileToken: string | null = null,
  turnstilePassToken: string | null = null,
) {
  return requestJson<{ message: string }>('/auth/register/email-code', {
    method: 'POST',
    body: JSON.stringify({
      email,
      ...buildTurnstilePayload(turnstileToken, turnstilePassToken),
    }),
  });
}

export function register(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
  emailCode: string,
) {
  return requestJson<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email,
      password,
      confirm_password: confirmPassword,
      email_code: emailCode,
    }),
  });
}

export function getCurrentUser() {
  return authorizedJson<AuthUser>('/auth/me', {}, '请先登录后再获取用户信息');
}

export async function logout() {
  try {
    await requestJson<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearAuthSession();
  }
}
