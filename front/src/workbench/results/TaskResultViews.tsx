import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Gauge,
  Info,
  RefreshCw,
  Target,
  XCircle,
} from 'lucide-react';
import { retryTask } from '../../api/tasks';
import { SelectField } from '../../components/SelectField';
import {
  WorkbenchNotice,
  WorkbenchPageHeader,
  WorkbenchSectionHeader,
  WorkbenchStatus,
} from '../WorkbenchUi';
import { getTaskRunProgress } from '../tasks/taskStatus';
import { AnalysisOverviewPage } from './AnalysisOverviewPage';
import {
  CaResultPage,
  ExportResultPage,
  KernelResultPage,
  MklResultPage,
  ReportResultPage,
  ResultsAnalysisPage,
  VisualizationResultPage,
} from './ResultDetailPages';
import {
  buildEvaluationTrendOption,
  type EvaluationMetricKey,
  type EvaluationTrendMode,
  useResultChart,
} from './ResultChartPanels';
import { MetricStrip, ReadyHeader, ResultBackButton } from './ResultPageShared';
import {
  buildEvaluationCsv,
  deriveEvaluationSummary,
  evaluationMetricKeys,
} from './evaluationPresentation';
import {
  downloadTextFile,
  formatNumber,
  formatPercent,
  metricLabels,
} from './resultPresentation';
import { TaskLogsPage } from './TaskLogsPage';
import type { TaskResultResource } from './types';

type Props = {
  section: string;
  resource: TaskResultResource;
};

function ResultState({ resource }: { resource: TaskResultResource }) {
  const navigate = useNavigate();
  const envelope = resource.envelope;
  const task = envelope?.task;
  const state = envelope?.state;

  const retry = async () => {
    if (!task) return;
    await retryTask(task.id);
    resource.refresh();
  };

  let title = '正在加载分析结果';
  let detail = '正在读取任务、结果和可视化预览。';
  let tone: 'info' | 'warning' | 'error' | 'success' = 'info';

  if (resource.error) {
    title = '结果加载失败';
    detail = resource.error;
    tone = 'error';
  }
  if (state === 'empty') {
    title = '还没有可用的分析结果';
    detail = '请先创建并完成一个带 y 标签的数据集分析任务。';
  }
  if (state === 'draft') {
    title = '任务尚未启动';
    detail = '启动任务后，这里会显示计算过程和结果。';
  }
  if (state === 'queued') {
    title = '任务正在排队';
    detail = `队列位置 ${task?.queuePosition ?? '—'}，轮到后会自动开始。`;
    tone = 'warning';
  }
  if (state === 'running' && task) {
    const run = getTaskRunProgress(task);
    title = 'OMELET 正在运行';
    detail = `第 ${run.current}/${run.total} 轮，迭代 ${task.currentIter ?? 0}/${task.maxIter ?? 0}，${Math.round(task.progress ?? 0)}%。`;
    tone = 'warning';
  }
  if (state === 'failed') {
    title = '任务执行失败';
    detail = task?.errorMessage || '算法子进程未能完成，请查看日志后重试。';
    tone = 'error';
  }
  if (state === 'cancelled') {
    title = '任务已取消';
    detail = '该任务没有完整结果，可以调整参数后重新执行。';
    tone = 'warning';
  }
  if (state === 'legacy') {
    title = '这是旧版演示结果';
    detail = '旧结果缺少算法产物，重新执行任务后才能查看可信分析。';
    tone = 'warning';
  }

  return (
    <section className="soft-page result-state-page" aria-live="polite">
      <WorkbenchPageHeader
        icon={Activity}
        title="分析结果"
        context={task ? `任务 #${task.id} · ${task.datasetName} · ${task.mode}` : '结果上下文'}
        status={<WorkbenchStatus tone={tone} pulse={state === 'running'}>{title}</WorkbenchStatus>}
        backAction={<ResultBackButton taskId={task?.id} />}
      />
      <section className="panel result-state-panel">
        <WorkbenchNotice tone={tone} icon={tone === 'error' ? XCircle : Activity} title={title} detail={detail} />
        <div className="result-state-actions">
          {(state === 'failed' || state === 'cancelled' || state === 'legacy') && task ? (
            <button type="button" className="btn btn-primary" onClick={() => void retry()}>重新执行</button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/workbench/tasks')}>
            {state === 'empty' ? '创建任务' : '打开任务中心'}
          </button>
          {resource.error ? (
            <button type="button" className="btn btn-secondary" onClick={resource.refresh}>
              <RefreshCw size={15} />重试加载
            </button>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function EvaluationPage({ resource }: { resource: TaskResultResource }) {
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;
  const rows = result.metrics.runs;
  const [focusMetric, setFocusMetric] = useState<EvaluationMetricKey>('acc');
  const [trendMode, setTrendMode] = useState<EvaluationTrendMode>('absolute');
  const summary = useMemo(() => deriveEvaluationSummary(result), [result]);
  const trendOption = useMemo(
    () => buildEvaluationTrendOption(result, focusMetric, trendMode),
    [focusMetric, result, trendMode],
  );
  const trendRef = useResultChart(trendOption);
  const focusInsight = summary.metrics.find((metric) => metric.key === focusMetric)
    ?? summary.metrics[0];
  const accInsight = summary.metrics.find((metric) => metric.key === 'acc');
  const representativeRun = result.preview.summary.representativeRun;
  const overallTone = summary.runCount < 2
    ? 'neutral'
    : summary.metrics.some((metric) => metric.stabilityTone === 'warning')
      ? 'warning'
      : 'success';
  const overallLabel = summary.runCount < 2
    ? '数据不足'
    : overallTone === 'success'
      ? '整体波动较低'
      : '存在波动项';

  function exportMetrics() {
    downloadTextFile(
      `task-${task.id}-performance.csv`,
      buildEvaluationCsv(result),
      'text/csv;charset=utf-8',
    );
  }

  return (
    <section className="soft-page result-evaluation-page">
      <ReadyHeader
        title="性能评估"
        icon={ClipboardCheck}
        resource={resource}
        actions={
          <div className="result-evaluation-header-actions">
            <button type="button" className="btn btn-secondary" onClick={resource.refresh}>
              <RefreshCw size={15} aria-hidden="true" />
              刷新
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!rows.length}
              onClick={exportMetrics}
            >
              <Download size={15} aria-hidden="true" />
              导出 CSV
            </button>
          </div>
        }
      />
      <MetricStrip result={result} />

      {rows.length ? (
        <>
          <section className="panel result-evaluation-conclusion" aria-label="评估结论">
            <WorkbenchSectionHeader
              title="评估结论"
              meta="基于当前重复实验的汇总结果，未引入外部方法基线"
              actions={<WorkbenchStatus tone={overallTone}>{overallLabel}</WorkbenchStatus>}
            />
            <div className="result-evaluation-conclusion-body">
              <div className="result-evaluation-conclusion-copy">
                <span className="result-evaluation-conclusion-state">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {summary.runCount} 轮重复实验已完成
                </span>
                <strong>四项聚类指标均已完成跨轮次统计</strong>
                <p>
                  ACC 均值为 {formatPercent(accInsight?.mean)}，最高值出现在第 {accInsight?.bestRun?.run ?? '—'} 轮。
                  {summary.mostStableMetric
                    ? `${summary.mostStableMetric.label} 的相对波动最低，可作为本次结果稳定性的主要参考。`
                    : '当前缺少足够轮次，暂时无法判断跨轮次稳定性。'}
                </p>
              </div>
              <dl className="result-evaluation-conclusion-facts">
                <div>
                  <dt><Target size={14} aria-hidden="true" />代表轮次</dt>
                  <dd>第 {representativeRun} 轮</dd>
                  <small>用于结果预览与后续分析</small>
                </div>
                <div>
                  <dt><Clock3 size={14} aria-hidden="true" />平均耗时</dt>
                  <dd>{formatNumber(summary.meanRuntime, 2)} s</dd>
                  <small>累计 {formatNumber(summary.totalRuntime, 2)} s</small>
                </div>
                <div>
                  <dt><Gauge size={14} aria-hidden="true" />波动最低</dt>
                  <dd>{summary.mostStableMetric?.label ?? '—'}</dd>
                  <small>变异系数 {summary.mostStableMetric?.variationRatio == null ? '—' : formatPercent(summary.mostStableMetric.variationRatio)}</small>
                </div>
                <div>
                  <dt><BarChart3 size={14} aria-hidden="true" />波动最高</dt>
                  <dd>{summary.mostVariableMetric?.label ?? '—'}</dd>
                  <small>变异系数 {summary.mostVariableMetric?.variationRatio == null ? '—' : formatPercent(summary.mostVariableMetric.variationRatio)}</small>
                </div>
              </dl>
            </div>
          </section>

          <div className="result-evaluation-analysis-grid">
            <section className="panel result-evaluation-trend-panel" aria-label="指标趋势">
              <WorkbenchSectionHeader
                title="指标趋势"
                meta={trendMode === 'relative'
                  ? `${summary.runCount} 个观测点 · 以指标均值为 0 基线显示百分点变化`
                  : `${summary.runCount} 个观测点 · 纵轴按 ${metricLabels[focusMetric]} 区间自动缩放`}
                actions={
                  <div className="result-evaluation-trend-controls">
                    <div className="result-evaluation-trend-mode" role="group" aria-label="趋势显示方式">
                      <button
                        type="button"
                        aria-pressed={trendMode === 'absolute'}
                        onClick={() => setTrendMode('absolute')}
                      >
                        原始值
                      </button>
                      <button
                        type="button"
                        aria-pressed={trendMode === 'relative'}
                        onClick={() => setTrendMode('relative')}
                      >
                        相对均值
                      </button>
                    </div>
                    <SelectField
                      value={focusMetric}
                      options={evaluationMetricKeys.map((key) => ({ value: key, label: metricLabels[key] }))}
                      ariaLabel="突出评估指标"
                      className="result-evaluation-metric-select"
                      size="sm"
                      onChange={(value) => setFocusMetric(value as EvaluationMetricKey)}
                    />
                  </div>
                }
              />
              <div className="result-evaluation-trend-summary" aria-label={`${metricLabels[focusMetric]}统计摘要`}>
                <span>均值 <strong>{formatPercent(focusInsight?.mean)}</strong></span>
                <span>标准差 <strong>{formatPercent(focusInsight?.std)}</strong></span>
                <span>最佳轮次 <strong>第 {focusInsight?.bestRun?.run ?? '—'} 轮</strong></span>
              </div>
              <div
                className="result-evaluation-trend-chart"
                ref={trendRef}
                role="img"
                aria-label={`${metricLabels[focusMetric]}${trendMode === 'relative' ? '相对均值变化趋势' : '跨轮次变化趋势'}`}
              />
            </section>

            <section className="panel result-evaluation-stability" aria-label="稳定性诊断">
              <WorkbenchSectionHeader
                title="稳定性诊断"
                meta="变异系数 = 标准差 / 指标均值"
                actions={<WorkbenchStatus tone={overallTone}>{overallLabel}</WorkbenchStatus>}
              />
              <div className="result-evaluation-stability-list">
                {summary.metrics.map((metric) => (
                  <div className={`result-evaluation-stability-row is-${metric.key}`} key={metric.key}>
                    <div>
                      <strong>{metric.label}</strong>
                      <small>标准差 {formatPercent(metric.std)}</small>
                    </div>
                    <span className={`result-evaluation-stability-status is-${metric.stabilityTone}`}>
                      {metric.stabilityLabel}
                    </span>
                    <b>{metric.variationRatio == null ? '—' : formatPercent(metric.variationRatio)}</b>
                  </div>
                ))}
              </div>
              <div className="result-evaluation-runtime-band">
                <Clock3 size={16} aria-hidden="true" />
                <div>
                  <span>单轮耗时区间</span>
                  <strong>{formatNumber(summary.minimumRuntime, 2)}–{formatNumber(summary.maximumRuntime, 2)} s</strong>
                </div>
                <small>平均 {formatNumber(summary.meanRuntime, 2)} s</small>
              </div>
              <div className="result-evaluation-method-note">
                <Info size={15} aria-hidden="true" />
                <span>稳定性标签仅用于页面内快速筛查，正式结论以标准差、区间和完整轮次明细为准。</span>
              </div>
            </section>
          </div>

          <section className="panel result-evaluation-distribution" aria-label="指标分布">
            <WorkbenchSectionHeader
              title="指标分布"
              meta="逐项核对均值、标准差、跨轮次区间与最高值轮次"
            />
            <div className="result-evaluation-distribution-list">
              {summary.metrics.map((metric) => (
                <div className={`result-evaluation-distribution-row is-${metric.key}`} key={metric.key}>
                  <div className="result-evaluation-distribution-name">
                    <strong>{metric.label}</strong>
                    <span className={`result-evaluation-stability-status is-${metric.stabilityTone}`}>
                      {metric.stabilityLabel}
                    </span>
                  </div>
                  <div className="result-evaluation-distribution-values">
                    <span>均值<strong>{formatPercent(metric.mean)}</strong></span>
                    <span>标准差<strong>{formatPercent(metric.std)}</strong></span>
                    <span>区间宽度<strong>{formatPercent(metric.spread)}</strong></span>
                  </div>
                  <div
                    className="result-evaluation-range"
                    role="img"
                    aria-label={`${metric.label}最小值${formatPercent(metric.min)}，均值${formatPercent(metric.mean)}，最大值${formatPercent(metric.max)}`}
                  >
                    <span>{formatPercent(metric.min)}</span>
                    <div className="result-evaluation-range-track" aria-hidden="true">
                      <i style={{ left: `${metric.meanPosition}%` }} />
                    </div>
                    <span>{formatPercent(metric.max)}</span>
                  </div>
                  <div className="result-evaluation-best-run">
                    <Award size={15} aria-hidden="true" />
                    <span>最高值<strong>第 {metric.bestRun?.run ?? '—'} 轮</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel result-evaluation-table-panel" aria-label="重复实验明细">
            <WorkbenchSectionHeader
              title="重复实验明细"
              meta={`${rows.length} 次运行 · 当前突出 ${metricLabels[focusMetric]} · 随机种子按任务参数派生`}
              actions={<WorkbenchStatus tone="info">完整记录</WorkbenchStatus>}
            />
            <div className="result-evaluation-table" role="table" aria-label="重复实验明细表">
              <div className="result-evaluation-table-row header" role="row">
                <span role="columnheader">轮次</span>
                <span role="columnheader">随机种子</span>
                {evaluationMetricKeys.map((key) => (
                  <span className={key === focusMetric ? 'is-focused' : ''} role="columnheader" key={key}>
                    {metricLabels[key]}
                  </span>
                ))}
                <span role="columnheader">耗时</span>
                <span role="columnheader">标记</span>
              </div>
              {rows.map((row) => {
                const isRepresentative = row.run === representativeRun;
                const isBest = row.run === focusInsight?.bestRun?.run;
                return (
                  <div
                    className={`result-evaluation-table-row${isBest ? ' is-best' : ''}${isRepresentative ? ' is-representative' : ''}`}
                    role="row"
                    key={row.run}
                  >
                    <strong role="cell">第 {row.run} 轮</strong>
                    <span role="cell">{row.seed}</span>
                    {evaluationMetricKeys.map((key) => (
                      <span className={key === focusMetric ? 'is-focused' : ''} role="cell" key={key}>
                        {formatPercent(row[key])}
                      </span>
                    ))}
                    <span role="cell">{formatNumber(row.runtimeSeconds, 2)} s</span>
                    <span className="result-evaluation-row-tags" role="cell">
                      {isBest ? <b className="is-best">最高 {metricLabels[focusMetric]}</b> : null}
                      {isRepresentative ? <b className="is-representative">代表轮次</b> : null}
                      {!isBest && !isRepresentative ? <small>常规轮次</small> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="panel result-evaluation-empty" role="status">
          <Activity size={20} aria-hidden="true" />
          <div>
            <strong>当前结果没有重复实验明细</strong>
            <span>汇总指标仍会保留；完成至少两轮运行后，趋势与稳定性诊断会自动出现。</span>
          </div>
        </section>
      )}

      <section className="panel result-evaluation-context" aria-label="评估口径">
        <WorkbenchSectionHeader
          title="评估口径"
          meta="当前任务的结果复核上下文"
        />
        <dl className="result-evaluation-context-grid">
          <div><dt>数据集</dt><dd>{task.datasetName}</dd></div>
          <div><dt>算法模式</dt><dd>{task.mode}</dd></div>
          <div><dt>样本数量</dt><dd>{result.preview.summary.sampleCount}</dd></div>
          <div><dt>真实类别</dt><dd>{result.preview.summary.classCount}</dd></div>
          <div><dt>基础聚类</dt><dd>{result.preview.summary.baseClusterCount}</dd></div>
          <div><dt>重复轮次</dt><dd>{summary.runCount}</dd></div>
          <div><dt>随机种子起点</dt><dd>{result.preview.summary.randomSeed}</dd></div>
          <div><dt>代表轮次</dt><dd>第 {representativeRun} 轮</dd></div>
          <div><dt>任务总耗时</dt><dd>{formatNumber(result.runtimeSeconds, 2)} s</dd></div>
          <div><dt>实验累计耗时</dt><dd>{formatNumber(summary.totalRuntime, 2)} s</dd></div>
        </dl>
      </section>
    </section>
  );
}

export function TaskResultViews({ section, resource }: Props) {
  const logTask = resource.envelope?.task;
  const isSelectedLogTask = logTask && (!resource.taskId || logTask.id === resource.taskId);
  if (!resource.error && section === 'logs' && isSelectedLogTask) {
    return <TaskLogsPage resource={resource} />;
  }

  if (
    resource.loading
    || resource.error
    || resource.envelope?.state !== 'ready'
    || !resource.envelope.result
    || !resource.envelope.task
  ) {
    return <ResultState resource={resource} />;
  }

  if (section === 'analysis') return <AnalysisOverviewPage resource={resource} />;
  if (section === 'ca-matrix') return <CaResultPage resource={resource} />;
  if (section === 'kernel-config') return <KernelResultPage resource={resource} />;
  if (section === 'mkl') return <MklResultPage resource={resource} />;
  if (section === 'evaluation') return <EvaluationPage resource={resource} />;
  if (section === 'visualization') return <VisualizationResultPage resource={resource} />;
  if (section === 'results') return <ResultsAnalysisPage resource={resource} />;
  if (section === 'export') return <ExportResultPage resource={resource} />;
  if (section === 'reports') return <ReportResultPage resource={resource} />;
  return <AnalysisOverviewPage resource={resource} />;
}
