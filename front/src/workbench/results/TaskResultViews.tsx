import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ClipboardCheck,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { retryTask } from '../../api/tasks';
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
import { MetricStrip, ReadyHeader } from './ResultPageShared';
import { formatNumber, formatPercent } from './resultPresentation';
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
    title = '还没有可用的真实结果';
    detail = '请先创建并完成一个带 y 标签的数据集分析任务。';
  }
  if (state === 'draft') {
    title = '任务尚未启动';
    detail = '启动任务后，这里会显示真实的计算过程和结果。';
  }
  if (state === 'queued') {
    title = '任务正在排队';
    detail = `队列位置 ${task?.queuePosition ?? '—'}，轮到后会自动开始。`;
    tone = 'warning';
  }
  if (state === 'running' && task) {
    const run = getTaskRunProgress(task);
    title = '真实 OMELET 正在运行';
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
    detail = '旧结果没有真实算法产物，重新执行任务后才能查看可信分析。';
    tone = 'warning';
  }

  return (
    <section className="soft-page result-state-page" aria-live="polite">
      <WorkbenchPageHeader
        icon={Activity}
        title="分析结果"
        context={task ? `任务 #${task.id} · ${task.datasetName} · ${task.mode}` : '结果上下文'}
        status={<WorkbenchStatus tone={tone} pulse={state === 'running'}>{title}</WorkbenchStatus>}
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
  const result = resource.envelope!.result!;
  const rows = result.metrics.runs;
  return (
    <section className="soft-page result-evaluation-page">
      <ReadyHeader title="性能评估" icon={ClipboardCheck} resource={resource} />
      <MetricStrip result={result} />
      <section className="panel result-table-panel">
        <WorkbenchSectionHeader title="重复实验明细" meta={`${rows.length} 次真实运行，随机种子按任务参数派生`} />
        <div className="result-table" role="table">
          <div className="result-table-row header" role="row">
            <span>轮次</span><span>ACC</span><span>NMI</span><span>ARI</span><span>F1-score</span><span>耗时</span>
          </div>
          {rows.map((row) => (
            <div className="result-table-row" role="row" key={row.run}>
              <span>第 {row.run} 轮</span>
              <span>{formatPercent(row.acc)}</span>
              <span>{formatPercent(row.nmi)}</span>
              <span>{formatPercent(row.ari)}</span>
              <span>{formatPercent(row.f1)}</span>
              <span>{formatNumber(row.runtimeSeconds, 2)} s</span>
            </div>
          ))}
        </div>
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
