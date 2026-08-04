import {
  authorizedFetch,
  getAccessToken,
  logout,
  refreshAccessToken,
  saveAuthSession,
  setAccessToken,
} from './auth';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 401) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('认证请求层', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    setAccessToken(null);
  });

  it('只在内存中保存 access token，不把 token 写入 localStorage', () => {
    localStorage.setItem('soft_web_access_token', 'legacy-access');
    localStorage.setItem('soft_web_refresh_token', 'legacy-refresh');

    saveAuthSession({
      access_token: 'access-token',
      token_type: 'bearer',
      user: { id: 1, username: 'alice', role: 'user', status: 'active' },
    });

    expect(getAccessToken()).toBe('access-token');
    expect(localStorage.getItem('soft_web_user')).toContain('alice');
    expect(localStorage.getItem('soft_web_access_token')).toBeNull();
    expect(localStorage.getItem('soft_web_refresh_token')).toBeNull();
  });

  it('通过 HttpOnly Cookie 刷新 access token', async () => {
    setAccessToken('expired-token');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 'fresh-token', token_type: 'bearer' }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(refreshAccessToken()).resolves.toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    expect(getAccessToken()).toBe('fresh-token');
  });

  it('收到 401 后只刷新一次并使用新 token 重试原请求', async () => {
    setAccessToken('expired-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: '登录凭证已过期' }, false))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'rotated-token', token_type: 'bearer' }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await authorizedFetch('/api/datasets', { method: 'GET' });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const refreshOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const retryOptions = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect((firstOptions.headers as Headers).get('Authorization')).toBe('Bearer expired-token');
    expect(refreshOptions).toEqual({ method: 'POST', credentials: 'include' });
    expect((retryOptions.headers as Headers).get('Authorization')).toBe('Bearer rotated-token');
    expect(retryOptions.credentials).toBe('include');
  });

  it('刷新失败时清理内存 token 和本地用户状态', async () => {
    setAccessToken('expired-token');
    localStorage.setItem('soft_web_user', JSON.stringify({ id: 1, username: 'alice' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: '登录凭证已过期' }, false))
      .mockResolvedValueOnce(jsonResponse({ detail: '刷新凭证无效或已过期' }, false));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(authorizedFetch('/api/datasets')).rejects.toThrow('登录已过期，请重新登录');
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('soft_web_user')).toBeNull();
  });

  it('注销请求携带 Cookie 且不发送 refresh token 请求体', async () => {
    setAccessToken('access-token');
    localStorage.setItem('soft_web_user', JSON.stringify({ id: 1, username: 'alice' }));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '已退出登录' }));
    globalThis.fetch = fetchMock as typeof fetch;

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(options.body).toBeUndefined();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('soft_web_user')).toBeNull();
  });
});
