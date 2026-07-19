import { getStoredAccessToken } from './auth';
import { API_BASE_URL } from './config';

export type DatasetQualityStatus = 'ready' | 'warning' | 'error';

export type DatasetCatalogItem = {
  id: number;
  name: string;
  createdAt: string;
  fileSizeBytes: number;
  sampleCount: number;
  baseCount: number;
  classCount: number;
  hasLabels: boolean;
  dataType: string;
  taskCount: number;
  lastAnalysisAt: string | null;
  version: number;
  qualityStatus: DatasetQualityStatus;
  qualityIssues: string[];
  matrixShape: string;
  labelShape: string;
};

export type DatasetCatalogPage = {
  items: DatasetCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type DatasetRevision = {
  id: number;
  version: number;
  action: string;
  name: string;
  originalFilename: string;
  createdAt: string;
  sampleCount: number;
  baseCount: number;
  classCount: number;
  hasLabels: boolean;
  qualityStatus: DatasetQualityStatus;
  qualityIssues: string[];
};

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('请先登录后再查看数据集信息');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

export async function fetchDatasetCatalog(pageSize = 100): Promise<DatasetCatalogPage> {
  const body = await requestJson<DatasetCatalogPage | DatasetCatalogItem[]>(
    `/datasets?page=1&pageSize=${pageSize}`,
  );

  if (Array.isArray(body)) {
    return {
      items: body,
      total: body.length,
      page: 1,
      pageSize,
      totalPages: body.length > 0 ? 1 : 0,
    };
  }

  return {
    items: Array.isArray(body.items) ? body.items : [],
    total: Number(body.total) || 0,
    page: Number(body.page) || 1,
    pageSize: Number(body.pageSize) || pageSize,
    totalPages: Number(body.totalPages) || 0,
  };
}

export function recheckDatasetQuality(datasetId: number) {
  return requestJson<DatasetCatalogItem>(`/datasets/${datasetId}/quality`, {
    method: 'POST',
  });
}

export function fetchDatasetVersions(datasetId: number) {
  return requestJson<DatasetRevision[]>(`/datasets/${datasetId}/versions`);
}
