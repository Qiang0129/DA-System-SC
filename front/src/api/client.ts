import { API_BASE_URL } from './config';
import {
  ApiError,
  createAbortedError,
  createAuthenticationError,
  createHttpError,
  createNetworkError,
  createTimeoutError,
  toApiError,
} from './errors';
import {
  getAccessToken,
  notifyUnauthorized,
  refreshAccessTokenOrThrow,
} from './auth-session';

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DATASET_UPLOAD_TIMEOUT_MS = 5 * 60_000;
export const PROTECTED_DOWNLOAD_TIMEOUT_MS = 2 * 60_000;

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  unauthenticatedMessage?: string;
};

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path === API_BASE_URL || path.startsWith(`${API_BASE_URL}/`)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildHeaders(options: RequestInit, token: string | null) {
  const headers = new Headers(options.headers);
  if (
    options.body
    && typeof options.body === 'string'
    && !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

function createRequestSignal(timeoutMs: number, callerSignal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  return {
    signal: controller.signal,
    wasTimedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

async function fetchOnce(
  path: string,
  options: RequestInit,
  token: string | null,
  timeoutMs: number,
) {
  const requestSignal = createRequestSignal(timeoutMs, options.signal ?? undefined);
  try {
    return await fetch(buildUrl(path), {
      ...options,
      credentials: 'include',
      headers: buildHeaders(options, token),
      signal: requestSignal.signal,
    });
  } catch (error) {
    if (requestSignal.wasTimedOut()) {
      throw createTimeoutError(timeoutMs);
    }
    if (options.signal?.aborted) {
      throw createAbortedError();
    }
    throw createNetworkError(error);
  } finally {
    requestSignal.cleanup();
  }
}

function isRefreshPath(path: string) {
  return /\/auth\/refresh(?:$|\?)/.test(path);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortedError();
  }
}

function withAuthenticationMessage(error: ApiError, message?: string) {
  if (!message || error.category !== 'authentication') return error;
  return new ApiError({
    message,
    status: error.status,
    code: error.code,
    category: error.category,
    detail: error.detail,
    isRetryable: error.isRetryable,
  });
}

async function getTokenOrThrow(unauthenticatedMessage?: string) {
  const existingToken = getAccessToken();
  if (existingToken) return existingToken;

  try {
    return await refreshAccessTokenOrThrow();
  } catch (error) {
    throw withAuthenticationMessage(toApiError(error), unauthenticatedMessage);
  }
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}) {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    auth = true,
    retryOnUnauthorized = true,
    unauthenticatedMessage,
    ...requestInit
  } = options;

  throwIfAborted(requestInit.signal ?? undefined);

  // refresh 端点永远走无认证分支，避免没有 access token 时再次递归 refresh。
  if (!auth || isRefreshPath(path)) {
    return fetchOnce(path, requestInit, null, timeoutMs);
  }

  const token = await getTokenOrThrow(unauthenticatedMessage);
  const response = await fetchOnce(path, requestInit, token, timeoutMs);
  if (
    response.status !== 401
    || !retryOnUnauthorized
    || isRefreshPath(path)
  ) {
    return response;
  }

  throwIfAborted(requestInit.signal ?? undefined);
  let refreshedToken: string;
  try {
    refreshedToken = await refreshAccessTokenOrThrow();
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.category === 'authentication') {
      throw new ApiError({
        message: '登录已过期，请重新登录',
        status: 401,
        code: 'AUTHENTICATION_EXPIRED',
        category: 'authentication',
        detail: apiError.detail,
      });
    }
    throw apiError;
  }

  throwIfAborted(requestInit.signal ?? undefined);
  const retriedResponse = await fetchOnce(path, requestInit, refreshedToken, timeoutMs);
  if (retriedResponse.status === 401) {
    const error = createAuthenticationError('登录已过期，请重新登录');
    notifyUnauthorized(error);
  }
  return retriedResponse;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      // 某些下载或空响应没有 JSON 正文，继续尝试文本读取。
    }
  }

  if (typeof response.text === 'function') {
    let text: string;
    try {
      text = await response.text();
    } catch {
      return undefined;
    }
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return undefined;
}

export async function apiJson<T>(path: string, options: ApiRequestOptions = {}) {
  const response = await apiFetch(path, options);
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw createHttpError(response.status, body);
  }
  return body as T;
}

export async function ensureApiResponse(response: Response, fallback = '请求失败') {
  if (response.ok) return response;
  const body = await readResponseBody(response);
  throw createHttpError(response.status, body, fallback);
}

export async function apiBlob(path: string, options: ApiRequestOptions = {}) {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const body = await readResponseBody(response);
    throw createHttpError(response.status, body);
  }
  return response.blob();
}

export function publicFetch(path: string, options: Omit<ApiRequestOptions, 'auth'> = {}) {
  return apiFetch(path, { ...options, auth: false });
}

export function publicJson<T>(path: string, options: Omit<ApiRequestOptions, 'auth'> = {}) {
  return apiJson<T>(path, { ...options, auth: false });
}
