export type ApiErrorCategory =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'authentication'
  | 'authorization'
  | 'business'
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'rate_limit'
  | 'server'
  | 'http';

export type ApiErrorInit = {
  message: string;
  status?: number | null;
  code?: string;
  category: ApiErrorCategory;
  detail?: unknown;
  isRetryable?: boolean;
};

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly category: ApiErrorCategory;
  readonly detail: unknown;
  readonly isRetryable: boolean;

  constructor({
    message,
    status = null,
    code,
    category,
    detail,
    isRetryable,
  }: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code ?? (status === null ? 'API_ERROR' : `HTTP_${status}`);
    this.category = category;
    this.detail = detail;
    this.isRetryable = isRetryable ?? isRetryableCategory(category, status);
  }
}

function isRetryableCategory(category: ApiErrorCategory, status: number | null) {
  return (
    category === 'network'
    || category === 'timeout'
    || category === 'server'
    || category === 'rate_limit'
    || status === 408
  );
}

function statusCategory(status: number): ApiErrorCategory {
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404) return 'not_found';
  if (status === 409) return 'business';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'http';
}

function readErrorDetail(body: unknown): { message?: string; code?: string; detail: unknown } {
  if (body === null || body === undefined) {
    return { detail: body };
  }

  if (typeof body === 'string') {
    return { message: body, detail: body };
  }

  if (typeof body !== 'object') {
    return { message: String(body), detail: body };
  }

  const record = body as Record<string, unknown>;
  const detail = record.detail ?? body;
  const code = typeof record.code === 'string' ? record.code : undefined;

  if (typeof detail === 'string') {
    return { message: detail, code, detail };
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg?: unknown }).msg ?? '');
        }
        return typeof item === 'string' ? item : '';
      })
      .filter(Boolean);
    return {
      message: messages.length > 0 ? messages.join('；') : undefined,
      code,
      detail,
    };
  }

  if (detail && typeof detail === 'object' && 'message' in detail) {
    const detailRecord = detail as Record<string, unknown>;
    return {
      message: typeof detailRecord.message === 'string' ? detailRecord.message : undefined,
      code: code ?? (typeof detailRecord.code === 'string' ? detailRecord.code : undefined),
      detail,
    };
  }

  return { code, detail };
}

export function createHttpError(status: number, body: unknown, fallback = '请求失败') {
  const parsed = readErrorDetail(body);
  return new ApiError({
    status,
    category: statusCategory(status),
    code: parsed.code ?? `HTTP_${status}`,
    message: parsed.message || fallback,
    detail: parsed.detail,
  });
}

export function createAuthenticationError(message = '登录已过期，请重新登录', detail?: unknown) {
  return new ApiError({
    status: 401,
    category: 'authentication',
    code: 'AUTHENTICATION_REQUIRED',
    message,
    detail,
  });
}

export function createTimeoutError(timeoutMs: number) {
  return new ApiError({
    category: 'timeout',
    code: 'REQUEST_TIMEOUT',
    message: `请求超过 ${Math.ceil(timeoutMs / 1000)} 秒未完成`,
    detail: { timeoutMs },
  });
}

export function createAbortedError() {
  return new ApiError({
    category: 'aborted',
    code: 'REQUEST_ABORTED',
    message: '请求已取消',
  });
}

export function createNetworkError(error: unknown) {
  return new ApiError({
    category: 'network',
    code: 'NETWORK_ERROR',
    message: error instanceof Error && error.message ? error.message : '网络连接失败，请稍后重试',
    detail: error,
  });
}

export function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  return createNetworkError(error);
}
