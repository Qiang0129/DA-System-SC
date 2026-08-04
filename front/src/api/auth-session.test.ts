import {
  clearAuthSession,
  getAccessToken,
  refreshAccessToken,
  saveAuthSession,
  setAccessToken,
  subscribeAuthSession,
} from './auth-session';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 401) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('认证会话状态机', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearAuthSession();
    setAccessToken(null);
  });

  it('只保存内存 access token，并清理旧版 localStorage token', () => {
    localStorage.setItem('soft_web_access_token', 'legacy-access');
    localStorage.setItem('soft_web_refresh_token', 'legacy-refresh');

    saveAuthSession({
      access_token: 'access-token',
      user: { id: 1, username: 'alice' },
    });

    expect(getAccessToken()).toBe('access-token');
    expect(localStorage.getItem('soft_web_user')).toContain('alice');
    expect(localStorage.getItem('soft_web_access_token')).toBeNull();
    expect(localStorage.getItem('soft_web_refresh_token')).toBeNull();
  });

  it('refresh 失败只发送一次全局会话失效事件', async () => {
    setAccessToken('expired-token');
    const listener = vi.fn();
    const unsubscribe = subscribeAuthSession(listener);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: '刷新凭证无效或已过期' }, false),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(refreshAccessToken()).resolves.toBeNull();
    await expect(refreshAccessToken()).resolves.toBeNull();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reason: 'refresh_failed' }));
    expect(getAccessToken()).toBeNull();
    unsubscribe();
  });
});
