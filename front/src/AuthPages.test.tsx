import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthFlipCard, LoginPage, RegisterPage } from './AuthPages';

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
    const submit = screen.getByRole('button', { name: '登录' });

    await userEvent.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveTextContent('登录中…');

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

  it('shows submitting feedback while registering', async () => {
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

    await userEvent.type(screen.getByLabelText('用户名'), 'bob');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    await userEvent.type(screen.getByLabelText('确认密码'), 'secret123');
    const submit = screen.getByRole('button', { name: '注册' });

    await userEvent.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveTextContent('注册中…');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('restores the login button after an authentication failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('登录失败'));

    render(
      <LoginPage
        onSuccess={() => undefined}
        onSwitch={() => undefined}
        onBack={() => undefined}
      />,
    );

    await userEvent.type(screen.getByLabelText('用户名'), 'alice');
    await userEvent.type(screen.getByLabelText('密码'), 'secret123');
    const submit = screen.getByRole('button', { name: '登录' });

    await userEvent.click(submit);

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败');
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'false');
    expect(submit).toHaveTextContent('登录');
  });

  it('flips between accessible login and register card faces', () => {
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
