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
  refresh_token: string;
  token_type: string;
};

export type TurnstileAction = 'login' | 'register';

export type TurnstilePassResponse = {
  turnstile_pass_token: string;
  expires_at: string;
  expires_in_seconds: number;
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
