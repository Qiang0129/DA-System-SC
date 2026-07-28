import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type AuthPagesModule = typeof import('./AuthPages');
type TurnstileRenderOptions = {
  callback: (token: string) => void;
  'error-callback': (code?: string) => void;
};
type TestTurnstileApi = {
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

async function loadAuthPages(siteKey = ''): Promise<AuthPagesModule> {
  vi.resetModules();
  vi.doMock('./api/config', () => ({
    API_BASE_URL: '/api',
    BACKEND_ORIGIN: 'http://127.0.0.1:8000',
    TURNSTILE_SITE_KEY: siteKey,
  }));
  return import('./AuthPages');
}

function installTurnstileMock() {
  let callback: ((token: string) => void) | null = null;
  let errorCallback: ((code?: string) => void) | null = null;
  const api: TestTurnstileApi = {
    render: vi.fn((_container: HTMLElement, options: TurnstileRenderOptions) => {
      callback = options.callback;
      errorCallback = options['error-callback'];
      return 'widget-1';
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };

  (window as Window & { turnstile?: TestTurnstileApi }).turnstile = api;

  return {
    api,
    verify(token = 'cf-token') {
      if (!callback) {
        throw new Error('Turnstile callback has not been registered');
      }
      act(() => callback?.(token));
    },
    fail(code = '400020') {
      if (!errorCallback) {
        throw new Error('Turnstile error callback has not been registered');
      }
      act(() => errorCallback?.(code));
    },
  };
}

describe('AuthPages', () => {
  const originalFetch = globalThis.fetch;
  const originalTurnstile = window.turnstile;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.doUnmock('./api/config');
    vi.resetModules();
    document.getElementById('soft-web-turnstile-script')?.remove();
    if (originalTurnstile) {
      window.turnstile = originalTurnstile;
    } else {
      delete window.turnstile;
    }
  });

  it('logs in through the auth API and stores tokens', async () => {
    const { LoginPage } = await loadAuthPages();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: { id: 1, username: 'alice', role: 'user', status: 'active' },
      }),
    } as Response);

    render(
      <LoginPage
        onSuccess={onSuccess}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('用户名或邮箱'), 'alice@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    const submit = screen.getByRole('button', { name: '登录' });

    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveTextContent('登录中…');

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice@example.com', password: 'secret123', turnstile_token: null }),
      }),
    );
    expect(localStorage.getItem('soft_web_access_token')).toBe('access-token');
    expect(localStorage.getItem('soft_web_refresh_token')).toBe('refresh-token');
  });

  it('shows submitting feedback while registering', async () => {
    const { RegisterPage } = await loadAuthPages();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: { id: 2, username: 'bob', role: 'user', status: 'active' },
      }),
    } as Response);

    render(
      <RegisterPage
        onSuccess={onSuccess}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('用户名'), 'bob');
    await user.type(screen.getByLabelText('邮箱'), 'bob@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    const submit = screen.getByRole('button', { name: '注册' });

    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveTextContent('注册中…');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/register$/),
      expect.objectContaining({
        body: JSON.stringify({
          username: 'bob',
          email: 'bob@example.com',
          password: 'secret123',
          confirm_password: 'secret123',
          email_code: '123456',
        }),
      }),
    );
  });

  it('sends a register email code before account creation', async () => {
    const { RegisterPage } = await loadAuthPages();
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: '验证码已发送' }),
    } as Response);

    render(
      <RegisterPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('邮箱'), 'bob@example.com');
    await user.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(await screen.findByRole('status')).toHaveTextContent('验证码已发送，请查看邮箱');
    expect(screen.getByRole('button', { name: '60s' })).toBeDisabled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/register\/email-code$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'bob@example.com', turnstile_token: null }),
      }),
    );
  });

  it('restores the login button after an authentication failure', async () => {
    const { LoginPage } = await loadAuthPages();
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('登录失败'));

    render(
      <LoginPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('用户名或邮箱'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    const submit = screen.getByRole('button', { name: '登录' });

    await user.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败');
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'false');
    expect(submit).toHaveTextContent('登录');
  });

  it('blocks login when Turnstile is configured but not completed', async () => {
    const { LoginPage } = await loadAuthPages('site-key');
    const user = userEvent.setup();
    const turnstile = installTurnstileMock();
    globalThis.fetch = vi.fn();

    render(
      <LoginPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText('用户名或邮箱'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('请先完成人机验证');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shows the Turnstile error code when widget verification fails', async () => {
    const { LoginPage } = await loadAuthPages('site-key');
    const turnstile = installTurnstileMock();

    render(
      <LoginPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalledTimes(1));
    turnstile.fail('400020');

    expect(await screen.findByRole('alert')).toHaveTextContent('错误码：400020');
  });

  it('submits the Turnstile token with login credentials', async () => {
    const { LoginPage } = await loadAuthPages('site-key');
    const user = userEvent.setup();
    const turnstile = installTurnstileMock();
    const onSuccess = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: { id: 1, username: 'alice', role: 'user', status: 'active' },
      }),
    } as Response);

    render(
      <LoginPage
        onSuccess={onSuccess}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalledTimes(1));
    turnstile.verify('cf-token');
    await user.type(screen.getByLabelText('用户名或邮箱'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({
        body: JSON.stringify({
          username: 'alice',
          password: 'secret123',
          turnstile_token: 'cf-token',
        }),
      }),
    );
  });

  it('resets Turnstile after an authentication failure', async () => {
    const { LoginPage } = await loadAuthPages('site-key');
    const user = userEvent.setup();
    const turnstile = installTurnstileMock();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('登录失败'));

    render(
      <LoginPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalledTimes(1));
    turnstile.verify('cf-token');
    await user.type(screen.getByLabelText('用户名或邮箱'), 'alice');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败');
    expect(turnstile.api.reset).toHaveBeenCalledWith('widget-1');
  });

  it('flips between accessible login and register card faces', async () => {
    const { AuthFlipCard } = await loadAuthPages();
    const props = {
      onSuccess: () => undefined,
      onShowLogin: () => undefined,
      onShowRegister: () => undefined,
      onBack: () => undefined,
    };
    const { container, rerender } = render(
      <AuthFlipCard
        mode="login"
        {...props}
      />,
    );

    const flip = container.querySelector('.auth-flip');
    const front = container.querySelector('.auth-flip-front');
    const back = container.querySelector('.auth-flip-back');

    expect(flip).not.toHaveClass('is-flipped');
    expect(front).toHaveAttribute('aria-hidden', 'false');
    expect(back).toHaveAttribute('aria-hidden', 'true');
    expect(back).toHaveAttribute('inert');

    rerender(
      <AuthFlipCard
        mode="register"
        {...props}
      />,
    );

    expect(flip).toHaveClass('is-flipped');
    expect(front).toHaveAttribute('aria-hidden', 'true');
    expect(front).toHaveAttribute('inert');
    expect(back).toHaveAttribute('aria-hidden', 'false');
    expect(back).not.toHaveAttribute('inert');
  });

  it('shows a register error when passwords do not match', async () => {
    const { RegisterPage } = await loadAuthPages();
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    globalThis.fetch = vi.fn();

    render(
      <RegisterPage
        onSuccess={onSuccess}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await user.type(screen.getByLabelText('用户名'), 'alice');
    await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'different');
    await user.type(screen.getByLabelText('邮箱验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('两次密码不一致');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
