import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock3,
  Download,
  Info,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import {
  WorkbenchMetricStrip,
  WorkbenchNotice,
  WorkbenchPageHeader,
  WorkbenchSectionHeader,
  WorkbenchStatus,
} from '../WorkbenchUi';
import { formatRuntime, getStatusMeta, getTaskRunProgress } from '../tasks/taskStatus';
import type { AnalysisTaskLog } from '../tasks/types';
import { downloadTextFile } from './resultPresentation';
import { ResultBackButton } from './ResultPageShared';
import type { TaskResultResource } from './types';

type LogLevelFilter = 'all' | 'info' | 'warning' | 'error';
type LogOrder = 'asc' | 'desc';
type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const ACTION_LABELS: Record<string, string> = {
  task_cloned: '克隆任务',
  task_created: '创建任务',
  task_queued: '进入执行队列',
  task_started: '启动计算进程',
  task_run_started: '开始实验轮次',
  task_run_completed: '完成实验轮次',
  task_succeeded: '分析任务完成',
  task_failed: '分析任务失败',
  task_cancelled: '分析任务取消',
  result_persisted: '保存分析结果',
  export_created: '创建导出文件',
};

function normalizeLevel(level: string): Exclude<LogLevelFilter, 'all'> | 'neutral' {
  const normalized = level.trim().toLowerCase();
  if (normalized === 'error') return 'error';
  if (normalized === 'warning' || normalized === 'warn') return 'warning';
  if (normalized === 'info') return 'info';
  return 'neutral';
}

function getLevelPresentation(level: string) {
  const normalized = normalizeLevel(level);
  if (normalized === 'error') return { key: normalized, label: '异常', tone: 'error' as const };
  if (normalized === 'warning') return { key: normalized, label: '提醒', tone: 'warning' as const };
  if (normalized === 'info') return { key: normalized, label: '信息', tone: 'info' as const };
  return { key: normalized, label: level || '记录', tone: 'neutral' as const };
}

function getTaskTone(status: string): StatusTone {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'queued' || status === 'running') return 'warning';
  return 'neutral';
}

// 后端日志时间可能是带空格的数据库格式，也可能是标准 ISO 字符串；统一后再排序，解析失败时使用 id 保证顺序稳定。
function getTimestamp(value: string) {
  const timestamp = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareLogs(left: AnalysisTaskLog, right: AnalysisTaskLog) {
  const leftTimestamp = getTimestamp(left.createdAt);
  const rightTimestamp = getTimestamp(right.createdAt);
  if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }
  return left.id - right.id;
}

function splitDateTime(value: string) {
  const normalized = value.replace('T', ' ').replace(/Z$/, '');
  const [date = value, time = ''] = normalized.split(' ');
  return { date, time };
}

function formatCoverage(logs: AnalysisTaskLog[]) {
  if (logs.length < 2) return logs.length ? '单个时间点' : '等待事件写入';
  const sorted = [...logs].sort(compareLogs);
  const first = getTimestamp(sorted[0].createdAt);
  const last = getTimestamp(sorted[sorted.length - 1].createdAt);
  if (first === null || last === null) return '完整执行链路';
  return `覆盖 ${formatRuntime(Math.max(0, (last - first) / 1000))}`;
}

function extractRunNumber(log: AnalysisTaskLog) {
  const detailRun = Number(log.detail?.run ?? log.detail?.currentRun ?? log.detail?.runNumber);
  if (Number.isInteger(detailRun) && detailRun > 0) return detailRun;
  const match = log.message.match(/第\s*(\d+)\s*轮/);
  return match ? Number(match[1]) : null;
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildTaskLogsCsv(logs: AnalysisTaskLog[]) {
  const rows = [
    ['级别', '事件', '内容', '时间'],
    ...logs.map((log) => [log.level, log.action, log.message, log.createdAt]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`;
}

function LogTimelineSkeleton() {
  return (
    <div className="task-log-skeleton" aria-label="日志加载中" aria-busy="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index}>
          <i />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function TaskLogsPage({ resource }: { resource: TaskResultResource }) {
  const task = resource.envelope!.task!;
  const runProgress = getTaskRunProgress(task);
  const [level, setLevel] = useState<LogLevelFilter>('all');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<LogOrder>('asc');
  const logListRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();

  // 筛选和排序会改变列表的首条事件，回到顶部可以避免用户停留在旧列表的中间位置。
  useEffect(() => {
    if (logListRef.current) logListRef.current.scrollTop = 0;
  }, [level, normalizedQuery, order]);

  const summary = useMemo(() => resource.logs.reduce(
    (counts, log) => {
      const normalized = normalizeLevel(log.level);
      counts.total += 1;
      if (normalized === 'info') counts.info += 1;
      if (normalized === 'warning') counts.warning += 1;
      if (normalized === 'error') counts.error += 1;
      return counts;
    },
    { total: 0, info: 0, warning: 0, error: 0 },
  ), [resource.logs]);

  const logs = useMemo(() => {
    const filtered = resource.logs.filter((log) => {
      const presentation = getLevelPresentation(log.level);
      const matchesLevel = level === 'all' || presentation.key === level;
      const eventLabel = ACTION_LABELS[log.action] ?? log.action;
      const matchesQuery = !normalizedQuery
        || `${eventLabel} ${log.action} ${log.message}`.toLowerCase().includes(normalizedQuery);
      return matchesLevel && matchesQuery;
    });
    filtered.sort((left, right) => (order === 'asc' ? compareLogs(left, right) : compareLogs(right, left)));
    return filtered;
  }, [level, normalizedQuery, order, resource.logs]);

  const sortedLogs = useMemo(() => [...resource.logs].sort(compareLogs), [resource.logs]);
  const firstLog = sortedLogs[0];
  const latestLog = sortedLogs[sortedLogs.length - 1];
  const statusMeta = getStatusMeta(task.status);

  const resetFilters = () => {
    setLevel('all');
    setQuery('');
  };

  const exportLogs = () => {
    if (!logs.length) return;
    downloadTextFile(
      `task-${task.id}-logs.csv`,
      buildTaskLogsCsv(logs),
      'text/csv;charset=utf-8',
    );
  };

  const levelOptions: Array<{ value: LogLevelFilter; label: string; count: number }> = [
    { value: 'all', label: '全部', count: summary.total },
    { value: 'info', label: '信息', count: summary.info },
    { value: 'warning', label: '提醒', count: summary.warning },
    { value: 'error', label: '异常', count: summary.error },
  ];

  return (
    <section className="soft-page task-logs-page" aria-label="任务运行日志">
      <WorkbenchPageHeader
        icon={Activity}
        title="运行日志"
        context={`任务 #${task.id} · ${task.datasetName} · ${task.mode} · ${runProgress.total} 轮实验`}
        status={(
          <WorkbenchStatus tone={getTaskTone(task.status)} pulse={task.status === 'running'}>
            {statusMeta.label}
          </WorkbenchStatus>
        )}
        backAction={<ResultBackButton taskId={task.id} />}
        actions={(
          <>
            <button
              type="button"
              className="btn btn-secondary task-log-refresh"
              disabled={resource.logsLoading}
              onClick={resource.refreshLogs}
            >
              <RefreshCw className={resource.logsLoading ? 'is-spinning' : ''} size={15} aria-hidden="true" />
              {resource.logsLoading ? '同步中' : '刷新日志'}
            </button>
            <button type="button" className="btn btn-primary" disabled={!logs.length} onClick={exportLogs}>
              <Download size={15} aria-hidden="true" />
              导出日志
            </button>
          </>
        )}
      />

      <WorkbenchMetricStrip
        label="日志摘要"
        metrics={[
          { label: '全部事件', value: String(summary.total), note: formatCoverage(resource.logs), icon: Activity, tone: 'blue' },
          { label: '信息', value: String(summary.info), note: '正常执行记录', icon: Info, tone: 'teal' },
          { label: '提醒', value: String(summary.warning), note: summary.warning ? '建议复核' : '当前无提醒', icon: AlertTriangle, tone: 'amber' },
          { label: '异常', value: String(summary.error), note: summary.error ? '需要处理' : '当前无异常', icon: XCircle, tone: 'red' },
        ]}
      />

      <div className="task-log-workspace">
        <section className="panel task-log-stream-panel" aria-label="执行事件">
          <WorkbenchSectionHeader
            title="执行事件"
            meta={`${logs.length} / ${summary.total} 条 · ${order === 'asc' ? '按执行顺序' : '最新事件优先'}`}
          />

          <div className="task-log-toolbar">
            <div className="task-log-search-row">
              <label className="task-log-search">
                <Search size={15} aria-hidden="true" />
                <input
                  value={query}
                  aria-label="搜索任务日志"
                  placeholder="搜索事件名称、标识或日志内容"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? (
                  <button type="button" aria-label="清除日志搜索" onClick={() => setQuery('')}>
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <span className="task-log-result-count" aria-live="polite">当前显示 {logs.length} 条</span>
            </div>

            <div className="task-log-filter-row">
              <div className="task-log-segmented" role="group" aria-label="筛选日志级别">
                {levelOptions.map((option) => (
                  <button
                    type="button"
                    className={level === option.value ? 'is-active' : ''}
                    aria-pressed={level === option.value}
                    key={option.value}
                    onClick={() => setLevel(option.value)}
                  >
                    <span>{option.label}</span>
                    <small>{option.count}</small>
                  </button>
                ))}
              </div>

              <div className="task-log-order" role="group" aria-label="日志排序方式">
                <button
                  type="button"
                  className={order === 'asc' ? 'is-active' : ''}
                  aria-pressed={order === 'asc'}
                  onClick={() => setOrder('asc')}
                >
                  <ArrowDown size={13} aria-hidden="true" />
                  执行顺序
                </button>
                <button
                  type="button"
                  className={order === 'desc' ? 'is-active' : ''}
                  aria-pressed={order === 'desc'}
                  onClick={() => setOrder('desc')}
                >
                  <ArrowUp size={13} aria-hidden="true" />
                  最新优先
                </button>
              </div>
            </div>
          </div>

          <div
            ref={logListRef}
            className="task-log-list-region"
            role="region"
            aria-label="可滚动的任务执行日志"
            tabIndex={0}
          >
            {resource.logsError ? (
              <WorkbenchNotice
                tone="error"
                icon={XCircle}
                title="日志同步失败"
                detail={resource.logsError}
                action={<button type="button" className="btn btn-secondary" onClick={resource.refreshLogs}>重新加载</button>}
              />
            ) : null}

            {resource.logsLoading && !resource.logs.length ? <LogTimelineSkeleton /> : null}

            {!resource.logsLoading && !resource.logsError && !resource.logs.length ? (
              <div className="task-log-empty" role="status">
                <Clock3 size={24} aria-hidden="true" />
                <strong>暂时还没有执行事件</strong>
                <span>任务进入队列后，启动、实验轮次和结果保存记录会显示在这里。</span>
              </div>
            ) : null}

            {resource.logs.length && !logs.length ? (
              <div className="task-log-empty" role="status">
                <Search size={24} aria-hidden="true" />
                <strong>没有匹配的日志</strong>
                <span>调整搜索词或日志级别，查看其他执行事件。</span>
                <button type="button" className="btn btn-secondary" onClick={resetFilters}>清除筛选</button>
              </div>
            ) : null}

            {logs.length ? (
              <ol className="task-log-timeline" aria-label="任务执行事件列表">
                {logs.map((log) => {
                  const levelPresentation = getLevelPresentation(log.level);
                  const eventLabel = ACTION_LABELS[log.action] ?? log.action;
                  const dateTime = splitDateTime(log.createdAt);
                  const runNumber = extractRunNumber(log);
                  return (
                    <li className={`task-log-event level-${levelPresentation.key}`} key={log.id}>
                      <span className="task-log-event-marker" aria-hidden="true"><i /></span>
                      <div className="task-log-event-content">
                        <div className="task-log-event-heading">
                          <strong>{eventLabel}</strong>
                          {eventLabel !== log.action ? <code>{log.action}</code> : null}
                        </div>
                        <p>{log.message}</p>
                        <div className="task-log-event-meta">
                          <WorkbenchStatus tone={levelPresentation.tone}>{levelPresentation.label}</WorkbenchStatus>
                          {runNumber ? (
                            <span className="task-log-run">
                              第 {runNumber}{runNumber <= runProgress.total ? ` / ${runProgress.total}` : ''} 轮
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <time dateTime={log.createdAt.includes('T') ? log.createdAt : log.createdAt.replace(' ', 'T')}>
                        <span>{dateTime.date}</span>
                        <strong>{dateTime.time || '—'}</strong>
                      </time>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        </section>

        <aside className="panel task-log-context-panel" aria-label="任务上下文">
          <WorkbenchSectionHeader title="任务上下文" meta="当前执行记录对应的任务信息" />
          <dl className="task-log-context-list">
            <div><dt>任务名称</dt><dd>{task.name || `任务 #${task.id}`}</dd></div>
            <div><dt>数据集</dt><dd>{task.datasetName}</dd></div>
            <div><dt>算法模式</dt><dd><code>{task.mode}</code></dd></div>
            <div><dt>任务状态</dt><dd><WorkbenchStatus tone={getTaskTone(task.status)}>{statusMeta.label}</WorkbenchStatus></dd></div>
            <div><dt>实验轮数</dt><dd>{runProgress.current} / {runProgress.total} 轮</dd></div>
            <div><dt>运行耗时</dt><dd>{formatRuntime(task.runtimeSeconds)}</dd></div>
          </dl>

          <div className="task-log-time-range">
            <h3>日志覆盖范围</h3>
            <div><span>首个事件</span><time>{firstLog?.createdAt ?? '—'}</time></div>
            <div><span>最新事件</span><time>{latestLog?.createdAt ?? '—'}</time></div>
            <div><span>任务开始</span><time>{task.startedAt ?? '—'}</time></div>
            <div><span>任务结束</span><time>{task.finishedAt ?? '—'}</time></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
