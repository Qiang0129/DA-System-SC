import { ArrowUpRight, CircleAlert, Play, RadioTower } from 'lucide-react';
import type { AnalysisTask } from '../types';
import { formatRuntime, getStatusMeta, getTaskRunProgress, stageLabel } from '../taskStatus';

type Props = {
  tasks: AnalysisTask[];
  onOpenTask: (task: AnalysisTask) => void;
  onStartTask: (task: AnalysisTask) => void;
};

export function TaskFocusPanel({ tasks, onOpenTask, onStartTask }: Props) {
  const runningTask = tasks.find((task) => task.status === 'running' || task.status === 'queued');
  const attentionTask = tasks.find((task) => task.status === 'failed') || tasks.find((task) => task.status === 'draft');
  const runProgress = runningTask ? getTaskRunProgress(runningTask) : null;

  if (!runningTask && !attentionTask) return null;

  return (
    <section className="task-focus-grid" aria-label="任务运行概览">
      {runningTask ? (
        <article className="task-focus-card primary">
          <header>
            <span><RadioTower size={16} aria-hidden="true" /> 当前执行</span>
            <button type="button" onClick={() => onOpenTask(runningTask)}>
              查看详情 <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </header>
          <strong>{runningTask.name}</strong>
          <p>
            {stageLabel(runningTask.currentStage)}
            {' · '}
            {runningTask.status === 'queued'
              ? `等待执行，共 ${runProgress?.total ?? 1} 轮`
              : `第 ${runProgress?.current ?? 1}/${runProgress?.total ?? 1} 轮 · 迭代 ${runningTask.currentIter}/${runningTask.maxIter}`}
            {' · '}已运行 {formatRuntime(runningTask.runtimeSeconds)}
          </p>
          <div className="task-focus-progress" aria-label={`任务进度 ${Math.round(runningTask.progress)}%`}>
            <span style={{ width: `${Math.max(0, Math.min(100, runningTask.progress || 0))}%` }} />
          </div>
        </article>
      ) : null}

      {attentionTask ? (
        <article className="task-focus-card attention">
          <header>
            <span><CircleAlert size={16} aria-hidden="true" /> 需要处理</span>
            <button type="button" onClick={() => onOpenTask(attentionTask)}>
              查看详情 <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </header>
          <strong>{attentionTask.name}</strong>
          <p>{getStatusMeta(attentionTask.status).description}</p>
          {attentionTask.status === 'draft' ? (
            <button type="button" className="btn btn-primary task-focus-start" onClick={() => onStartTask(attentionTask)}>
              <Play size={15} aria-hidden="true" /> 启动草稿任务
            </button>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
