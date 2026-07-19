import { ArrowRight, CirclePlus, Database, FileStack } from 'lucide-react';

type Props = {
  onCreate: () => void;
  onUseTemplate: () => void;
  onOpenDatasets: () => void;
};

export function TaskEmptyState({ onCreate, onUseTemplate, onOpenDatasets }: Props) {
  return (
    <section className="task-empty-state panel" aria-label="任务创建引导">
      <div className="task-empty-copy">
        <span className="task-empty-kicker">实验工作流从这里开始</span>
        <h2>从第一个分析任务开始</h2>
        <p>任务会固定本次的数据集、算法模式和核心参数，后续可在同一处跟踪进度、诊断异常和查看结果。</p>
        <div className="task-empty-actions">
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <CirclePlus size={16} aria-hidden="true" />
            新建分析任务
          </button>
          <button type="button" className="btn btn-secondary" onClick={onUseTemplate}>
            <FileStack size={16} aria-hidden="true" />
            从模板创建
          </button>
        </div>
      </div>

      <ol className="task-empty-steps">
        <li>
          <span>1</span>
          <div>
            <strong>选择数据集并确认质量状态</strong>
            <small>导入基础聚类结果后，先核查样本、标签与基础聚类数量。</small>
          </div>
          <button type="button" onClick={onOpenDatasets} title="前往数据管理" aria-label="前往数据管理">
            <Database size={16} aria-hidden="true" />
          </button>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>配置 OMELET 分析参数</strong>
            <small>选择算法模式，设置 n_base、核函数相关参数、运行次数与迭代上限。</small>
          </div>
          <ArrowRight size={16} aria-hidden="true" />
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>追踪运行并交付结果</strong>
            <small>在任务详情中查看进度、日志、指标摘要和后续结果入口。</small>
          </div>
          <ArrowRight size={16} aria-hidden="true" />
        </li>
      </ol>
    </section>
  );
}
