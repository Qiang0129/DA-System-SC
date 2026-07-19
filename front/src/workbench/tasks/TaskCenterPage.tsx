import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  bulkTasks,
  cancelTask,
  cloneTask,
  createTask,
  createTaskTemplate,
  deleteTask,
  deleteTaskTemplate,
  fetchDatasetOptions,
  fetchTaskDetail,
  fetchTaskLogs,
  fetchTaskStats,
  fetchTaskTemplates,
  fetchTasks,
  retryTask,
  startTask,
} from '../../api/tasks';
import { TaskBulkBar } from './components/TaskBulkBar';
import { TaskCompareTray } from './components/TaskCompareTray';
import { TaskCreateDrawer } from './components/TaskCreateDrawer';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import { TaskEmptyState } from './components/TaskEmptyState';
import { TaskFiltersBar } from './components/TaskFiltersBar';
import { TaskFocusPanel } from './components/TaskFocusPanel';
import { TaskStatsBar } from './components/TaskStatsBar';
import { TaskTable } from './components/TaskTable';
import { loadTaskLocalMeta, saveTaskLocalMeta, type TaskLocalMeta, type TaskLocalMetaMap } from './taskLocalMeta';
import type {
  AnalysisTask,
  AnalysisTaskLog,
  AnalysisTaskStats,
  CreateTaskPayload,
  DatasetOption,
  TaskTemplate,
} from './types';

const PAGE_SIZE = 20;

export function TaskCenterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [stats, setStats] = useState<AnalysisTaskStats | null>(null);
  const [tasks, setTasks] = useState<AnalysisTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [mode, setMode] = useState(searchParams.get('mode') || '');
  const [datasetId, setDatasetId] = useState(searchParams.get('datasetId') || '');
  const [createdFrom, setCreatedFrom] = useState(searchParams.get('createdFrom') || '');
  const [createdTo, setCreatedTo] = useState(searchParams.get('createdTo') || '');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [taskLocalMeta, setTaskLocalMeta] = useState<TaskLocalMetaMap>(() => loadTaskLocalMeta());

  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const [submitting, setSubmitting] = useState(false);
  const [detailTask, setDetailTask] = useState<AnalysisTask | null>(null);
  const [detailLogs, setDetailLogs] = useState<AnalysisTaskLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const initialDatasetId = useMemo(() => {
    const raw = searchParams.get('datasetId');
    return raw ? Number(raw) : null;
  }, [searchParams]);

  const syncQuery = useCallback(
    (next: { q?: string; status?: string; mode?: string; datasetId?: string; createdFrom?: string; createdTo?: string; create?: string }) => {
      const params = new URLSearchParams(searchParams);
      const assign = (key: string, value?: string) => {
        if (!value) params.delete(key);
        else params.set(key, value);
      };
      assign('q', next.q);
      assign('status', next.status);
      assign('mode', next.mode);
      assign('datasetId', next.datasetId);
      assign('createdFrom', next.createdFrom);
      assign('createdTo', next.createdTo);
      assign('create', next.create);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statsData, pageData, datasetData, templateData] = await Promise.all([
        fetchTaskStats(),
        fetchTasks({
          page,
          pageSize: PAGE_SIZE,
          keyword: keyword.trim() || undefined,
          status: status || undefined,
          mode: mode || undefined,
          datasetId: datasetId ? Number(datasetId) : undefined,
          createdFrom: createdFrom || undefined,
          createdTo: createdTo || undefined,
        }),
        fetchDatasetOptions(),
        fetchTaskTemplates(),
      ]);
      setStats(statsData);
      setTasks(pageData.items);
      setTotal(pageData.total);
      setDatasets(datasetData);
      setTemplates(templateData.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务中心失败');
    } finally {
      setLoading(false);
    }
  }, [page, keyword, status, mode, datasetId, createdFrom, createdTo]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const hasRunning = tasks.some((task) => task.status === 'running' || task.status === 'queued');
    if (!hasRunning) return undefined;
    const timer = window.setInterval(() => {
      void loadAll();
      if (detailTask && (detailTask.status === 'running' || detailTask.status === 'queued')) {
        void openDetail(detailTask.id, false);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [tasks, detailTask, loadAll]);

  async function openDetail(taskId: number, withLoading = true) {
    if (withLoading) setLoadingLogs(true);
    try {
      const [task, logs] = await Promise.all([fetchTaskDetail(taskId), fetchTaskLogs(taskId)]);
      setDetailTask(task);
      setDetailLogs(logs.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务详情失败');
    } finally {
      if (withLoading) setLoadingLogs(false);
    }
  }

  async function runAction(action: () => Promise<unknown>, successText: string) {
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(successText);
      await loadAll();
      if (detailTask) {
        await openDetail(detailTask.id, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  function exportCsv() {
    const header = ['id', 'name', 'mode', 'status', 'dataset', 'progress', 'createdAt', 'runtimeSeconds'];
    const lines = tasks.map((task) =>
      [
        task.id,
        JSON.stringify(task.name),
        task.mode,
        task.status,
        JSON.stringify(task.datasetName),
        task.progress,
        task.createdAt,
        task.runtimeSeconds ?? '',
      ].join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tasks-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreate(payload: CreateTaskPayload, saveAsTemplateName?: string) {
    setSubmitting(true);
    setError('');
    try {
      if (saveAsTemplateName) {
        await createTaskTemplate({
          name: saveAsTemplateName,
          mode: String(payload.mode || 'OMELET-SV'),
          params: payload.params,
        });
      }
      await createTask(payload);
      setCreateOpen(false);
      setMessage('任务创建成功');
      syncQuery({
        q: keyword,
        status,
        mode,
        datasetId,
        create: undefined,
      });
      await loadAll();
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilters = Boolean(keyword || status || mode || datasetId || createdFrom || createdTo);
  const comparedTasks = tasks.filter((task) => compareIds.includes(task.id));

  function toggleCompare(task: AnalysisTask) {
    setError('');
    setCompareIds((current) => {
      if (current.includes(task.id)) return current.filter((id) => id !== task.id);
      if (current.length >= 3) {
        setError('一次最多比较 3 个任务，请先移除已选任务。');
        return current;
      }
      return [...current, task.id];
    });
  }

  async function handleDeleteTemplate(template: TaskTemplate) {
    if (!window.confirm(`确认删除模板“${template.name}”？`)) return;
    setError('');
    try {
      await deleteTaskTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setMessage(`模板“${template.name}”已删除`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除模板失败');
    }
  }

  function updateTaskLocalMeta(taskId: number, patch: Partial<TaskLocalMeta>) {
    setTaskLocalMeta((current) => {
      const next = {
        ...current,
        [taskId]: {
          ...current[taskId],
          ...patch,
        },
      };
      saveTaskLocalMeta(next);
      return next;
    });
  }

  return (
    <div className="task-center-page" aria-label="任务中心">
      <TaskStatsBar
        stats={stats}
        loading={loading}
        activeStatus={status}
        onQuickFilter={(nextStatus) => {
          setPage(1);
          setStatus(nextStatus);
          syncQuery({ q: keyword, status: nextStatus, mode, datasetId, createdFrom, createdTo });
        }}
      />

      <TaskFocusPanel
        tasks={tasks}
        onOpenTask={(task) => void openDetail(task.id)}
        onStartTask={(task) => void runAction(() => startTask(task.id), `任务 #${task.id} 已启动`)}
      />

      <TaskFiltersBar
        keyword={keyword}
        status={status}
        mode={mode}
        datasetId={datasetId}
        createdFrom={createdFrom}
        createdTo={createdTo}
        datasets={datasets}
        total={total}
        loading={loading}
        onKeywordChange={(value) => {
          setKeyword(value);
          setPage(1);
          syncQuery({ q: value, status, mode, datasetId, createdFrom, createdTo, create: createOpen ? '1' : undefined });
        }}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
          syncQuery({ q: keyword, status: value, mode, datasetId, createdFrom, createdTo });
        }}
        onModeChange={(value) => {
          setMode(value);
          setPage(1);
          syncQuery({ q: keyword, status, mode: value, datasetId, createdFrom, createdTo });
        }}
        onDatasetChange={(value) => {
          setDatasetId(value);
          setPage(1);
          syncQuery({ q: keyword, status, mode, datasetId: value, createdFrom, createdTo });
        }}
        onCreatedFromChange={(value) => {
          setCreatedFrom(value);
          setPage(1);
          syncQuery({ q: keyword, status, mode, datasetId, createdFrom: value, createdTo });
        }}
        onCreatedToChange={(value) => {
          setCreatedTo(value);
          setPage(1);
          syncQuery({ q: keyword, status, mode, datasetId, createdFrom, createdTo: value });
        }}
        onClearDates={() => {
          setCreatedFrom('');
          setCreatedTo('');
          setPage(1);
          syncQuery({ q: keyword, status, mode, datasetId, createdFrom: '', createdTo: '' });
        }}
        onRefresh={() => void loadAll()}
        onReset={() => {
          setKeyword('');
          setStatus('');
          setMode('');
          setDatasetId('');
          setCreatedFrom('');
          setCreatedTo('');
          setPage(1);
          syncQuery({ q: '', status: '', mode: '', datasetId: '', createdFrom: '', createdTo: '' });
        }}
        onCreate={() => {
          setCreateOpen(true);
          syncQuery({ q: keyword, status, mode, datasetId, createdFrom, createdTo, create: '1' });
        }}
        onExport={exportCsv}
      />

      {error ? <div className="task-center-alert error">{error}</div> : null}
      {message ? <div className="task-center-alert success">{message}</div> : null}

      <TaskBulkBar
        count={selectedIds.length}
        onRetry={() =>
          void runAction(() => bulkTasks(selectedIds, 'retry'), '批量重试已提交').then(() => setSelectedIds([]))
        }
        onCancel={() =>
          void runAction(() => bulkTasks(selectedIds, 'cancel'), '批量取消已提交').then(() => setSelectedIds([]))
        }
        onDelete={() => {
          if (!window.confirm(`确认删除选中的 ${selectedIds.length} 个任务？`)) return;
          void runAction(() => bulkTasks(selectedIds, 'delete'), '批量删除完成').then(() => setSelectedIds([]));
        }}
        onFavorite={() => {
          selectedIds.forEach((taskId) => updateTaskLocalMeta(taskId, { favorite: true }));
          setMessage(`已关注 ${selectedIds.length} 个任务`);
        }}
        onCompare={() => {
          const newIds = tasks
            .filter((task) => selectedIds.includes(task.id))
            .map((task) => task.id)
            .filter((taskId) => !compareIds.includes(taskId));
          if (compareIds.length + newIds.length > 3) {
            setError('比较栏最多保留 3 个任务，请减少选择后重试。');
            return;
          }
          setCompareIds((current) => [...current, ...newIds]);
        }}
        onClear={() => setSelectedIds([])}
      />

      <TaskCompareTray
        tasks={comparedTasks}
        onRemove={(taskId) => setCompareIds((current) => current.filter((id) => id !== taskId))}
        onClear={() => setCompareIds([])}
      />

      {!loading && total === 0 && !hasActiveFilters ? (
        <TaskEmptyState
          onCreate={() => setCreateOpen(true)}
          onUseTemplate={() => setCreateOpen(true)}
          onOpenDatasets={() => navigate('/workbench/datasets')}
        />
      ) : null}

      <TaskTable
        tasks={tasks}
        loading={loading}
        density={density}
        onDensityChange={setDensity}
        selectedIds={selectedIds}
        compareIds={compareIds}
        taskLocalMeta={taskLocalMeta}
        onToggleSelect={(id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
        }
        onToggleSelectAll={() => {
          if (tasks.every((task) => selectedIds.includes(task.id))) {
            setSelectedIds((prev) => prev.filter((id) => !tasks.some((task) => task.id === id)));
          } else {
            setSelectedIds((prev) => Array.from(new Set([...prev, ...tasks.map((task) => task.id)])));
          }
        }}
        onOpenDetail={(task) => void openDetail(task.id)}
        onStart={(task) => void runAction(() => startTask(task.id), `任务 #${task.id} 已启动`)}
        onCancel={(task) => void runAction(() => cancelTask(task.id), `任务 #${task.id} 已取消`)}
        onRetry={(task) => void runAction(() => retryTask(task.id), `任务 #${task.id} 已重试`)}
        onClone={(task) => void runAction(() => cloneTask(task.id), `任务 #${task.id} 已克隆`)}
        onDelete={(task) => {
          if (!window.confirm(`确认删除任务 #${task.id}？`)) return;
          void runAction(async () => {
            await deleteTask(task.id);
            if (detailTask?.id === task.id) setDetailTask(null);
          }, `任务 #${task.id} 已删除`);
        }}
        onOpenResults={(task) => navigate(`/workbench/results?taskId=${task.id}`)}
        onToggleCompare={toggleCompare}
        onToggleFavorite={(task) => updateTaskLocalMeta(task.id, { favorite: !taskLocalMeta[task.id]?.favorite })}
      />

      <div className="task-pagination">
        <span>
          共 {total} 条，第 {page}/{totalPages} 页
        </span>
        <div>
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      <TaskDetailDrawer
        open={!!detailTask}
        task={detailTask}
        logs={detailLogs}
        localMeta={detailTask ? taskLocalMeta[detailTask.id] || {} : {}}
        loadingLogs={loadingLogs}
        onClose={() => setDetailTask(null)}
        onStart={(task) => void runAction(() => startTask(task.id), `任务 #${task.id} 已启动`)}
        onCancel={(task) => void runAction(() => cancelTask(task.id), `任务 #${task.id} 已取消`)}
        onRetry={(task) => void runAction(() => retryTask(task.id), `任务 #${task.id} 已重试`)}
        onClone={(task) => void runAction(() => cloneTask(task.id), `任务 #${task.id} 已克隆`)}
        onDelete={(task) => {
          if (!window.confirm(`确认删除任务 #${task.id}？`)) return;
          void runAction(async () => {
            await deleteTask(task.id);
            setDetailTask(null);
          }, `任务 #${task.id} 已删除`);
        }}
        onOpenResults={(task) => navigate(`/workbench/results?taskId=${task.id}`)}
        onOpenExport={(task) => navigate(`/workbench/export?taskId=${task.id}`)}
        onOpenReport={(task) => navigate(`/workbench/reports?taskId=${task.id}`)}
        onUpdateLocalMeta={(patch) => {
          if (detailTask) updateTaskLocalMeta(detailTask.id, patch);
        }}
      />

      <TaskCreateDrawer
        open={createOpen}
        datasets={datasets}
        templates={templates}
        initialDatasetId={initialDatasetId}
        submitting={submitting}
        onClose={() => {
          setCreateOpen(false);
          syncQuery({ q: keyword, status, mode, datasetId });
        }}
        onSubmit={handleCreate}
        onDeleteTemplate={(template) => void handleDeleteTemplate(template)}
      />
    </div>
  );
}

export default TaskCenterPage;
