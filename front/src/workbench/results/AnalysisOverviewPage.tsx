import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Images,
  LayoutDashboard,
  LayoutGrid,
  Network,
  RefreshCw,
  SlidersHorizontal,
  Target,
  type LucideIcon,
} from 'lucide-react';
import {
  WorkbenchMetricStrip,
  WorkbenchNotice,
  WorkbenchPageHeader,
  WorkbenchSectionHeader,
} from '../WorkbenchUi';
import {
  ConvergencePanel,
  MatrixPanel,
  ScatterPanel,
  WeightPanel,
} from './ResultChartPanels';
import {
  formatNumber,
  formatPercent,
  metricLabels,
  type MetricKey,
} from './resultPresentation';
import type { TaskResultResource } from './types';

type OverviewStage = {
  label: string;
  detail: string;
  status: string;
  complete: boolean;
  section: string;
  icon: LucideIcon;
};

function taskResultPath(section: string, taskId: number) {
  return `/workbench/${section}?taskId=${encodeURIComponent(taskId)}`;
}

export function AnalysisOverviewPage({ resource }: { resource: TaskResultResource }) {
  const navigate = useNavigate();
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;
  const summary = result.preview.summary;
  const representativeRun = result.convergence.runs.find(
    (item) => item.run === result.convergence.representativeRun,
  );

  // 总览只组合后端已经持久化的结果字段，不在浏览器端推断算法质量结论。
  const stages = useMemo<OverviewStage[]>(() => [
    {
      label: 'CA 矩阵',
      detail: `${result.preview.matrices.ca.shape[0]} × ${result.preview.matrices.ca.shape[1]}`,
      status: '已构建',
      complete: result.preview.matrices.ca.values.length > 0,
      section: 'ca-matrix',
      icon: LayoutGrid,
    },
    {
      label: '核函数',
      detail: `${result.kernelWeights.items.length} 个核函数`,
      status: result.kernelWeights.items.length ? '已计算' : '无权重',
      complete: result.kernelWeights.items.length > 0,
      section: 'kernel-config',
      icon: SlidersHorizontal,
    },
    {
      label: '多核学习',
      detail: representativeRun
        ? `代表轮次 ${representativeRun.points.length} 次迭代`
        : '暂无迭代轨迹',
      status: !representativeRun
        ? '无轨迹'
        : representativeRun.converged
          ? '已收敛'
          : '迭代结束',
      complete: Boolean(representativeRun),
      section: 'mkl',
      icon: Network,
    },
    {
      label: '性能评估',
      detail: `${result.metrics.runs.length} 轮重复实验`,
      status: result.metrics.runs.length ? '已汇总' : '无明细',
      complete: result.metrics.runs.length > 0,
      section: 'evaluation',
      icon: ClipboardCheck,
    },
    {
      label: '结果持久化',
      detail: `${result.artifacts.length} 项完整产物`,
      status: result.artifacts.length ? '可交付' : '无产物',
      complete: result.artifacts.length > 0,
      section: 'export',
      icon: CheckCircle2,
    },
  ], [representativeRun, result]);

  const recentRuns = useMemo(
    () => [...result.metrics.runs].sort((left, right) => right.run - left.run).slice(0, 5),
    [result.metrics.runs],
  );

  const metricIcons = [Target, Network, Boxes, ClipboardCheck];
  const metricTones = ['green', 'blue', 'teal', 'neutral'] as const;
  const followUpActions = [
    {
      label: '完整可视化',
      detail: `${result.preview.scatter.points.length} 个预览点`,
      section: 'visualization',
      icon: Images,
    },
    {
      label: '分析报告',
      detail: `任务 #${task.id}`,
      section: 'reports',
      icon: FileText,
    },
    {
      label: '结果导出',
      detail: `${result.artifacts.length} 项产物`,
      section: 'export',
      icon: Download,
    },
    {
      label: '运行日志',
      detail: `${resource.logs.length} 条记录`,
      section: 'logs',
      icon: Activity,
    },
  ];

  const goToResult = (section: string) => navigate(taskResultPath(section, task.id));

  return (
    <section className="soft-page result-overview-page analysis-overview-page">
      <WorkbenchPageHeader
        icon={LayoutDashboard}
        title="分析工作台"
        context={`任务 #${task.id} · ${task.datasetName} · ${task.mode} · 第 ${summary.representativeRun} 轮代表结果`}
        actions={
          <button type="button" className="btn btn-secondary" onClick={resource.refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            刷新
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="重复实验指标"
        metrics={(Object.keys(metricLabels) as MetricKey[]).map((key, index) => ({
          label: metricLabels[key],
          value: formatPercent(result.metrics.aggregate[key].mean),
          note: `标准差 ${formatPercent(result.metrics.aggregate[key].std)}`,
          icon: metricIcons[index],
          tone: metricTones[index],
        }))}
      />

      <div className="analysis-overview-featured">
        <MatrixPanel
          matrix={result.preview.matrices.ca}
          title="CA 协关联矩阵"
          description="由本次代表运行的基础聚类结果计算"
          actions={
            <button
              type="button"
              className="text-action"
              onClick={() => goToResult('ca-matrix')}
            >
              完整矩阵
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          }
        />

        <section className="panel analysis-overview-summary" aria-label="任务摘要">
          <WorkbenchSectionHeader
            title="任务摘要"
            meta="本次持久化结果的运行上下文"
            actions={
              <button
                type="button"
                className="text-action"
                onClick={() => navigate('/workbench/tasks')}
              >
                任务中心
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            }
          />
          <dl className="analysis-overview-summary-list">
            <div className="is-wide"><dt>任务名称</dt><dd>{task.name}</dd></div>
            <div><dt>数据集</dt><dd>{task.datasetName}</dd></div>
            <div><dt>算法模式</dt><dd>{task.mode}</dd></div>
            <div><dt>样本数量</dt><dd>{summary.sampleCount}</dd></div>
            <div><dt>真实类别</dt><dd>{summary.classCount}</dd></div>
            <div><dt>基础聚类</dt><dd>{summary.baseClusterCount}</dd></div>
            <div><dt>运行耗时</dt><dd>{formatNumber(result.runtimeSeconds, 2)} s</dd></div>
            <div><dt>随机种子</dt><dd>{summary.randomSeed}</dd></div>
            <div><dt>代表轮次</dt><dd>第 {summary.representativeRun} 轮</dd></div>
          </dl>
          <WorkbenchNotice
            tone="success"
            icon={CheckCircle2}
            title="结果已持久化"
            detail={
              result.artifacts.length
                ? `已有 ${result.artifacts.length} 项完整产物，可在结果导出页面获取。`
                : '任务结果已经保存，当前没有可下载的完整产物。'
            }
          />
        </section>
      </div>

      <section className="panel analysis-overview-flow" aria-label="分析链路">
        <WorkbenchSectionHeader
          title="分析链路"
          meta="从协关联构建到结果交付，点击阶段查看完整细节"
        />
        <div className="analysis-overview-stage-list">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <button
                type="button"
                className={`analysis-overview-stage${stage.complete ? '' : ' is-incomplete'}`}
                key={stage.section}
                onClick={() => goToResult(stage.section)}
              >
                <span className="analysis-overview-stage-icon" aria-hidden="true"><Icon size={17} /></span>
                <span className="analysis-overview-stage-copy">
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
                <span className="analysis-overview-stage-status">
                  {stage.complete
                    ? <CheckCircle2 size={13} aria-hidden="true" />
                    : <Activity size={13} aria-hidden="true" />}
                  {stage.status}
                </span>
                <ArrowRight className="analysis-overview-stage-arrow" size={14} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      <div className="analysis-overview-behavior">
        <ScatterPanel
          result={result}
          compact
          actions={
            <button
              type="button"
              className="text-action"
              onClick={() => goToResult('visualization')}
            >
              完整视图
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          }
        />
        <ConvergencePanel result={result} compact />
      </div>

      <div className="analysis-overview-details">
        <WeightPanel
          result={result}
          compact
          actions={
            <button type="button" className="text-action" onClick={() => goToResult('mkl')}>
              学习详情
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          }
        />

        <section className="panel analysis-overview-runs" aria-label="重复实验明细">
          <WorkbenchSectionHeader
            title="最近五轮实验"
            meta={`共 ${result.metrics.runs.length} 轮运行，按轮次倒序展示`}
            actions={
              <button
                type="button"
                className="text-action"
                onClick={() => goToResult('evaluation')}
              >
                查看全部
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            }
          />
          {recentRuns.length ? (
            <div className="analysis-overview-run-table" role="table" aria-label="最近五轮实验指标">
              <div className="analysis-overview-run-row header" role="row">
                <span role="columnheader">轮次</span>
                <span role="columnheader">ACC</span>
                <span role="columnheader">NMI</span>
                <span role="columnheader">ARI</span>
                <span role="columnheader">F1-score</span>
                <span role="columnheader">耗时</span>
              </div>
              {recentRuns.map((run) => (
                <div className="analysis-overview-run-row" role="row" key={run.run}>
                  <strong role="cell">第 {run.run} 轮</strong>
                  <span role="cell">{formatPercent(run.acc)}</span>
                  <span role="cell">{formatPercent(run.nmi)}</span>
                  <span role="cell">{formatPercent(run.ari)}</span>
                  <span role="cell">{formatPercent(run.f1)}</span>
                  <span role="cell">{formatNumber(run.runtimeSeconds, 2)} s</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="analysis-overview-inline-empty" role="status">
              当前结果没有重复实验明细。
            </div>
          )}
        </section>
      </div>

      <section className="panel analysis-overview-follow-up" aria-label="后续处理">
        <div className="analysis-overview-follow-up-heading">
          <BarChart3 size={18} aria-hidden="true" />
          <div>
            <strong>继续处理当前结果</strong>
            <span>{result.artifacts.length} 项产物 · {resource.logs.length} 条运行记录</span>
          </div>
        </div>
        <div className="analysis-overview-follow-up-actions">
          {followUpActions.map((action) => {
            const Icon = action.icon;
            return (
              <button type="button" key={action.section} onClick={() => goToResult(action.section)}>
                <Icon size={17} aria-hidden="true" />
                <span><strong>{action.label}</strong><small>{action.detail}</small></span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}
