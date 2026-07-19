import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchTaskLogs } from '../../api/tasks';
import { fetchLatestTaskResult, fetchTaskResult } from '../../api/results';
import type { TaskResultEnvelope, TaskResultResource } from './types';

function parseTaskId(search: string) {
  const value = Number(new URLSearchParams(search).get('taskId'));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function useTaskResult(enabled = true): TaskResultResource {
  const location = useLocation();
  const navigate = useNavigate();
  const taskId = useMemo(() => parseTaskId(location.search), [location.search]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<TaskResultEnvelope | null>(null);
  const [logs, setLogs] = useState<TaskResultResource['logs']>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [logsRefreshVersion, setLogsRefreshVersion] = useState(0);

  const refresh = useCallback(() => {
    setRefreshVersion((value) => value + 1);
    setLogsRefreshVersion((value) => value + 1);
  }, []);
  const refreshLogs = useCallback(() => setLogsRefreshVersion((value) => value + 1), []);
  const selectTask = useCallback((nextTaskId: number) => {
    const query = new URLSearchParams(location.search);
    query.set('taskId', String(nextTaskId));
    navigate({ pathname: location.pathname, search: `?${query.toString()}` });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setEnvelope(null);
      setError(null);
      setLogs([]);
      setLogsLoading(false);
      setLogsError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const request = taskId ? fetchTaskResult(taskId, controller.signal) : fetchLatestTaskResult(controller.signal);
    request
      .then((nextEnvelope) => {
        if (controller.signal.aborted) return;
        setEnvelope(nextEnvelope);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : '加载任务结果失败');
        setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, refreshVersion, taskId]);

  useEffect(() => {
    const selectedTaskId = envelope?.task?.id;
    if (!enabled || !selectedTaskId) {
      setLogs([]);
      setLogsLoading(false);
      setLogsError(null);
      return undefined;
    }

    const controller = new AbortController();
    setLogsLoading(true);
    setLogsError(null);
    void fetchTaskLogs(selectedTaskId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setLogs(response.items);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLogsError(reason instanceof Error ? reason.message : '加载任务日志失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLogsLoading(false);
      });

    return () => controller.abort();
  }, [enabled, envelope?.task?.id, logsRefreshVersion]);

  useEffect(() => {
    if (!enabled || (envelope?.state !== 'queued' && envelope?.state !== 'running')) return undefined;
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [enabled, envelope?.state, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, refresh]);

  return {
    loading,
    error,
    envelope,
    taskId,
    refresh,
    selectTask,
    logs,
    logsLoading,
    logsError,
    refreshLogs,
  };
}
