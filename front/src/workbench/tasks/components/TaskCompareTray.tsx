import { BarChart3, GitCompareArrows, X } from 'lucide-react';
import type { AnalysisTask } from '../types';
import { formatPercent, formatRuntime } from '../taskStatus';

type Props = {
  tasks: AnalysisTask[];
  onRemove: (taskId: number) => void;
  onClear: () => void;
};

export function TaskCompareTray({ tasks, onRemove, onClear }: Props) {
  if (tasks.length === 0) return null;

  return (
    <section className="task-compare-tray panel" aria-label="任务对比栏">
      <header className="task-compare-header">
        <div>
          <span className="task-compare-kicker">
            <GitCompareArrows size={15} aria-hidden="true" />
            任务对比
          </span>
          <h2>已选 {tasks.length} / 3 个任务</h2>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          清空对比
        </button>
      </header>

      <div className="task-compare-grid">
        {tasks.map((task) => (
          <article key={task.id} className="task-compare-item">
            <header>
              <div>
                <strong>{task.name}</strong>
                <span>#{task.id} · {task.datasetName}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(task.id)}
                title="移出对比"
                aria-label={`移出任务 ${task.id} 对比`}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </header>
            <dl>
              <div><dt>模式</dt><dd>{task.mode}</dd></div>
              <div><dt>状态</dt><dd>{task.status}</dd></div>
              <div><dt>耗时</dt><dd>{formatRuntime(task.runtimeSeconds)}</dd></div>
              <div><dt>ACC</dt><dd>{formatPercent(task.metricsSummary?.acc)}</dd></div>
              <div><dt>NMI</dt><dd>{formatPercent(task.metricsSummary?.nmi)}</dd></div>
              <div><dt>F1</dt><dd>{formatPercent(task.metricsSummary?.f1)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <p className="task-compare-note">
        <BarChart3 size={15} aria-hidden="true" />
        仅比较当前已加载任务的任务元数据和已有指标；图表与结果文件将在算法服务接入后显示。
      </p>
    </section>
  );
}
