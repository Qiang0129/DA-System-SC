export type TaskPriority = 'high' | 'normal' | 'low';

export type TaskLocalMeta = {
  favorite?: boolean;
  priority?: TaskPriority;
  tags?: string[];
  note?: string;
};

export type TaskLocalMetaMap = Record<number, TaskLocalMeta>;

const STORAGE_KEY = 'soft_web_task_center_local_meta';

export function loadTaskLocalMeta(): TaskLocalMetaMap {
  if (typeof window === 'undefined') return {};

  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTaskLocalMeta(meta: TaskLocalMetaMap) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // 本地辅助信息写入失败时不影响真实任务操作。
  }
}

export function getTaskPriorityLabel(priority?: TaskPriority) {
  if (priority === 'high') return '高优先级';
  if (priority === 'low') return '低优先级';
  return '常规优先级';
}
