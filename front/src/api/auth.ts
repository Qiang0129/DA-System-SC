import { apiFetch, apiJson, publicJson, type ApiRequestOptions } from './client';
import {
  AUTH_STORAGE_KEYS,
  cacheAuthUser,
  clearAuthSession,
  getAccessToken,
  getCachedAuthUser,
  notifyUnauthorized,
  refreshAccessToken,
  saveAuthSession,
  setAccessToken,
} from './auth-session';
import type { ApiError } from './errors';

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

export { AUTH_STORAGE_KEYS, clearAuthSession, getAccessToken, saveAuthSession, setAccessToken };
export {
  subscribeAuthSession,
  type AuthSessionEvent,
  type AuthSessionEventReason,
} from './auth-session';

async function requestJson<T>(path: string, options: ApiRequestOptions = {}) {
  return publicJson<T>(path, options);
}

export function authorizedFetch(
  path: string,
  options: RequestInit = {},
  unauthenticatedMessage = '请先登录后再操作',
) {
  return apiFetch(path, {
    ...options,
    auth: true,
    unauthenticatedMessage,
  });
}

export function authorizedJson<T>(
  path: string,
  options: RequestInit = {},
  unauthenticatedMessage = '请先登录后再操作',
) {
  return apiJson<T>(path, {
    ...options,
    auth: true,
    unauthenticatedMessage,
  });
}

export async function restoreAuthSession(): Promise<AuthUser | null> {
  const user = await authorizedJson<AuthUser>('/auth/me', {}, '请先登录后再进入工作台');
  cacheAuthUser(user);
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
    clearAuthSession({ notify: true, reason: 'logout' });
  }
}

// 兼容旧页面和外部调用方：真正的刷新状态机位于 auth-session.ts。
export { refreshAccessToken };
export function notifyAuthUnauthorized(error?: ApiError) {
  notifyUnauthorized(error);
}

export function getCachedUser() {
  return getCachedAuthUser<AuthUser>();
}
