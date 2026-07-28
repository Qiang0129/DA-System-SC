export const API_BASE_URL = '/api';
export const BACKEND_ORIGIN = 'http://127.0.0.1:8000';
export const TURNSTILE_SITE_KEY =
  import.meta.env.MODE === 'test' ? '' : import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
