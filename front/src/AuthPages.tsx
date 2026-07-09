import { useState } from 'react';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { login, register, saveAuthSession } from './api/auth';

interface AuthProps {
  onSuccess: () => void;
  onSwitch: () => void;
  onBack: () => void;
}

function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
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
        className="auth-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
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
    setError('');
    setSubmitting(true);
    try {
      const auth = await login(username.trim(), password);
      saveAuthSession(auth);
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
          label="用户名"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthField
          id="login-password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
          <LogIn size={16} aria-hidden="true" />
          {submitting ? '登录中' : '登录'}
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
    setError('');

    if (password !== confirm) {
      setError('两次密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await register(username.trim(), password, confirm);
      saveAuthSession(auth);
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
          label="用户名"
          type="text"
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        <AuthField
          id="register-password"
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <AuthField
          id="register-confirm"
          label="确认密码"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
          <UserPlus size={16} aria-hidden="true" />
          {submitting ? '注册中' : '注册'}
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
          <div className="auth-flip-face auth-flip-front" aria-hidden={flipped}>
            <LoginCard onSuccess={onSuccess} onSwitch={onShowRegister} onBack={onBack} />
          </div>
          <div className="auth-flip-face auth-flip-back" aria-hidden={!flipped}>
            <RegisterCard onSuccess={onSuccess} onSwitch={onShowLogin} onBack={onBack} />
          </div>
        </div>
      </div>
    </div>
  );
}
