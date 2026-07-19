import { getStoredAccessToken } from './auth';
import { API_BASE_URL } from './config';
import type { TaskExport, TaskResultEnvelope } from '../workbench/results/types';

function errorMessage(body: unknown) {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message?: unknown }).message || '请求失败');
    }
  }
  return '请求失败';
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) throw new Error('请先登录后再查看分析结果');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body));
  return body as T;
}

export function fetchLatestTaskResult(signal?: AbortSignal) {
  return requestJson<TaskResultEnvelope>('/tasks/results/latest', { signal });
}

export function fetchTaskResult(taskId: number, signal?: AbortSignal) {
  return requestJson<TaskResultEnvelope>(`/tasks/${taskId}/result`, { signal });
}

export function fetchTaskExports(taskId: number) {
  return requestJson<{ items: TaskExport[] }>(`/tasks/${taskId}/exports`);
}

export function createTaskExport(taskId: number, items: string[], name?: string) {
  return requestJson<TaskExport>(`/tasks/${taskId}/exports`, {
    method: 'POST',
    body: JSON.stringify({ items, name: name?.trim() || undefined }),
  });
}

export async function downloadProtectedFile(path: string, fallbackName: string) {
  const token = getStoredAccessToken();
  if (!token) throw new Error('请先登录后再下载文件');
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(errorMessage(body));
  }
  const blob = await response.blob();
  const header = response.headers.get('content-disposition') || '';
  const matched = /filename="?([^";]+)"?/i.exec(header);
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = matched?.[1] || fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
}
