export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type TaskMode = 'OMELET' | 'OMELET-SV';

export type TaskParams = {
  nBase: number;
  sigma: number;
  lambda: number;
  gamma: number;
  anchor: number;
  runs: number;
  maxIter: number;
  randomSeed: number;
};

export type TaskMetricsSummary = {
  acc?: number | null;
  nmi?: number | null;
  ari?: number | null;
  f1?: number | null;
};

export type AnalysisTask = {
  id: number;
  name: string;
  mode: TaskMode | string;
  status: TaskStatus | string;
  progress: number;
  currentRun?: number;
  totalRuns?: number;
  queuePosition?: number | null;
  currentIter: number;
  maxIter: number;
  currentStage?: string | null;
  datasetId: number;
  datasetName: string;
  params: Partial<TaskParams> & Record<string, unknown>;
  errorMessage?: string | null;
  failureReason?: string | null;
  metricsSummary?: TaskMetricsSummary | null;
  runtimeSeconds?: number | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt: string;
};

export type AnalysisTaskPage = {
  items: AnalysisTask[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AnalysisTaskStats = {
  total: number;
  draft: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  todayCompleted: number;
  averageRuntimeSeconds?: number | null;
  failureRate: number;
};

export type AnalysisTaskLog = {
  id: number;
  action: string;
  level: string;
  message: string;
  createdAt: string;
  detail?: Record<string, unknown> | null;
};

export type TaskTemplate = {
  id: number;
  name: string;
  mode: TaskMode | string;
  params: Partial<TaskParams> & Record<string, unknown>;
  createdAt: string;
};

export type TaskListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  mode?: string;
  datasetId?: number;
  keyword?: string;
  createdFrom?: string;
  createdTo?: string;
};

export type CreateTaskPayload = {
  datasetId: number;
  name?: string;
  mode?: TaskMode | string;
  params?: Partial<TaskParams> & { lambda?: number };
  startImmediately?: boolean;
  templateId?: number;
};

export type DatasetOption = {
  id: number;
  name: string;
  baseCount: number;
  sampleCount: number;
  qualityStatus: string;
  qualityIssues?: string[];
  hasLabels?: boolean;
  classCount?: number;
};
