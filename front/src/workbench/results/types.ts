import type { AnalysisTask, AnalysisTaskLog } from '../tasks/types';

export type MetricSummary = {
  mean: number;
  std: number;
  min: number;
  max: number;
};

export type RunMetric = {
  run: number;
  seed: number;
  runtimeSeconds: number;
  acc: number;
  nmi: number;
  ari: number;
  f1: number;
};

export type MatrixPreview = {
  shape: [number, number];
  rowIndices: number[];
  columnIndices: number[];
  values: number[][];
  stats: {
    min: number;
    max: number;
    mean: number;
    std: number;
    diagonalMean: number | null;
    symmetryMaxError: number | null;
    nonzeroRatio: number;
  };
  topPairs: Array<{ row: number; column: number; value: number }>;
};

export type AnalysisResult = {
  schemaVersion: 1;
  parameters: Record<string, unknown>;
  runtimeSeconds: number | null;
  metrics: {
    aggregate: Record<'acc' | 'nmi' | 'ari' | 'f1', MetricSummary>;
    runs: RunMetric[];
  };
  kernelWeights: {
    items: Array<{ key: string; mean: number; std: number; representative: number }>;
    runs: Array<{ run: number; values: number[] }>;
  };
  convergence: {
    representativeRun: number;
    runs: Array<{
      run: number;
      converged: boolean;
      points: Array<{ iteration: number; objective: number; relativeChange: number | null }>;
    }>;
  };
  preview: {
    schemaVersion: 1;
    summary: {
      mode: string;
      sampleCount: number;
      baseClusterCount: number;
      classCount: number;
      representativeRun: number;
      randomSeed: number;
    };
    matrices: { ca: MatrixPreview; s: MatrixPreview; z: MatrixPreview };
    scatter: {
      totalCount: number;
      sampled: boolean;
      points: Array<{
        sampleIndex: number;
        x: number;
        y: number;
        predictedLabel: string;
        trueLabel: string;
      }>;
    };
  };
  artifacts: Array<{
    key: string;
    name: string;
    format: string;
    size: number;
    downloadUrl: string;
  }>;
};

export type TaskResultEnvelope = {
  state: 'empty' | 'draft' | 'queued' | 'running' | 'failed' | 'cancelled' | 'ready' | 'legacy';
  task?: AnalysisTask | null;
  result?: AnalysisResult | null;
};

export type TaskExport = {
  id: number;
  name: string;
  items: string[];
  itemCount: number;
  status: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  downloadUrl: string;
};

export type TaskResultResource = {
  loading: boolean;
  error: string | null;
  envelope: TaskResultEnvelope | null;
  taskId: number | null;
  refresh: () => void;
  selectTask: (taskId: number) => void;
  logs: AnalysisTaskLog[];
  logsLoading: boolean;
  logsError: string | null;
  refreshLogs: () => void;
};
