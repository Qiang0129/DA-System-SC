import { describe, expect, it } from 'vitest';
import { buildEvaluationCsv, deriveEvaluationSummary } from './evaluationPresentation';
import type { AnalysisResult } from './types';

const evaluationResult = {
  metrics: {
    aggregate: {
      acc: { mean: 0.71, std: 0.005, min: 0.70, max: 0.72 },
      nmi: { mean: 0.13, std: 0.004, min: 0.12, max: 0.14 },
      ari: { mean: 0.18, std: 0.008, min: 0.17, max: 0.19 },
      f1: { mean: 0.60, std: 0.006, min: 0.59, max: 0.61 },
    },
    runs: [
      { run: 1, seed: 21, runtimeSeconds: 0.4, acc: 0.70, nmi: 0.12, ari: 0.17, f1: 0.59 },
      { run: 2, seed: 22, runtimeSeconds: 0.6, acc: 0.72, nmi: 0.14, ari: 0.19, f1: 0.61 },
    ],
  },
} as AnalysisResult;

describe('deriveEvaluationSummary', () => {
  it('derives best runs, runtime bounds and comparable variation from real rows', () => {
    const summary = deriveEvaluationSummary(evaluationResult);
    const acc = summary.metrics.find((metric) => metric.key === 'acc');

    expect(summary.runCount).toBe(2);
    expect(summary.meanRuntime).toBe(0.5);
    expect(summary.totalRuntime).toBe(1);
    expect(summary.minimumRuntime).toBe(0.4);
    expect(summary.maximumRuntime).toBe(0.6);
    expect(acc?.bestRun?.run).toBe(2);
    expect(acc?.meanPosition).toBe(50);
    expect(summary.mostStableMetric?.key).toBe('acc');
    expect(summary.mostVariableMetric?.key).toBe('ari');
  });

  it('marks stability as unavailable when only aggregate metrics exist', () => {
    const noRuns = {
      ...evaluationResult,
      metrics: { ...evaluationResult.metrics, runs: [] },
    } as AnalysisResult;
    const summary = deriveEvaluationSummary(noRuns);

    expect(summary.runCount).toBe(0);
    expect(summary.meanRuntime).toBeNull();
    expect(summary.metrics.every((metric) => metric.stabilityLabel === '数据不足')).toBe(true);
  });
});

describe('buildEvaluationCsv', () => {
  it('exports the reproducibility fields and all persisted metrics', () => {
    const csv = buildEvaluationCsv(evaluationResult);

    expect(csv).toContain('run,seed,ACC,NMI,ARI,F1-score,runtimeSeconds');
    expect(csv).toContain('2,22,0.72,0.14,0.19,0.61,0.6');
  });
});
