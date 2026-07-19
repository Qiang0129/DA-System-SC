import type { AnalysisTaskStats } from '../types';
import { formatRuntime } from '../taskStatus';

type Props = {
  stats: AnalysisTaskStats | null;
  loading?: boolean;
  onQuickFilter?: (status: string) => void;
  activeStatus?: string;
};

const CARDS: Array<{ key: keyof AnalysisTaskStats; label: string; status?: string; tone: string }> = [
  { key: 'total', label: '全部任务', tone: 'neutral' },
  { key: 'queued', label: '排队中', status: 'queued', tone: 'info' },
  { key: 'running', label: '运行中', status: 'running', tone: 'running' },
  { key: 'succeeded', label: '成功', status: 'succeeded', tone: 'success' },
  { key: 'failed', label: '失败', status: 'failed', tone: 'danger' },
  { key: 'todayCompleted', label: '今日完成', tone: 'success' },
];

export function TaskStatsBar({ stats, loading, onQuickFilter, activeStatus }: Props) {
  return (
    <section className="task-center-stats" aria-label="任务统计">
      {CARDS.map((card) => {
        const value = stats ? Number(stats[card.key] ?? 0) : loading ? '...' : 0;
        const active = card.status && activeStatus === card.status;
        const actionable = Boolean(card.status && onQuickFilter);
        return (
          <button
            key={card.key}
            type="button"
            className={`task-stat-card tone-${card.tone}${actionable ? ' is-actionable' : ''}${active ? ' active' : ''}`}
            onClick={() => {
              if (card.status && onQuickFilter) onQuickFilter(card.status);
            }}
            disabled={!actionable}
          >
            <span>{card.label}</span>
            <strong>{value}</strong>
          </button>
        );
      })}
      <article className="task-stat-card tone-muted meta">
        <span>平均耗时 / 失败率</span>
        <strong>
          {formatRuntime(stats?.averageRuntimeSeconds)} / {stats ? `${(stats.failureRate * 100).toFixed(1)}%` : '-'}
        </strong>
      </article>
    </section>
  );
}
