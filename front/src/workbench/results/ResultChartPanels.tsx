import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { Activity } from 'lucide-react';
import { WorkbenchSectionHeader, WorkbenchStatus } from '../WorkbenchUi';
import type { AnalysisResult, MatrixPreview } from './types';
import { formatNumber } from './resultPresentation';

type PanelProps = {
  compact?: boolean;
  actions?: ReactNode;
};

function ResultPanelEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="result-panel-empty" role="status">
      <Activity size={19} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

type HeatmapValueChangeHandler = (value: number | null) => void;

export function getMatrixScalePosition(value: number, minimum: number, maximum: number) {
  if (![value, minimum, maximum].every(Number.isFinite)) return 0;
  if (maximum <= minimum) return 50;
  return Math.min(100, Math.max(0, ((value - minimum) / (maximum - minimum)) * 100));
}

export function getHeatmapValue(params: unknown) {
  if (!params || typeof params !== 'object') return null;
  const event = params as { seriesType?: string; value?: unknown };
  if (event.seriesType !== 'heatmap' || !Array.isArray(event.value)) return null;
  const value = Number(event.value[2]);
  return Number.isFinite(value) ? value : null;
}

// 所有结果图表统一使用 SVG 渲染。组件卸载时同步销毁实例和交互监听器，避免切换结果页面后残留状态。
export function useResultChart(
  option: EChartsOption,
  onHeatmapValueChange?: HeatmapValueChangeHandler,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const heatmapValueHandlerRef = useRef(onHeatmapValueChange);

  useEffect(() => {
    heatmapValueHandlerRef.current = onHeatmapValueChange;
  }, [onHeatmapValueChange]);

  useEffect(() => {
    if (!ref.current || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) {
      return undefined;
    }

    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chart.setOption(option, { notMerge: true });
    const resize = () => chart.resize();
    const handleMouseOver = (params: unknown) => {
      const value = getHeatmapValue(params);
      if (value !== null) heatmapValueHandlerRef.current?.(value);
    };
    const handleMouseOut = (params: unknown) => {
      if (getHeatmapValue(params) !== null) heatmapValueHandlerRef.current?.(null);
    };
    const handleGlobalOut = () => heatmapValueHandlerRef.current?.(null);

    heatmapValueHandlerRef.current?.(null);
    chart.on('mouseover', handleMouseOver);
    chart.on('mouseout', handleMouseOut);
    chart.getZr().on('globalout', handleGlobalOut);
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.off('mouseover', handleMouseOver);
      chart.off('mouseout', handleMouseOut);
      chart.getZr().off('globalout', handleGlobalOut);
      chart.dispose();
    };
  }, [option]);

  return ref;
}

export function buildMatrixOption(matrix: MatrixPreview, title: string): EChartsOption {
  const data = matrix.values.flatMap((row, rowIndex) =>
    row.map((value, columnIndex) => [columnIndex, rowIndex, value]),
  );

  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    tooltip: {
      formatter: (params: any) =>
        `${title}<br/>样本 ${matrix.rowIndices[params.value[1]]} / ${matrix.columnIndices[params.value[0]]}<br/>${formatNumber(params.value[2], 4)}`,
    },
    grid: { top: 12, right: 18, bottom: 32, left: 46 },
    xAxis: {
      type: 'category',
      data: matrix.columnIndices.map(String),
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#59677d' },
    },
    yAxis: {
      type: 'category',
      data: matrix.rowIndices.map(String),
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#59677d' },
    },
    visualMap: {
      show: false,
      min: matrix.stats.min,
      max: matrix.stats.max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#edf4fa', '#78a9d4', '#1c5f91'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        emphasis: { itemStyle: { borderColor: '#173d5e', borderWidth: 1 } },
      },
    ],
  };
}

export function MatrixScaleLegend({
  matrix,
  compact = false,
  activeValue = null,
}: {
  matrix: MatrixPreview;
  compact?: boolean;
  activeValue?: number | null;
}) {
  const minimum = formatNumber(matrix.stats.min, 4);
  const maximum = formatNumber(matrix.stats.max, 4);
  const hasActiveValue = activeValue !== null && Number.isFinite(activeValue);
  const position = hasActiveValue
    ? getMatrixScalePosition(activeValue, matrix.stats.min, matrix.stats.max)
    : 50;
  const alignment = position <= 12 ? ' is-start' : position >= 88 ? ' is-end' : '';
  const activeLabel = hasActiveValue ? formatNumber(activeValue, 4) : '';

  return (
    <div
      className={`result-matrix-scale${compact ? ' is-compact' : ''}`}
      role="img"
      aria-label={`矩阵色阶，最小值 ${minimum}，最大值 ${maximum}${hasActiveValue ? `，当前值 ${activeLabel}` : ''}`}
    >
      <span className="result-matrix-scale-bound is-minimum">{minimum}</span>
      <span className="result-matrix-scale-track" aria-hidden="true">
        <span
          className={`result-matrix-scale-indicator${hasActiveValue ? ' is-active' : ''}${alignment}`}
          style={{ left: `${position}%` }}
        >
          <output>{activeLabel}</output>
          <i />
        </span>
      </span>
      <span className="result-matrix-scale-bound">{maximum}</span>
    </div>
  );
}

export function buildWeightsOption(result: AnalysisResult): EChartsOption {
  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => formatNumber(Number(value), 4),
    },
    grid: { top: 18, right: 18, bottom: 44, left: 48 },
    xAxis: {
      type: 'category',
      data: result.kernelWeights.items.map((item) => item.key.replace(/_/g, ' ')),
      axisLabel: { interval: 0, rotate: 18, color: '#59677d', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#59677d' },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    series: [
      {
        type: 'bar',
        data: result.kernelWeights.items.map((item) => item.mean),
        barWidth: 28,
        itemStyle: { color: '#2d769f', borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

export function buildConvergenceOption(result: AnalysisResult, run: number): EChartsOption {
  const current = result.convergence.runs.find((item) => item.run === run)
    ?? result.convergence.runs[0];

  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => formatNumber(Number(value), 5),
    },
    grid: { top: 40, right: 18, bottom: 32, left: 72 },
    xAxis: {
      type: 'category',
      data: current?.points.map((point) => String(point.iteration)) ?? [],
      axisTick: { show: false },
      axisLabel: { color: '#59677d' },
    },
    yAxis: {
      type: 'value',
      name: '目标函数',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#59677d',
        align: 'left',
        padding: [0, 0, 4, 0],
      },
      axisLabel: {
        color: '#59677d',
        formatter: (value: number) => (value === 0 ? '0' : value.toExponential(1)),
      },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: current?.points.map((point) => point.objective) ?? [],
        lineStyle: { color: '#227e71', width: 3 },
        itemStyle: { color: '#227e71' },
        areaStyle: { color: 'rgba(34, 126, 113, 0.12)' },
      },
    ],
  };
}

export function buildScatterOption(result: AnalysisResult): EChartsOption {
  const groups = new Map<string, Array<[number, number, number]>>();
  result.preview.scatter.points.forEach((point) => {
    const items = groups.get(point.predictedLabel) ?? [];
    items.push([point.x, point.y, point.sampleIndex]);
    groups.set(point.predictedLabel, items);
  });

  const colors = ['#2476a4', '#27796e', '#c47a29', '#9a4e77', '#6559a7'];
  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    tooltip: {
      formatter: (params: any) => `样本 ${params.value[2]}<br/>预测簇 ${params.seriesName}`,
    },
    grid: { top: 18, right: 20, bottom: 38, left: 48 },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#59677d' },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#59677d' },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    series: [...groups.entries()].map(([label, data], index) => ({
      type: 'scatter',
      name: `簇 ${label}`,
      data,
      symbolSize: 7,
      itemStyle: { color: colors[index % colors.length], opacity: 0.76 },
    })),
  };
}

export function buildMetricRunsOption(result: AnalysisResult): EChartsOption {
  const metricKeys = ['acc', 'nmi', 'ari', 'f1'] as const;
  const colors = ['#23865f', '#2f7de1', '#14796f', '#59677d'];
  const metricColors = Object.fromEntries(metricKeys.map((key, index) => [key === 'f1' ? 'F1-score' : key.toUpperCase(), colors[index]]));

  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    color: colors,
    tooltip: {
      trigger: 'axis',
      confine: true,
      borderWidth: 0,
      padding: [8, 10],
      extraCssText: 'border-radius: 6px; box-shadow: 0 4px 8px rgba(35, 55, 78, 0.18);',
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params];
        const run = items[0]?.axisValue ?? '—';
        const cells = items.map((item: any) => {
          const color = metricColors[item.seriesName] ?? '#59677d';
          return `<span style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:88px;"><span style="display:flex;align-items:center;gap:6px;color:#59677d;"><i style="width:7px;height:7px;border-radius:50%;background:${color};"></i>${item.seriesName}</span><strong style="color:#2f4054;font-variant-numeric:tabular-nums;">${Number(item.value).toFixed(2)}%</strong></span>`;
        }).join('');
        return `<div style="min-width:210px;"><div style="margin-bottom:7px;color:#34495d;font-size:11px;font-weight:700;">第 ${run} 轮</div><div style="display:grid;grid-template-columns:repeat(2,minmax(88px,1fr));gap:6px 14px;font-size:10px;line-height:1.35;">${cells}</div></div>`;
      },
      position: (point, _params, _dom, _rect, size) => {
        const [contentWidth, contentHeight] = size.contentSize;
        const [viewWidth, viewHeight] = size.viewSize;
        const preferredX = point[0] + contentWidth + 12 <= viewWidth ? point[0] + 12 : point[0] - contentWidth - 12;
        const maxX = Math.max(8, viewWidth - contentWidth - 8);
        const maxY = Math.max(8, viewHeight - contentHeight - 8);
        const minY = Math.min(36, maxY);
        return [
          Math.max(8, Math.min(preferredX, maxX)),
          Math.max(minY, Math.min(point[1] - contentHeight / 2, maxY)),
        ];
      },
    },
    legend: { top: 0, right: 12, textStyle: { color: '#59677d', fontSize: 11 } },
    grid: { top: 40, right: 22, bottom: 44, left: 52 },
    xAxis: {
      type: 'category',
      name: '运行轮次',
      nameLocation: 'middle',
      nameGap: 28,
      data: result.metrics.runs.map((item) => String(item.run)),
      axisTick: { show: false },
      axisLabel: { color: '#59677d' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#59677d', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    series: metricKeys.map((key) => ({
      type: 'line',
      name: key === 'f1' ? 'F1-score' : key.toUpperCase(),
      data: result.metrics.runs.map((item) => Number((item[key] * 100).toFixed(4))),
      symbolSize: 6,
      lineStyle: { width: 2 },
      emphasis: { focus: 'series' },
    })),
  };
}

export type KernelRunsMode = 'relative' | 'absolute';

const kernelRunLabels: Record<string, string> = {
  rbf_sigma_squared: 'K1 · RBF / sigma²',
  linear: 'K2 · Linear',
  rbf_sigma: 'K3 · RBF / sigma',
  polynomial_2: 'K4 · Polynomial / 2',
};

export function getKernelRelativeChange(
  value: number | null | undefined,
  mean: number,
  seriesValues: Array<number | null>,
) {
  if (value === null || value === undefined || !Number.isFinite(value) || !Number.isFinite(mean)) return null;
  if (mean !== 0) return Number((((value - mean) / Math.abs(mean)) * 100).toFixed(6));
  return seriesValues.every((current) => current !== null && Math.abs(current) <= Number.EPSILON) ? 0 : null;
}

export function buildKernelRunsOption(result: AnalysisResult, mode: KernelRunsMode = 'absolute'): EChartsOption {
  const keys = result.kernelWeights.items.map((item) => item.key);
  const colors = ['#2f7de1', '#23865f', '#c97a17', '#7967a8'];
  const absoluteSeries = keys.map((_, index) => result.kernelWeights.runs.map((run) => {
    const value = run.values[index];
    return value === undefined || !Number.isFinite(value) ? null : value;
  }));
  const relativeSeries = keys.map((_, index) => {
    const mean = result.kernelWeights.items[index]?.mean;
    return absoluteSeries[index].map((value) => getKernelRelativeChange(value, mean, absoluteSeries[index]));
  });

  return {
    animationDuration: 240,
    animationDurationUpdate: 220,
    color: colors,
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const first = items[0];
        const dataIndex = Number(first?.dataIndex ?? 0);
        const run = result.kernelWeights.runs[dataIndex];
        const rows = items.map((item) => {
          const seriesIndex = Number(item.seriesIndex ?? 0);
          const absolute = absoluteSeries[seriesIndex]?.[dataIndex];
          const relative = relativeSeries[seriesIndex]?.[dataIndex];
          const relativeText = relative === null || relative === undefined ? '—' : `${formatNumber(relative, 3)}%`;
          const primary = mode === 'relative' ? relativeText : formatNumber(absolute, 6);
          const secondary = mode === 'relative' ? `alpha ${formatNumber(absolute, 6)}` : `相对均值 ${relativeText}`;
          return `${item.marker ?? ''}${item.seriesName}: <strong>${primary}</strong> <span style="color:#758397">${secondary}</span>`;
        });
        return [`第 ${run?.run ?? '—'} 轮`, ...rows].join('<br/>');
      },
    },
    legend: { top: 0, right: 12, textStyle: { color: '#59677d', fontSize: 10 } },
    grid: { top: 44, right: 22, bottom: 44, left: 58 },
    xAxis: {
      type: 'category',
      name: '运行轮次',
      nameLocation: 'middle',
      nameGap: 28,
      data: result.kernelWeights.runs.map((item) => String(item.run)),
      axisTick: { show: false },
      axisLabel: { color: '#59677d' },
    },
    yAxis: {
      type: 'value',
      name: mode === 'relative' ? '相对均值变化' : '原始 alpha',
      nameTextStyle: { color: '#738195', fontSize: 10, padding: [0, 0, 4, 0] },
      scale: mode === 'relative',
      axisLabel: {
        color: '#59677d',
        formatter: mode === 'relative' ? '{value}%' : undefined,
      },
      splitLine: { lineStyle: { color: '#e4eaf0' } },
    },
    series: keys.map((key, index) => ({
      type: 'line',
      name: kernelRunLabels[key] ?? key.replace(/_/g, ' '),
      data: mode === 'relative' ? relativeSeries[index] : absoluteSeries[index],
      connectNulls: false,
      showSymbol: true,
      smooth: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2.2 },
      emphasis: { focus: 'series' },
      ...(mode === 'relative' && index === 0 ? {
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#95a3b3', type: 'dashed', width: 1 },
          label: { show: true, formatter: '均值基线', color: '#758397', fontSize: 9 },
          data: [{ yAxis: 0 }],
        },
      } : {}),
    })),
  };
}

export function OptionChartPanel({
  title,
  meta,
  option,
  hasData,
  emptyTitle,
  emptyDetail,
  actions,
  compact = false,
}: {
  title: string;
  meta: string;
  option: EChartsOption;
  hasData: boolean;
  emptyTitle: string;
  emptyDetail: string;
} & PanelProps) {
  const ref = useResultChart(option);

  return (
    <section className={`panel result-chart-panel${compact ? ' is-compact' : ''}`}>
      <WorkbenchSectionHeader title={title} meta={meta} actions={actions} />
      {hasData ? (
        <div className="result-chart" ref={ref} />
      ) : (
        <ResultPanelEmpty title={emptyTitle} detail={emptyDetail} />
      )}
    </section>
  );
}

export function MatrixPanel({
  matrix,
  title,
  description,
  compact = false,
  actions,
}: {
  matrix: MatrixPreview;
  title: string;
  description: string;
} & PanelProps) {
  const option = useMemo(() => buildMatrixOption(matrix, title), [matrix, title]);
  const [activeValue, setActiveValue] = useState<number | null>(null);
  const ref = useResultChart(option, setActiveValue);
  const hasData = matrix.values.length > 0 && matrix.values.some((row) => row.length > 0);

  return (
    <section className={`panel result-chart-panel${compact ? ' is-compact' : ''}`}>
      <WorkbenchSectionHeader
        title={title}
        meta={description}
        actions={
          <div className="result-panel-actions">
            <WorkbenchStatus tone="info">{matrix.shape[0]} × {matrix.shape[1]}</WorkbenchStatus>
            {actions}
          </div>
        }
      />
      {hasData ? (
        <>
          <div className="result-chart" ref={ref} />
          <MatrixScaleLegend matrix={matrix} compact={compact} activeValue={activeValue} />
        </>
      ) : (
        <ResultPanelEmpty title="矩阵预览不可用" detail="结果中没有可展示的矩阵采样数据。" />
      )}
      <div className="result-stat-line">
        <span>均值 {formatNumber(matrix.stats.mean, 4)}</span>
        <span>标准差 {formatNumber(matrix.stats.std, 4)}</span>
        <span>对称误差 {formatNumber(matrix.stats.symmetryMaxError, 6)}</span>
      </div>
    </section>
  );
}

export function WeightPanel({ result, compact = false, actions }: { result: AnalysisResult } & PanelProps) {
  const option = useMemo(() => buildWeightsOption(result), [result]);
  const ref = useResultChart(option);
  const sum = result.kernelWeights.items.reduce((total, item) => total + item.mean, 0);
  const hasData = result.kernelWeights.items.length > 0;

  return (
    <section className={`panel result-chart-panel${compact ? ' is-compact' : ''}`}>
      <WorkbenchSectionHeader
        title="核权重贡献"
        meta="原始 alpha 的重复实验均值，不进行前端归一化"
        actions={
          <div className="result-panel-actions">
            {hasData ? (
              <WorkbenchStatus tone={Math.abs(sum - 1) < 0.01 ? 'success' : 'warning'}>
                总和 {formatNumber(sum, 4)}
              </WorkbenchStatus>
            ) : null}
            {actions}
          </div>
        }
      />
      {hasData ? (
        <>
          <div className="result-chart" ref={ref} />
          <div className="result-kernel-list">
            {result.kernelWeights.items.map((item) => (
              <div key={item.key}>
                <span>{item.key}</span>
                <strong>{formatNumber(item.mean, 5)}</strong>
                <small>std {formatNumber(item.std, 5)}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <ResultPanelEmpty title="暂无核权重" detail="当前结果没有记录可展示的核权重。" />
      )}
    </section>
  );
}

export function ConvergencePanel({
  result,
  compact = false,
  actions,
}: { result: AnalysisResult } & PanelProps) {
  const [run, setRun] = useState(result.convergence.representativeRun);
  useEffect(() => setRun(result.convergence.representativeRun), [result.convergence.representativeRun]);
  const current = result.convergence.runs.find((item) => item.run === run)
    ?? result.convergence.runs[0];
  const option = useMemo(() => buildConvergenceOption(result, run), [result, run]);
  const ref = useResultChart(option);
  const finalPoint = current?.points[current.points.length - 1];
  const hasData = Boolean(current?.points.length);

  return (
    <section className={`panel result-chart-panel${compact ? ' is-compact' : ''}`}>
      <WorkbenchSectionHeader
        title="优化收敛"
        meta={
          !current
            ? '当前结果没有收敛轨迹'
            : current.converged
              ? '达到求解器收敛阈值'
              : '达到任务设置的最大迭代次数'
        }
        actions={
          <div className="result-panel-actions">
            {result.convergence.runs.length ? (
              <select
                className="result-run-select"
                value={current?.run ?? ''}
                onChange={(event) => setRun(Number(event.target.value))}
                aria-label="选择运行轮次"
              >
                {result.convergence.runs.map((item) => (
                  <option key={item.run} value={item.run}>第 {item.run} 轮</option>
                ))}
              </select>
            ) : null}
            {actions}
          </div>
        }
      />
      {hasData ? (
        <div className="result-chart" ref={ref} />
      ) : (
        <ResultPanelEmpty title="暂无收敛轨迹" detail="该任务未返回可绘制的迭代目标函数。" />
      )}
      {current ? (
        <div className="result-stat-line">
          <span>最终目标函数 {formatNumber(finalPoint?.objective, 5)}</span>
          <span>{current.converged ? '提前收敛' : '达到迭代上限'}</span>
        </div>
      ) : null}
    </section>
  );
}

export function ScatterPanel({
  result,
  compact = false,
  actions,
}: { result: AnalysisResult } & PanelProps) {
  const option = useMemo(() => buildScatterOption(result), [result]);
  const ref = useResultChart(option);
  const scatter = result.preview.scatter;
  const hasData = scatter.points.length > 0;
  const meta = scatter.sampled
    ? `为保证可读性，展示 ${scatter.points.length}/${scatter.totalCount} 个样本`
    : `展示全部 ${scatter.totalCount} 个样本`;

  return (
    <section className={`panel result-chart-panel${compact ? ' is-compact' : ''}`}>
      <WorkbenchSectionHeader title="代表轮次聚类分布" meta={meta} actions={actions} />
      {hasData ? (
        <div className="result-chart" ref={ref} />
      ) : (
        <ResultPanelEmpty title="暂无聚类分布" detail="当前结果没有可展示的二维投影点。" />
      )}
    </section>
  );
}
