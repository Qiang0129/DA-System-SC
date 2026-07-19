import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import { login, register, saveAuthSession } from './api/auth';

const AUTH_SUBMIT_FEEDBACK_MS = 260;

interface AuthProps {
  onSuccess: () => void;
  onSwitch: () => void;
  onBack: () => void;
}

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

function AuthField({
  id,
  name,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
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
        spellCheck={type === 'text' ? false : undefined}
        required
      />
    </div>
  );
}

function LoginCard({ onSuccess, onSwitch, onBack }: AuthProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const startedAt = Date.now();
    setError('');
    setSubmitting(true);
    try {
      const auth = await login(username.trim(), password);
      saveAuthSession(auth);
      await waitForAuthSubmitFeedback(startedAt);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card-title">登录</h1>
      <p className="auth-card-subtitle">登录到 OMELET Lab</p>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await handleSubmit();
        }}
      >
        <AuthField
          id="login-username"
          name="username"
          label="用户名"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthField
          id="login-password"
          name="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
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

function RegisterCard({ onSuccess, onSwitch, onBack }: AuthProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const startedAt = Date.now();
    setError('');

    if (password !== confirm) {
      setError('两次密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await register(username.trim(), password, confirm);
      saveAuthSession(auth);
      await waitForAuthSubmitFeedback(startedAt);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-card-title">注册</h1>
      <p className="auth-card-subtitle">创建 OMELET Lab 账号</p>
      <form
        className="auth-form"
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
        />
        <AuthField
          id="register-password"
          name="password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <AuthField
          id="register-confirm"
          name="confirmPassword"
          label="确认密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
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
  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <LoginCard onSuccess={onSuccess} onSwitch={onSwitch} onBack={onBack} />
    </div>
  );
}

export function RegisterPage({ onSuccess, onSwitch, onBack }: AuthProps) {
  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <RegisterCard onSuccess={onSuccess} onSwitch={onSwitch} onBack={onBack} />
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

  return (
    <div className="auth-page">
      <div className="blur-ball blur-ball-amber" aria-hidden="true" />
      <div className={`auth-flip${flipped ? ' is-flipped' : ''}`}>
        <div className="auth-flip-inner">
          <AuthFlipFace active={!flipped} className="auth-flip-face auth-flip-front">
            <LoginCard onSuccess={onSuccess} onSwitch={onShowRegister} onBack={onBack} />
          </AuthFlipFace>
          <AuthFlipFace active={flipped} className="auth-flip-face auth-flip-back">
            <RegisterCard onSuccess={onSuccess} onSwitch={onShowLogin} onBack={onBack} />
          </AuthFlipFace>
        </div>
      </div>
    </div>
  );
}
