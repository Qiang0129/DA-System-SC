import { GitCompareArrows, Star } from 'lucide-react';
import { getTaskPriorityLabel, type TaskLocalMetaMap } from '../taskLocalMeta';
import type { AnalysisTask } from '../types';
import {
  canCancel,
  canDelete,
  canRetry,
  canStart,
  failureReasonLabel,
  formatRuntime,
  getStatusMeta,
  stageLabel,
} from '../taskStatus';

type Props = {
  tasks: AnalysisTask[];
  loading?: boolean;
  density: 'comfortable' | 'compact';
  onDensityChange: (value: 'comfortable' | 'compact') => void;
  selectedIds: number[];
  compareIds: number[];
  taskLocalMeta: TaskLocalMetaMap;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onOpenDetail: (task: AnalysisTask) => void;
  onStart: (task: AnalysisTask) => void;
  onCancel: (task: AnalysisTask) => void;
  onRetry: (task: AnalysisTask) => void;
  onClone: (task: AnalysisTask) => void;
  onDelete: (task: AnalysisTask) => void;
  onOpenResults: (task: AnalysisTask) => void;
  onToggleCompare: (task: AnalysisTask) => void;
  onToggleFavorite: (task: AnalysisTask) => void;
};

export function TaskTable({
  tasks,
  loading,
  density,
  onDensityChange,
  selectedIds,
  compareIds,
  taskLocalMeta,
  onToggleSelect,
  onToggleSelectAll,
  onOpenDetail,
  onStart,
  onCancel,
  onRetry,
  onClone,
  onDelete,
  onOpenResults,
  onToggleCompare,
  onToggleFavorite,
}: Props) {
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds.includes(task.id));

  return (
    <section className={`panel task-table-panel density-${density}`} aria-label="任务列表">
      <div className="panel-header task-table-header">
        <div>
          <h2>任务列表</h2>
          <span>支持筛选、批量操作、详情钻取与结果跳转。</span>
        </div>
        <div className="task-density-control" role="group" aria-label="列表密度">
          <button
            type="button"
            className={density === 'comfortable' ? 'is-active' : ''}
            aria-pressed={density === 'comfortable'}
            onClick={() => onDensityChange('comfortable')}
          >
            舒适
          </button>
          <button
            type="button"
            className={density === 'compact' ? 'is-active' : ''}
            aria-pressed={density === 'compact'}
            onClick={() => onDensityChange('compact')}
          >
            紧凑
          </button>
        </div>
      </div>

      <div className="task-table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th>
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="全选任务" />
              </th>
              <th>任务</th>
              <th>模式</th>
              <th>数据集</th>
              <th>状态</th>
              <th>进度</th>
              <th>阶段</th>
              <th>创建时间</th>
              <th>耗时</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="task-table-empty">
                  正在加载任务...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={10} className="task-table-empty">
                  暂无任务。可以从数据集创建，或点击右上角“新建任务”。
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const meta = getStatusMeta(task.status);
                const localMeta = taskLocalMeta[task.id] || {};
                return (
                  <tr key={task.id} className={task.status === 'failed' ? 'is-failed' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(task.id)}
                        onChange={() => onToggleSelect(task.id)}
                        aria-label={`选择任务 ${task.id}`}
                      />
                    </td>
                    <td>
                      <div className="task-name-cell">
                        <button type="button" className="task-name-btn" onClick={() => onOpenDetail(task)}>
                          <strong>{task.name}</strong>
                          <small>#{task.id} · {getTaskPriorityLabel(localMeta.priority)}</small>
                        </button>
                        <div className="task-row-meta">
                          <button
                            type="button"
                            className={`task-row-favorite ${localMeta.favorite ? 'is-active' : ''}`}
                            onClick={() => onToggleFavorite(task)}
                            title={localMeta.favorite ? '取消关注' : '关注任务'}
                            aria-label={localMeta.favorite ? `取消关注任务 ${task.id}` : `关注任务 ${task.id}`}
                          >
                            <Star size={14} fill={localMeta.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
                          </button>
                          {(localMeta.tags || []).slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="task-mode-tag">{task.mode}</span>
                    </td>
                    <td title={task.datasetName}>{task.datasetName}</td>
                    <td>
                      <span className={`task-status-pill tone-${meta.tone}`}>{meta.label}</span>
                      {task.status === 'failed' ? (
                        <small className="task-fail-hint">{failureReasonLabel(task.failureReason)}</small>
                      ) : null}
                    </td>
                    <td>
                      <div className="task-progress-cell">
                        <div className="progress-track">
                          <span
                            className={task.status === 'failed' ? 'is-failed' : ''}
                            style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }}
                          />
                        </div>
                        <strong>
                          {Math.round(task.progress || 0)}%
                          {task.maxIter ? ` · ${task.currentIter}/${task.maxIter}` : ''}
                        </strong>
                      </div>
                    </td>
                    <td>{stageLabel(task.currentStage)}</td>
                    <td>{task.createdAt || '-'}</td>
                    <td>{formatRuntime(task.runtimeSeconds)}</td>
                    <td>
                      <div className="task-row-actions">
                        <button type="button" onClick={() => onOpenDetail(task)}>
                          详情
                        </button>
                        {canStart(task.status) ? (
                          <button type="button" onClick={() => onStart(task)}>
                            启动
                          </button>
                        ) : null}
                        {canCancel(task.status) ? (
                          <button type="button" onClick={() => onCancel(task)}>
                            取消
                          </button>
                        ) : null}
                        {canRetry(task.status) ? (
                          <button type="button" onClick={() => onRetry(task)}>
                            重试
                          </button>
                        ) : null}
                        {task.status === 'succeeded' ? (
                          <button type="button" onClick={() => onOpenResults(task)}>
                            结果
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={compareIds.includes(task.id) ? 'is-active' : ''}
                          onClick={() => onToggleCompare(task)}
                          title={compareIds.includes(task.id) ? '移出任务对比' : '加入任务对比'}
                          aria-label={compareIds.includes(task.id) ? `将任务 ${task.id} 移出比较` : `将任务 ${task.id} 加入比较`}
                        >
                          <GitCompareArrows size={14} aria-hidden="true" />
                          对比
                        </button>
                        <button type="button" onClick={() => onClone(task)}>
                          克隆
                        </button>
                        {canDelete(task.status) ? (
                          <button type="button" className="danger" onClick={() => onDelete(task)}>
                            删除
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
