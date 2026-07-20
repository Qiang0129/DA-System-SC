import { metricLabels, type MetricKey } from './resultPresentation';
import type { AnalysisResult, RunMetric } from './types';

export const evaluationMetricKeys: MetricKey[] = ['acc', 'nmi', 'ari', 'f1'];

export type EvaluationStabilityTone = 'success' | 'warning' | 'neutral';

export type EvaluationMetricInsight = {
  key: MetricKey;
  label: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  spread: number;
  variationRatio: number | null;
  meanPosition: number;
  bestRun: RunMetric | null;
  stabilityLabel: string;
  stabilityTone: EvaluationStabilityTone;
};

export type EvaluationSummary = {
  metrics: EvaluationMetricInsight[];
  runCount: number;
  meanRuntime: number | null;
  totalRuntime: number | null;
  minimumRuntime: number | null;
  maximumRuntime: number | null;
  mostStableMetric: EvaluationMetricInsight | null;
  mostVariableMetric: EvaluationMetricInsight | null;
};

function getStability(
  runCount: number,
  variationRatio: number | null,
): Pick<EvaluationMetricInsight, 'stabilityLabel' | 'stabilityTone'> {
  if (runCount < 2 || variationRatio === null) {
    return { stabilityLabel: '数据不足', stabilityTone: 'neutral' };
  }
  if (variationRatio <= 0.03) {
    return { stabilityLabel: '波动较低', stabilityTone: 'success' };
  }
  if (variationRatio <= 0.08) {
    return { stabilityLabel: '建议关注', stabilityTone: 'warning' };
  }
  return { stabilityLabel: '波动明显', stabilityTone: 'warning' };
}

function getBestRun(rows: RunMetric[], key: MetricKey) {
  return rows.reduce<RunMetric | null>((best, row) => {
    const value = Number(row[key]);
    if (!Number.isFinite(value)) return best;
    if (!best || value > Number(best[key])) return row;
    return best;
  }, null);
}

function getMeanPosition(mean: number, minimum: number, maximum: number) {
  if (![mean, minimum, maximum].every(Number.isFinite) || maximum <= minimum) return 50;
  return Math.min(100, Math.max(0, ((mean - minimum) / (maximum - minimum)) * 100));
}

export function deriveEvaluationSummary(result: AnalysisResult): EvaluationSummary {
  const rows = result.metrics.runs;
  const metrics = evaluationMetricKeys.map<EvaluationMetricInsight>((key) => {
    const aggregate = result.metrics.aggregate[key];
    const mean = Number(aggregate.mean);
    const std = Number(aggregate.std);
    const min = Number(aggregate.min);
    const max = Number(aggregate.max);
    const variationRatio = Number.isFinite(mean) && mean !== 0 && Number.isFinite(std)
      ? Math.abs(std / mean)
      : null;

    return {
      key,
      label: metricLabels[key],
      mean,
      std,
      min,
      max,
      spread: Number.isFinite(min) && Number.isFinite(max) ? Math.max(0, max - min) : 0,
      variationRatio,
      meanPosition: getMeanPosition(mean, min, max),
      bestRun: getBestRun(rows, key),
      ...getStability(rows.length, variationRatio),
    };
  });

  const comparableMetrics = metrics.filter((metric) => metric.variationRatio !== null);
  const byVariation = [...comparableMetrics].sort(
    (left, right) => (left.variationRatio ?? 0) - (right.variationRatio ?? 0),
  );
  const runtimes = rows
    .map((row) => Number(row.runtimeSeconds))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const totalRuntime = runtimes.length
    ? runtimes.reduce((total, value) => total + value, 0)
    : null;

  return {
    metrics,
    runCount: rows.length,
    meanRuntime: totalRuntime === null ? null : totalRuntime / runtimes.length,
    totalRuntime,
    minimumRuntime: runtimes.length ? Math.min(...runtimes) : null,
    maximumRuntime: runtimes.length ? Math.max(...runtimes) : null,
    mostStableMetric: byVariation[0] ?? null,
    mostVariableMetric: byVariation[byVariation.length - 1] ?? null,
  };
}

export function buildEvaluationCsv(result: AnalysisResult) {
  const header = 'run,seed,ACC,NMI,ARI,F1-score,runtimeSeconds';
  const rows = result.metrics.runs.map((row) => [
    row.run,
    row.seed,
    row.acc,
    row.nmi,
    row.ari,
    row.f1,
    row.runtimeSeconds,
  ].join(','));
  return [header, ...rows].join('\n');
}
