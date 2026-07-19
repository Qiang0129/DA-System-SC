import type { AnalysisTask, TaskStatus } from './types';

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; tone: string; description: string }
> = {
  draft: { label: '草稿', tone: 'neutral', description: '已创建，待启动' },
  queued: { label: '排队中', tone: 'info', description: '等待执行资源' },
  running: { label: '运行中', tone: 'running', description: '正在执行分析' },
  succeeded: { label: '成功', tone: 'success', description: '已完成并可查看结果' },
  failed: { label: '失败', tone: 'danger', description: '执行失败，可重试' },
  cancelled: { label: '已取消', tone: 'muted', description: '用户取消' },
};

export const PIPELINE_STAGES = [
  { key: 'select_base', label: '选择基础聚类结果' },
  { key: 'build_ca', label: 'GBE 编码与 CA 构建' },
  { key: 'multi_kernel', label: '多核相似性学习' },
  { key: 'evaluate', label: '谱聚类与指标评估' },
  { key: 'persist', label: '结果落盘' },
] as const;

export function getStatusMeta(status: string) {
  return TASK_STATUS_META[(status as TaskStatus) in TASK_STATUS_META ? (status as TaskStatus) : 'draft'];
}

export function canStart(status: string) {
  return status === 'draft' || status === 'failed' || status === 'cancelled';
}

export function canCancel(status: string) {
  return status === 'queued' || status === 'running';
}

export function canRetry(status: string) {
  return status === 'failed' || status === 'cancelled';
}

export function canDelete(status: string) {
  return status === 'draft' || status === 'failed' || status === 'cancelled' || status === 'succeeded';
}

export function canEdit(status: string) {
  return status === 'draft' || status === 'failed' || status === 'cancelled';
}

export function formatRuntime(seconds?: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return '-';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds - mins * 60;
  return `${mins}m ${rest.toFixed(0)}s`;
}

export function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function stageLabel(stage?: string | null) {
  if (!stage) return '未开始';
  return PIPELINE_STAGES.find((item) => item.key === stage)?.label ?? stage;
}

export function getTaskRunProgress(task: AnalysisTask) {
  const configuredTotal = Number(task.totalRuns ?? task.params.runs ?? 1);
  const total = Number.isFinite(configuredTotal) ? Math.max(1, Math.trunc(configuredTotal)) : 1;
  const reportedCurrent = Number(task.currentRun ?? 0);
  let current = Number.isFinite(reportedCurrent) ? Math.trunc(reportedCurrent) : 0;

  // running 状态刚建立时，首个算法事件可能还未写回 currentRun，此时已经处于第 1 轮。
  if (task.status === 'running' && current < 1) current = 1;
  if (task.status === 'succeeded') current = total;

  return { current: Math.max(0, Math.min(total, current)), total };
}

export function failureReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'param_error':
      return '参数错误';
    case 'quality_error':
      return '数据质量不通过';
    case 'execution_error':
      return '执行异常';
    case 'timeout':
      return '执行超时';
    default:
      return reason || '未知原因';
  }
}

export function buildPipelineState(task: AnalysisTask) {
  const currentKey = task.currentStage;
  const currentIndex = PIPELINE_STAGES.findIndex((item) => item.key === currentKey);
  return PIPELINE_STAGES.map((stage, index) => {
    let state: 'done' | 'running' | 'pending' | 'failed' = 'pending';
    if (task.status === 'succeeded') {
      state = 'done';
    } else if (task.status === 'failed') {
      if (currentIndex < 0) state = index === 0 ? 'failed' : 'pending';
      else if (index < currentIndex) state = 'done';
      else if (index === currentIndex) state = 'failed';
      else state = 'pending';
    } else if (task.status === 'running' || task.status === 'queued') {
      if (currentIndex < 0) state = index === 0 ? 'running' : 'pending';
      else if (index < currentIndex) state = 'done';
      else if (index === currentIndex) state = 'running';
      else state = 'pending';
    } else if (task.status === 'cancelled') {
      if (currentIndex >= 0 && index <= currentIndex) state = index === currentIndex ? 'failed' : 'done';
    }
    return { ...stage, state };
  });
}
