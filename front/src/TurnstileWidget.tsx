import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

const TURNSTILE_SCRIPT_ID = 'soft-web-turnstile-script';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileAction = 'login' | 'register';
type TurnstileStatus = 'idle' | 'loading' | 'ready' | 'failed';

type TurnstileRenderOptions = {
  sitekey: string;
  action: TurnstileAction;
  theme: 'light';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': (code?: string) => void;
  'timeout-callback': () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type TurnstileWidgetHandle = {
  reset: () => void;
};

type TurnstileWidgetProps = {
  siteKey: string;
  action: TurnstileAction;
  onVerify: (token: string) => void;
  onError: (message: string) => void;
};

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile 只能在浏览器中加载'));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        reject(new Error('Turnstile 脚本未就绪'));
        return;
      }
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Turnstile 脚本加载失败')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error('Turnstile 脚本加载失败'));
    };

    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, action, onVerify, onError }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [status, setStatus] = useState<TurnstileStatus>('idle');

    useImperativeHandle(ref, () => ({
      reset() {
        onVerify('');
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }), [onVerify]);

    useEffect(() => {
      if (!siteKey) {
        onVerify('');
        setStatus('idle');
        return undefined;
      }

      let cancelled = false;
      setStatus('loading');

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current) {
            return;
          }

          if (!window.turnstile) {
            throw new Error('Turnstile 脚本未就绪');
          }

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            theme: 'light',
            callback(token) {
              setStatus('ready');
              onVerify(token);
            },
            'expired-callback'() {
              onVerify('');
              onError('人机验证已过期，请重新验证');
            },
            'error-callback'(code) {
              onVerify('');
              setStatus('failed');
              onError(code ? `人机验证失败，请重新尝试（错误码：${code}）` : '人机验证失败，请重新尝试');
            },
            'timeout-callback'() {
              onVerify('');
              onError('人机验证超时，请重新验证');
            },
          });
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          setStatus('failed');
          onVerify('');
          onError('人机验证加载失败，请刷新页面重试');
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile?.remove) {
          window.turnstile.remove(widgetIdRef.current);
        }
        widgetIdRef.current = null;
        if (containerRef.current) {
          containerRef.current.replaceChildren();
        }
      };
    }, [action, onError, onVerify, siteKey]);

    if (!siteKey) {
      return null;
    }

    return (
      <div className="auth-turnstile" aria-label="Cloudflare 人机验证">
        <div className="auth-turnstile-shell" ref={containerRef} />
        {status === 'loading' ? (
          <span className="auth-turnstile-loading">正在加载人机验证…</span>
        ) : null}
        {status === 'failed' ? (
          <span className="auth-turnstile-error">人机验证加载失败</span>
        ) : null}
      </div>
    );
  },
);
