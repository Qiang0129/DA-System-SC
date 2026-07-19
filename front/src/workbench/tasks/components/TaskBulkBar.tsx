import { GitCompareArrows, Star } from 'lucide-react';

type Props = {
  count: number;
  onRetry: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onCompare: () => void;
  onClear: () => void;
};

export function TaskBulkBar({ count, onRetry, onCancel, onDelete, onFavorite, onCompare, onClear }: Props) {
  if (count <= 0) return null;
  return (
    <section className="task-bulk-bar" aria-label="批量操作">
      <span>已选 {count} 个任务</span>
      <div>
        <button type="button" className="btn btn-secondary" onClick={onFavorite}>
          <Star size={15} aria-hidden="true" /> 关注
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCompare}>
          <GitCompareArrows size={15} aria-hidden="true" /> 加入对比
        </button>
        <button type="button" className="btn btn-secondary" onClick={onRetry}>批量重试</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>批量取消</button>
        <button type="button" className="btn btn-danger" onClick={onDelete}>批量删除</button>
        <button type="button" className="btn btn-secondary" onClick={onClear}>清空选择</button>
      </div>
    </section>
  );
}
