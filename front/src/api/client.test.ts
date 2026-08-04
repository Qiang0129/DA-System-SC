import {
  apiFetch,
  apiJson,
  DEFAULT_REQUEST_TIMEOUT_MS,
  publicJson,
} from './client';
import {
  clearAuthSession,
  getAccessToken,
  setAccessToken,
} from './auth-session';
import { ApiError } from './errors';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 401) {
  return {
    ok,
    status,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
    blob: async () => new Blob(),
  } as unknown as Response;
}

describe('统一 API 客户端', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearAuthSession();
    setAccessToken(null);
    vi.useRealTimers();
  });

  it('统一携带 Cookie、Authorization 和 JSON 请求头', async () => {
    setAccessToken('access-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock as typeof fetch;

    await apiJson('/datasets', {
      method: 'POST',
      body: JSON.stringify({ name: 'demo' }),
    });

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/datasets');
    expect(options.credentials).toBe('include');
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer access-token');
    expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('公共请求和 refresh 端点不会递归触发认证刷新', async () => {
    setAccessToken('stale-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock as typeof fetch;

    await publicJson('/auth/login', { method: 'POST', body: '{}' });
    await apiFetch('/auth/refresh');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const publicOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const refreshOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((publicOptions.headers as Headers).get('Authorization')).toBeNull();
    expect((refreshOptions.headers as Headers).get('Authorization')).toBeNull();
  });

  it('并发 401 只触发一次 refresh，并分别重试原请求', async () => {
    setAccessToken('expired-token');
    let protectedCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ access_token: 'rotated-token' }));
      }

      protectedCalls += 1;
      if (protectedCalls <= 2) {
        return Promise.resolve(jsonResponse({ detail: '登录凭证已过期' }, false, 401));
      }
      return Promise.resolve(jsonResponse({ items: [] }));
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const [first, second] = await Promise.all([
      apiJson<{ items: unknown[] }>('/datasets'),
      apiJson<{ items: unknown[] }>('/tasks'),
    ]);

    expect(first.items).toEqual([]);
    expect(second.items).toEqual([]);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('rotated-token');
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('refresh 失败后抛出认证错误且不会递归刷新', async () => {
    setAccessToken('expired-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: '登录凭证已过期' }, false, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: '刷新凭证无效或已过期' }, false, 401));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(apiFetch('/datasets')).rejects.toMatchObject({
      category: 'authentication',
      status: 401,
      message: '登录已过期，请重新登录',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
  });

  it('把调用方取消和客户端超时区分开', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<never>((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const timeoutPromise = apiFetch('/health', { auth: false, timeoutMs: 10 });
    const timeoutExpectation = expect(timeoutPromise).rejects.toMatchObject({ category: 'timeout' });
    await vi.advanceTimersByTimeAsync(10);
    await timeoutExpectation;

    const controller = new AbortController();
    const abortedPromise = apiFetch('/health', {
      auth: false,
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      signal: controller.signal,
    });
    const abortedExpectation = expect(abortedPromise).rejects.toMatchObject({ category: 'aborted' });
    controller.abort();
    await abortedExpectation;
  });
});
