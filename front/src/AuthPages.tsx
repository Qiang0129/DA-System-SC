import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, LoaderCircle, LogIn, MailCheck, UserPlus } from 'lucide-react';
import {
  createTurnstilePass,
  login,
  register,
  saveAuthSession,
  sendRegisterEmailCode,
} from './api/auth';
import type { TurnstileAction } from './api/auth';
import { TURNSTILE_SITE_KEY } from './api/config';
import { SOFTWARE_SHORT_NAME } from './appMeta';
import { TurnstileWidget, type TurnstileWidgetHandle } from './TurnstileWidget';

const AUTH_SUBMIT_FEEDBACK_MS = 260;

interface AuthProps {
  onSuccess: () => void;
  onSwitch: () => void;
  onBack: () => void;
  turnstileEnabled?: boolean;
  hasTurnstilePass?: boolean;
  turnstilePassToken?: string;
  onTurnstileVerify?: (token: string, action: TurnstileAction) => Promise<void>;
}

type TurnstilePassState = {
  token: string;
  expiresAtMs: number;
};

function waitForAuthSubmitFeedback(startedAt: number) {
  const remaining = AUTH_SUBMIT_FEEDBACK_MS - (Date.now() - startedAt);

  if (remaining <= 0) {
    return Promise.resolve();
  }

  // 极快响应也保留短暂加载态，避免用户误以为点击没有生效。
  return new Promise<void>((resolve) => {
    setTimeout(resolve, remaining);
  });
}

function getTurnstilePassExpiresAt(expiresInSeconds: number) {
  const seconds = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 0;
  return Date.now() + seconds * 1000;
}

function useAuthTurnstilePass() {
  const [turnstilePass, setTurnstilePass] = useState<TurnstilePassState | null>(null);

  useEffect(() => {
    if (!turnstilePass) {
      return undefined;
    }

    const remainingMs = turnstilePass.expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      setTurnstilePass(null);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setTurnstilePass(null);
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [turnstilePass]);

  const exchangeTurnstilePass = useCallback(async (token: string, action: TurnstileAction) => {
    const response = await createTurnstilePass(token, action);
    if (!response.turnstile_pass_token || response.expires_in_seconds <= 0) {
      throw new Error('人机验证已过期，请重新验证');
    }

    setTurnstilePass({
      token: response.turnstile_pass_token,
      expiresAtMs: getTurnstilePassExpiresAt(response.expires_in_seconds),
    });
  }, []);

  const hasTurnstilePass = Boolean(turnstilePass && turnstilePass.expiresAtMs > Date.now());

  return {
    hasTurnstilePass,
    turnstilePassToken: hasTurnstilePass && turnstilePass ? turnstilePass.token : '',
    onTurnstileVerify: exchangeTurnstilePass,
  };
}

function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        className="auth-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        spellCheck={type === 'text' ? false : undefined}
        required
      />
    </div>
  );
}

function LoginCard({
  onSuccess,
  onSwitch,
  onBack,
  turnstileEnabled = true,
  hasTurnstilePass = false,
  turnstilePassToken = '',
  onTurnstileVerify,
}: AuthProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);
  const turnstileRequired = Boolean(TURNSTILE_SITE_KEY) && turnstileEnabled && !hasTurnstilePass;

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    if (!token) {
      return;
    }

    setError('');
    void onTurnstileVerify?.(token, 'login')
      .then(() => {
        setTurnstileToken('');
      })
      .catch((err) => {
        setTurnstileToken('');
        setError(err instanceof Error ? err.message : '人机验证失败，请重新验证');
        turnstileRef.current?.reset();
      });
  }, [onTurnstileVerify]);

  const handleTurnstileError = useCallback((message: string) => {
    setTurnstileToken('');
    setError(message);
  }, []);

  const resetTurnstile = useCallback(() => {
    if (!turnstileRequired) {
      return;
    }
    turnstileRef.current?.reset();
    setTurnstileToken('');
  }, [turnstileRequired]);

  const handleSubmit = async () => {
    const startedAt = Date.now();
    setError('');

    if (turnstileRequired && !turnstileToken) {
      setError('请先完成人机验证');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await login(
        username.trim(),
        password,
        turnstileRequired ? turnstileToken || null : null,
        hasTurnstilePass ? turnstilePassToken : null,
      );
      saveAuthSession(auth);
      await waitForAuthSubmitFeedback(startedAt);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card-title">登录</h1>
      <p className="auth-card-subtitle">登录到 {SOFTWARE_SHORT_NAME}</p>
      <form
        className="auth-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          await handleSubmit();
        }}
      >
        <AuthField
          id="login-username"
          name="username"
          label="用户名或邮箱"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="请输入用户名或邮箱"
        />
        <AuthField
          id="login-password"
          name="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="请输入密码"
        />
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileRequired ? TURNSTILE_SITE_KEY : ''}
          action="login"
          onVerify={handleTurnstileVerify}
          onError={handleTurnstileError}
        />
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button
          type="submit"
          className={`btn btn-primary auth-submit ${submitting ? 'is-loading' : ''}`}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <LoaderCircle className="auth-submit-spinner" size={16} aria-hidden="true" />
          ) : (
            <LogIn size={16} aria-hidden="true" />
          )}
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
      <p className="auth-switch">
        还没有账号？
        <button type="button" onClick={onSwitch}>去注册</button>
      </p>
      <button type="button" className="auth-back" onClick={onBack}>
        <ArrowLeft size={12} aria-hidden="true" /> 返回首页
      </button>
    </div>
  );
}

function RegisterCard({
  onSuccess,
  onSwitch,
  onBack,
  turnstileEnabled = true,
  hasTurnstilePass = false,
  turnstilePassToken = '',
  onTurnstileVerify,
}: AuthProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);
  const turnstileRequired = Boolean(TURNSTILE_SITE_KEY) && turnstileEnabled && !hasTurnstilePass;

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    if (!token) {
      return;
    }

    setError('');
    void onTurnstileVerify?.(token, 'register')
      .then(() => {
        setTurnstileToken('');
      })
      .catch((err) => {
        setTurnstileToken('');
        setError(err instanceof Error ? err.message : '人机验证失败，请重新验证');
        turnstileRef.current?.reset();
      });
  }, [onTurnstileVerify]);

  const handleTurnstileError = useCallback((message: string) => {
    setTurnstileToken('');
    setError(message);
  }, []);

  const resetTurnstile = useCallback(() => {
    if (!turnstileRequired) {
      return;
    }
    turnstileRef.current?.reset();
    setTurnstileToken('');
  }, [turnstileRequired]);

  useEffect(() => {
    if (emailCodeCooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setEmailCodeCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [emailCodeCooldown]);

  const handleSendEmailCode = async () => {
    setError('');
    setNotice('');

    if (!email.trim()) {
      setError('请先填写邮箱');
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      setError('请先完成人机验证');
      return;
    }

    setSendingEmailCode(true);
    try {
      await sendRegisterEmailCode(
        email.trim(),
        turnstileRequired ? turnstileToken || null : null,
        hasTurnstilePass ? turnstilePassToken : null,
      );
      setNotice('验证码已发送，请查看邮箱');
      setEmailCodeCooldown(60);
      resetTurnstile();
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
      resetTurnstile();
    } finally {
      setSendingEmailCode(false);
    }
  };

  const handleSubmit = async () => {
    const startedAt = Date.now();
    setError('');
    setNotice('');

    if (password !== confirm) {
      setError('两次密码不一致');
      return;
    }

    if (!email.trim()) {
      setError('请先填写邮箱');
      return;
    }

    if (!emailCode.trim()) {
      setError('请填写邮箱验证码');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await register(username.trim(), email.trim(), password, confirm, emailCode.trim());
      saveAuthSession(auth);
      await waitForAuthSubmitFeedback(startedAt);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
      resetTurnstile();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card-title">注册</h1>
      <p className="auth-card-subtitle">创建 {SOFTWARE_SHORT_NAME} 账号</p>
      <form
        className="auth-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          await handleSubmit();
        }}
      >
        <AuthField
          id="register-username"
          name="username"
          label="用户名"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="请输入用户名"
        />
        <AuthField
          id="register-email"
          name="email"
          label="邮箱"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="请输入邮箱"
        />
        <AuthField
          id="register-password"
          name="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="请输入密码"
        />
        <AuthField
          id="register-confirm"
          name="confirmPassword"
          label="确认密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          placeholder="请再次输入密码"
        />
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileRequired ? TURNSTILE_SITE_KEY : ''}
          action="register"
          onVerify={handleTurnstileVerify}
          onError={handleTurnstileError}
        />
        <div className="auth-code-row">
          <AuthField
            id="register-email-code"
            name="emailCode"
            label="邮箱验证码"
            type="text"
            value={emailCode}
            onChange={setEmailCode}
            autoComplete="one-time-code"
            placeholder="请输入验证码"
          />
          <button
            type="button"
            className="auth-code-button"
            disabled={sendingEmailCode || emailCodeCooldown > 0}
            aria-busy={sendingEmailCode}
            onClick={handleSendEmailCode}
          >
            {sendingEmailCode ? (
              <LoaderCircle className="auth-submit-spinner" size={15} aria-hidden="true" />
            ) : (
              <MailCheck size={15} aria-hidden="true" />
            )}
            {emailCodeCooldown > 0 ? `${emailCodeCooldown}s` : '发送验证码'}
          </button>
        </div>
        {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button
          type="submit"
          className={`btn btn-primary auth-submit ${submitting ? 'is-loading' : ''}`}
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <LoaderCircle className="auth-submit-spinner" size={16} aria-hidden="true" />
          ) : (
            <UserPlus size={16} aria-hidden="true" />
          )}
          {submitting ? '注册中…' : '注册'}
        </button>
      </form>
      <p className="auth-switch">
        已有账号？
        <button type="button" onClick={onSwitch}>去登录</button>
      </p>
      <button type="button" className="auth-back" onClick={onBack}>
        <ArrowLeft size={12} aria-hidden="true" /> 返回首页
      </button>
    </div>
  );
}

export function LoginPage({ onSuccess, onSwitch, onBack }: AuthProps) {
  const turnstilePass = useAuthTurnstilePass();

  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <LoginCard onSuccess={onSuccess} onSwitch={onSwitch} onBack={onBack} {...turnstilePass} />
    </div>
  );
}

export function RegisterPage({ onSuccess, onSwitch, onBack }: AuthProps) {
  const turnstilePass = useAuthTurnstilePass();

  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <RegisterCard onSuccess={onSuccess} onSwitch={onSwitch} onBack={onBack} {...turnstilePass} />
    </div>
  );
}

interface AuthFlipCardProps {
  mode: 'login' | 'register';
  onSuccess: () => void;
  onShowLogin: () => void;
  onShowRegister: () => void;
  onBack: () => void;
}

function AuthFlipFace({
  active,
  className,
  children,
}: {
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  const faceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const face = faceRef.current;

    if (!face) {
      return;
    }

    if (active) {
      face.removeAttribute('inert');
    } else {
      face.setAttribute('inert', '');
    }
  }, [active]);

  return (
    <div ref={faceRef} className={className} aria-hidden={!active}>
      {children}
    </div>
  );
}

export function AuthFlipCard({
  mode,
  onSuccess,
  onShowLogin,
  onShowRegister,
  onBack,
}: AuthFlipCardProps) {
  const flipped = mode === 'register';
  const turnstilePass = useAuthTurnstilePass();

  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <div className={`auth-flip${flipped ? ' is-flipped' : ''}`}>
        <div className="auth-flip-inner">
          <AuthFlipFace active={!flipped} className="auth-flip-face auth-flip-front">
            <LoginCard
              onSuccess={onSuccess}
              onSwitch={onShowRegister}
              onBack={onBack}
              turnstileEnabled={!flipped}
              {...turnstilePass}
            />
          </AuthFlipFace>
          <AuthFlipFace active={flipped} className="auth-flip-face auth-flip-back">
            <RegisterCard
              onSuccess={onSuccess}
              onSwitch={onShowLogin}
              onBack={onBack}
              turnstileEnabled={flipped}
              {...turnstilePass}
            />
          </AuthFlipFace>
        </div>
      </div>
    </div>
  );
}
