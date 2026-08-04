import {
  apiFetch,
  apiJson,
  ensureApiResponse,
  PROTECTED_DOWNLOAD_TIMEOUT_MS,
} from './client';
import type { TaskExport, TaskResultEnvelope } from '../workbench/results/types';

function requestJson<T>(path: string, options: RequestInit = {}) {
  return apiJson<T>(path, {
    ...options,
    auth: true,
    unauthenticatedMessage: '请先登录后再查看分析结果',
  });
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
  const response = await apiFetch(path, {
    auth: true,
    timeoutMs: PROTECTED_DOWNLOAD_TIMEOUT_MS,
    unauthenticatedMessage: '请先登录后再下载文件',
  });
  await ensureApiResponse(response, '下载文件失败');
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
