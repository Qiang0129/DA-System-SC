export type MetricKey = 'acc' | 'nmi' | 'ari' | 'f1';

export const metricLabels: Record<MetricKey, string> = {
  acc: 'ACC',
  nmi: 'NMI',
  ari: 'ARI',
  f1: 'F1-score',
};

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number(value).toFixed(digits);
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadTextFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function taskResultPath(section: string, taskId: number) {
  return `/workbench/${section}?taskId=${encodeURIComponent(taskId)}`;
}
