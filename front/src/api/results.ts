import { authorizedFetch, authorizedJson } from './auth';
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

function requestJson<T>(path: string, options: RequestInit = {}) {
  return authorizedJson<T>(path, options, '请先登录后再查看分析结果');
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
  const response = await authorizedFetch(path, {}, '请先登录后再下载文件');
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
