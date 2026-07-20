import { describe, expect, it } from 'vitest';
import {
  buildConvergenceOption,
  buildEvaluationTrendOption,
  buildKernelRunsOption,
  buildMetricRunsOption,
  getConvergenceRelativeValue,
  getHeatmapValue,
  getKernelRelativeChange,
  getMatrixScalePosition,
} from './ResultChartPanels';
import type { AnalysisResult } from './types';

const result = {
  metrics: {
    runs: [
      {
        run: 4,
        acc: 0.7123,
        nmi: 0.1349,
        ari: 0.1776,
        f1: 0.6049,
      },
    ],
  },
} as AnalysisResult;

describe('buildMetricRunsOption', () => {
  it('keeps the compact metric tooltip inside the chart area', () => {
    const option = buildMetricRunsOption(result);
    const tooltip = option.tooltip as any;
    const series = option.series as any[];
    const params = series.map((item) => ({
      axisValue: '4',
      seriesName: item.name,
      value: item.data[0],
    }));

    expect(tooltip.confine).toBe(true);
    expect(tooltip.formatter(params)).toContain('第 4 轮');
    expect(tooltip.formatter(params)).toContain('71.23%');
    expect(tooltip.formatter(params)).toContain('F1-score');
    expect(tooltip.position([460, 24], params, null, null, {
      contentSize: [230, 76],
      viewSize: [500, 190],
    })).toEqual([218, 36]);
  });
});

describe('buildEvaluationTrendOption', () => {
  it('uses a focused metric scale and exposes the mean and run context', () => {
    const evaluationResult = {
      metrics: {
        aggregate: {
          acc: { mean: 0.712, std: 0.005, min: 0.704, max: 0.719 },
          nmi: { mean: 0.134, std: 0.004, min: 0.129, max: 0.141 },
          ari: { mean: 0.177, std: 0.006, min: 0.169, max: 0.186 },
          f1: { mean: 0.604, std: 0.004, min: 0.598, max: 0.612 },
        },
        runs: [
          { run: 1, seed: 11, runtimeSeconds: 0.4, acc: 0.704, nmi: 0.129, ari: 0.169, f1: 0.598 },
          { run: 2, seed: 12, runtimeSeconds: 0.5, acc: 0.719, nmi: 0.141, ari: 0.186, f1: 0.612 },
        ],
      },
    } as AnalysisResult;
    const option = buildEvaluationTrendOption(evaluationResult, 'nmi');
    const axis = option.yAxis as any;
    const series = (option.series as any[])[0];
    const tooltip = option.tooltip as any;

    expect(axis.min).toBeLessThan(12.9);
    expect(axis.max).toBeGreaterThan(14.1);
    expect(series.name).toBe('NMI');
    expect(series.data).toEqual([12.9, 14.1]);
    expect(series.markLine.data).toEqual([{ yAxis: 13.4 }]);
    expect(tooltip.formatter([{ dataIndex: 1 }])).toContain('随机种子：12');
    expect(tooltip.formatter([{ dataIndex: 1 }])).toContain('NMI：14.10%');
  });

  it('centers relative values on the persisted metric mean without changing raw values', () => {
    const evaluationResult = {
      metrics: {
        aggregate: {
          acc: { mean: 0.712, std: 0.005, min: 0.704, max: 0.719 },
          nmi: { mean: 0.134, std: 0.004, min: 0.129, max: 0.141 },
          ari: { mean: 0.177, std: 0.006, min: 0.169, max: 0.186 },
          f1: { mean: 0.604, std: 0.004, min: 0.598, max: 0.612 },
        },
        runs: [
          { run: 1, seed: 11, runtimeSeconds: 0.4, acc: 0.704, nmi: 0.129, ari: 0.169, f1: 0.598 },
          { run: 2, seed: 12, runtimeSeconds: 0.5, acc: 0.719, nmi: 0.141, ari: 0.186, f1: 0.612 },
        ],
      },
    } as AnalysisResult;
    const option = buildEvaluationTrendOption(evaluationResult, 'nmi', 'relative');
    const axis = option.yAxis as any;
    const series = (option.series as any[])[0];
    const tooltip = option.tooltip as any;

    expect(axis.name).toBe('相对均值（百分点）');
    expect(axis.min).toBeLessThan(0);
    expect(axis.max).toBeGreaterThan(0);
    expect(series.data).toEqual([-0.5, 0.7]);
    expect(series.markLine.data).toEqual([{ yAxis: 0 }]);
    expect(tooltip.formatter([{ dataIndex: 1 }])).toContain('NMI：14.10%');
    expect(tooltip.formatter([{ dataIndex: 1 }])).toContain('相对均值：+0.70 个百分点');
  });
});

describe('buildConvergenceOption', () => {
  it('reserves enough top space for the objective axis name and highest tick', () => {
    const convergenceResult = {
      convergence: {
        runs: [
          {
            run: 1,
            points: [
              { iteration: 1, objective: 5_600_000_000 },
              { iteration: 2, objective: 1_300_000_000 },
            ],
          },
        ],
      },
    } as AnalysisResult;
    const option = buildConvergenceOption(convergenceResult, 1);
    const grid = option.grid as any;
    const yAxis = option.yAxis as any;

    expect(grid.top).toBe(40);
    expect(yAxis.name).toBe('目标函数');
    expect(yAxis.nameLocation).toBe('end');
    expect(yAxis.nameGap).toBe(10);
    expect(yAxis.nameTextStyle).toMatchObject({
      align: 'left',
      padding: [0, 0, 4, 0],
    });
  });

  it('supports relative and logarithmic views without changing raw objectives', () => {
    const convergenceResult = {
      convergence: {
        runs: [
          {
            run: 1,
            points: [
              { iteration: 1, objective: 100 },
              { iteration: 2, objective: 25 },
              { iteration: 3, objective: 5 },
            ],
          },
        ],
      },
    } as AnalysisResult;
    const relative = buildConvergenceOption(convergenceResult, 1, 'relative');
    const logarithmic = buildConvergenceOption(convergenceResult, 1, 'log');

    expect(getConvergenceRelativeValue(25, 100)).toBe(25);
    expect((relative.series as any[])[0].data).toEqual([100, 25, 5]);
    expect((relative.yAxis as any).name).toBe('相对初始值');
    expect((relative.series as any[])[0].markLine.data).toEqual([{ yAxis: 100 }]);
    expect((logarithmic.yAxis as any).type).toBe('log');
    expect((logarithmic.series as any[])[0].data).toEqual([100, 25, 5]);
  });
});

describe('buildKernelRunsOption', () => {
  const kernelResult = {
    kernelWeights: {
      items: [
        { key: 'rbf_sigma_squared', mean: 0.5, std: 0.01, representative: 0.5 },
        { key: 'linear', mean: 0.01, std: 0.001, representative: 0.01 },
      ],
      runs: [
        { run: 1, values: [0.49, 0.009] },
        { run: 2, values: [0.5, 0.01] },
        { run: 3, values: [0.51, 0.011] },
      ],
    },
  } as AnalysisResult;

  it('magnifies each kernel against its own mean in relative mode', () => {
    const option = buildKernelRunsOption(kernelResult, 'relative');
    const series = option.series as any[];
    const yAxis = option.yAxis as any;

    expect(series[0].data).toEqual([-2, 0, 2]);
    expect(series[1].data).toEqual([-10, 0, 10]);
    expect(series[0].markLine.data).toEqual([{ yAxis: 0 }]);
    expect(yAxis.scale).toBe(true);
    expect(yAxis.axisLabel.formatter).toBe('{value}%');
  });

  it('keeps original alpha values and exposes both scales in the tooltip', () => {
    const option = buildKernelRunsOption(kernelResult, 'absolute');
    const series = option.series as any[];
    const tooltip = option.tooltip as any;
    const text = tooltip.formatter(series.map((item, seriesIndex) => ({
      dataIndex: 0,
      seriesIndex,
      seriesName: item.name,
      marker: '',
    })));

    expect(series[0].data).toEqual([0.49, 0.5, 0.51]);
    expect(series[1].data).toEqual([0.009, 0.01, 0.011]);
    expect(text).toContain('第 1 轮');
    expect(text).toContain('0.490000');
    expect(text).toContain('相对均值 -2.000%');
  });

  it('handles zero and missing baselines without generating infinite values', () => {
    expect(getKernelRelativeChange(0, 0, [0, 0])).toBe(0);
    expect(getKernelRelativeChange(0.1, 0, [0, 0.1])).toBeNull();
    expect(getKernelRelativeChange(null, 0.2, [null, 0.2])).toBeNull();
  });
});

describe('matrix scale hover interaction', () => {
  it('maps matrix values to a bounded legend position', () => {
    expect(getMatrixScalePosition(0, 0, 1)).toBe(0);
    expect(getMatrixScalePosition(0.5, 0, 1)).toBe(50);
    expect(getMatrixScalePosition(1, 0, 1)).toBe(100);
    expect(getMatrixScalePosition(-1, 0, 1)).toBe(0);
    expect(getMatrixScalePosition(2, 0, 1)).toBe(100);
    expect(getMatrixScalePosition(0.2, 0.2, 0.2)).toBe(50);
  });

  it('only reads finite values from heatmap cells', () => {
    expect(getHeatmapValue({ seriesType: 'heatmap', value: [4, 7, 0.2673] })).toBe(0.2673);
    expect(getHeatmapValue({ seriesType: 'scatter', value: [4, 7, 0.2673] })).toBeNull();
    expect(getHeatmapValue({ seriesType: 'heatmap', value: [4, 7, Number.NaN] })).toBeNull();
  });
});
