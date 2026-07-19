import { getStoredAccessToken } from './auth';
import { API_BASE_URL } from './config';
import type {
  AnalysisTask,
  AnalysisTaskLog,
  AnalysisTaskPage,
  AnalysisTaskStats,
  CreateTaskPayload,
  TaskListQuery,
  TaskTemplate,
} from '../workbench/tasks/types';

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('请先登录后再操作任务中心');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : '请求失败';
    throw new Error(detail);
  }
  return body as T;
}

function toQuery(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function fetchTaskStats() {
  return requestJson<AnalysisTaskStats>('/tasks/stats');
}

export function fetchTasks(query: TaskListQuery = {}) {
  return requestJson<AnalysisTaskPage>(
    `/tasks${toQuery({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      mode: query.mode,
      datasetId: query.datasetId,
      keyword: query.keyword,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    })}`,
  );
}

export function fetchTaskDetail(taskId: number) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}`);
}

export function createTask(payload: CreateTaskPayload) {
  return requestJson<AnalysisTask>('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTask(
  taskId: number,
  payload: { name?: string; mode?: string; params?: CreateTaskPayload['params'] },
) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function startTask(taskId: number) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}/start`, { method: 'POST' });
}

export function cancelTask(taskId: number) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}/cancel`, { method: 'POST' });
}

export function retryTask(taskId: number) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}/retry`, { method: 'POST' });
}

export function cloneTask(taskId: number) {
  return requestJson<AnalysisTask>(`/tasks/${taskId}/clone`, { method: 'POST' });
}

export function deleteTask(taskId: number) {
  return requestJson<{ message: string }>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export function fetchTaskLogs(taskId: number, signal?: AbortSignal) {
  return requestJson<{ items: AnalysisTaskLog[]; total: number }>(`/tasks/${taskId}/logs`, { signal });
}

export function bulkTasks(taskIds: number[], action: 'retry' | 'cancel' | 'delete') {
  return requestJson<{ message: string }>('/tasks/bulk', {
    method: 'POST',
    body: JSON.stringify({ taskIds, action }),
  });
}

export function fetchTaskTemplates() {
  return requestJson<{ items: TaskTemplate[] }>('/tasks/templates');
}

export function createTaskTemplate(payload: {
  name: string;
  mode: string;
  params?: CreateTaskPayload['params'];
}) {
  return requestJson<TaskTemplate>('/tasks/templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteTaskTemplate(templateId: number) {
  return requestJson<{ message: string }>(`/tasks/templates/${templateId}`, { method: 'DELETE' });
}

export async function fetchDatasetOptions() {
  const token = getStoredAccessToken();
  if (!token) throw new Error('请先登录后再操作任务中心');
  const response = await fetch(`${API_BASE_URL}/datasets?page=1&pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : '加载数据集失败');
  }
  const items = Array.isArray(body.items) ? body.items : [];
  return items.map((item: any) => ({
    id: Number(item.id),
    name: String(item.name ?? ''),
    baseCount: Number(item.baseCount) || 0,
    sampleCount: Number(item.sampleCount) || 0,
    qualityStatus: String(item.qualityStatus ?? 'ready'),
    qualityIssues: Array.isArray(item.qualityIssues) ? item.qualityIssues : [],
    hasLabels: Boolean(item.hasLabels),
    classCount: Number(item.classCount) || 0,
  }));
}
