import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage, RegisterPage } from './AuthPages';

describe('AuthPages', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it('logs in through the auth API and stores tokens', async () => {
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

    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'secret123' }),
      }),
    );
    expect(localStorage.getItem('soft_web_access_token')).toBe('access-token');
    expect(localStorage.getItem('soft_web_refresh_token')).toBe('refresh-token');
  });

  it('shows a register error when passwords do not match', async () => {
    const onSuccess = vi.fn();
    globalThis.fetch = vi.fn();

    render(
      <RegisterPage
        onSuccess={onSuccess}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.type(screen.getByLabelText('确认密码'), 'different');
    await userEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('两次密码不一致');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
