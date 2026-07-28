import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const configDir = dirname(fileURLToPath(import.meta.url));
const turnstilePlaceholderValues = new Set([
  'your_site_key_here',
  'replace-with-cloudflare-turnstile-site-key',
]);

function normalizeEnvValue(value: string | undefined) {
  return (value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function isTurnstilePlaceholder(value: string) {
  return turnstilePlaceholderValues.has(value);
}

function readEnvValue(filePath: string, key: string) {
  if (!existsSync(filePath)) {
    return '';
  }

  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    if (name !== key) {
      continue;
    }

    return normalizeEnvValue(trimmed.slice(separatorIndex + 1));
  }

  return '';
}

function readLocalTurnstileSiteKey(mode: string) {
  const envFiles = [
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];

  let siteKey = '';
  for (const envFile of envFiles) {
    const value = readEnvValue(resolve(configDir, envFile), 'VITE_TURNSTILE_SITE_KEY');
    if (value) {
      siteKey = value;
    }
  }

  return siteKey;
}

function preferProjectTurnstileSiteKey(mode: string) {
  const currentValue = normalizeEnvValue(process.env.VITE_TURNSTILE_SITE_KEY);
  const localValue = readLocalTurnstileSiteKey(mode);

  // Windows 里如果系统环境变量保留了占位值，Vite 会优先使用它并导致 Cloudflare 400020。
  // 这里在启动阶段用项目本地 .env 的真实 key 纠正，避免登录页拿到无效站点密钥。
  if ((!currentValue || isTurnstilePlaceholder(currentValue)) && localValue && !isTurnstilePlaceholder(localValue)) {
    process.env.VITE_TURNSTILE_SITE_KEY = localValue;
  }
}

export default defineConfig(({ mode }) => {
  preferProjectTurnstileSiteKey(mode);

  const backendOrigin = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
  };
});
