/**
 * 认证会话的前端生命周期管理。
 * access token 只保存在内存中；refresh token 由后端通过 HttpOnly Cookie 管理，页面不能读取或持久化它。
 */
import { API_BASE_URL } from './config';
import {
  ApiError,
  createAuthenticationError,
  createHttpError,
  createNetworkError,
  createTimeoutError,
} from './errors';

export const AUTH_STORAGE_KEYS = {
  user: 'soft_web_user',
} as const;

const LEGACY_ACCESS_TOKEN_KEY = 'soft_web_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'soft_web_refresh_token';
const REFRESH_TIMEOUT_MS = 30_000;

export type AuthSessionEventReason = 'refresh_failed' | 'unauthorized' | 'logout';

export type AuthSessionEvent = {
  reason: AuthSessionEventReason;
  error?: ApiError;
};

type AuthSessionPayload = {
  access_token: string;
  user?: unknown;
};

type AuthSessionListener = (event: AuthSessionEvent) => void;

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let lastRefreshError: ApiError | null = null;
let logoutNotified = false;
const listeners = new Set<AuthSessionListener>();

function removeStoredAuth() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

function notifyLogout(reason: AuthSessionEventReason, error?: ApiError) {
  if (logoutNotified) return;
  logoutNotified = true;
  const event = { reason, error } satisfies AuthSessionEvent;
  listeners.forEach((listener) => listener(event));
}

export function subscribeAuthSession(listener: AuthSessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    logoutNotified = false;
    lastRefreshError = null;
  }
}

export function saveAuthSession(auth: AuthSessionPayload) {
  setAccessToken(auth.access_token);
  if (typeof localStorage !== 'undefined' && auth.user !== undefined) {
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(auth.user));
  }
  removeLegacyTokens();
}

function removeLegacyTokens() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function getCachedAuthUser<T>() {
  if (typeof localStorage === 'undefined') return null;
  const storedUser = localStorage.getItem(AUTH_STORAGE_KEYS.user);
  if (!storedUser) return null;
  try {
    return JSON.parse(storedUser) as T;
  } catch {
    return null;
  }
}

export function cacheAuthUser(user: unknown) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
}

export function clearAuthSession(options: {
  notify?: boolean;
  reason?: AuthSessionEventReason;
  error?: ApiError;
} = {}) {
  accessToken = null;
  if (!options.error) {
    lastRefreshError = null;
  }
  removeStoredAuth();
  if (options.notify) {
    notifyLogout(options.reason ?? 'logout', options.error);
  }
}

function fetchRefreshToken() {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REFRESH_TIMEOUT_MS);

  return (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createHttpError(response.status, body, '刷新登录状态失败');
      }
      if (!body || typeof body.access_token !== 'string' || !body.access_token) {
        throw createAuthenticationError('刷新登录状态失败', body);
      }
      return body.access_token as string;
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (timedOut) {
        throw createTimeoutError(REFRESH_TIMEOUT_MS);
      }
      throw createNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  })();
}

export async function refreshAccessToken(): Promise<string | null> {
  // 刷新是跨请求的临界区，复用同一个 Promise 可避免多个 401 同时轮换 refresh token。
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const token = await fetchRefreshToken();
      setAccessToken(token);
      return token;
    } catch (error) {
      lastRefreshError = error instanceof ApiError ? error : createNetworkError(error);
      clearAuthSession({ notify: true, reason: 'refresh_failed', error: lastRefreshError });
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function refreshAccessTokenOrThrow() {
  const token = await refreshAccessToken();
  if (token) return token;
  throw lastRefreshError ?? createAuthenticationError();
}

export function notifyUnauthorized(error?: ApiError) {
  clearAuthSession({ notify: true, reason: 'unauthorized', error });
}
