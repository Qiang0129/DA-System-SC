import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, NotebookPen, Plus, Star, Tag, X } from 'lucide-react';
import { SelectField } from '../../../components/SelectField';
import type { TaskLocalMeta } from '../taskLocalMeta';
import type { AnalysisTask, AnalysisTaskLog } from '../types';
import {
  buildPipelineState,
  canCancel,
  canDelete,
  canRetry,
  canStart,
  failureReasonLabel,
  formatPercent,
  formatRuntime,
  getTaskRunProgress,
  getStatusMeta,
  stageLabel,
} from '../taskStatus';

type DetailTab = 'overview' | 'params' | 'logs' | 'notes';

type Props = {
  open: boolean;
  task: AnalysisTask | null;
  logs: AnalysisTaskLog[];
  localMeta: TaskLocalMeta;
  loadingLogs?: boolean;
  onClose: () => void;
  onStart: (task: AnalysisTask) => void;
  onCancel: (task: AnalysisTask) => void;
  onRetry: (task: AnalysisTask) => void;
  onClone: (task: AnalysisTask) => void;
  onDelete: (task: AnalysisTask) => void;
  onOpenResults: (task: AnalysisTask) => void;
  onOpenExport: (task: AnalysisTask) => void;
  onOpenReport: (task: AnalysisTask) => void;
  onUpdateLocalMeta: (patch: Partial<TaskLocalMeta>) => void;
};

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'overview', label: '任务概览' },
  { key: 'params', label: '参数与数据' },
  { key: 'logs', label: '执行记录' },
  { key: 'notes', label: '研究备注' },
];

export function TaskDetailDrawer({
  open,
  task,
  logs,
  localMeta,
  loadingLogs,
  onClose,
  onStart,
  onCancel,
  onRetry,
  onClone,
  onDelete,
  onOpenResults,
  onOpenExport,
  onOpenReport,
  onUpdateLocalMeta,
}: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    setActiveTab('overview');
    setNewTag('');
  }, [task?.id]);

  if (!open || !task) return null;

  const meta = getStatusMeta(task.status);
  const runProgress = getTaskRunProgress(task);
  const pipeline = buildPipelineState(task);
  const params = task.params || {};
  const tags = localMeta.tags || [];

  function addTag() {
    const tag = newTag.trim().slice(0, 20);
    if (!tag || tags.includes(tag)) return;
    onUpdateLocalMeta({ tags: [...tags, tag] });
    setNewTag('');
  }

  return createPortal(
    <div className="task-drawer-root" role="dialog" aria-modal="true" aria-label="任务详情">
      <button type="button" className="task-drawer-mask" aria-label="关闭详情" onClick={onClose} />
      <aside className="task-drawer-panel">
        <header className="task-drawer-header">
          <div>
            <div className="task-drawer-title-row">
              <h2>{task.name}</h2>
              <button
                type="button"
                className={`task-icon-button ${localMeta.favorite ? 'is-active' : ''}`}
                onClick={() => onUpdateLocalMeta({ favorite: !localMeta.favorite })}
                title={localMeta.favorite ? '取消关注' : '关注任务'}
                aria-label={localMeta.favorite ? '取消关注任务' : '关注任务'}
              >
                <Star size={16} fill={localMeta.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            </div>
            <span>#{task.id} · {task.mode} · {task.datasetName}</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="task-detail-tabs" role="tablist" aria-label="任务详情分区">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="task-drawer-body">
          {activeTab === 'overview' ? (
            <>
              <section className="task-detail-block">
                <h3>状态总览</h3>
                <div className="task-detail-grid">
                  <div><span>状态</span><strong className={`task-status-pill tone-${meta.tone}`}>{meta.label}</strong></div>
                  <div><span>总体进度</span><strong>{Math.round(task.progress || 0)}%</strong></div>
                  <div><span>当前轮次</span><strong>{runProgress.current > 0 ? `第 ${runProgress.current}/${runProgress.total} 轮` : `等待开始，共 ${runProgress.total} 轮`}</strong></div>
                  <div><span>当前迭代</span><strong>{task.currentIter}/{task.maxIter}</strong></div>
                  <div><span>当前阶段</span><strong>{stageLabel(task.currentStage)}</strong></div>
                  <div><span>耗时</span><strong>{formatRuntime(task.runtimeSeconds)}</strong></div>
                  <div><span>创建时间</span><strong>{task.createdAt || '-'}</strong></div>
                  <div><span>开始 / 结束</span><strong>{task.startedAt || '-'} / {task.finishedAt || '-'}</strong></div>
                </div>
                {task.errorMessage ? (
                  <div className="task-error-box">
                    <strong>{failureReasonLabel(task.failureReason)}</strong>
                    <p>{task.errorMessage}</p>
                  </div>
                ) : null}
              </section>

              <section className="task-detail-block">
                <h3>执行流水线</h3>
                <div className="task-pipeline-list">
                  {pipeline.map((step, index) => (
                    <article key={step.key} className={`task-pipeline-item state-${step.state}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <small>{step.state === 'done' ? '完成' : step.state === 'running' ? '进行中' : step.state === 'failed' ? '失败' : '等待'}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {task.metricsSummary ? (
                <section className="task-detail-block">
                  <h3>指标摘要</h3>
                  <div className="task-metric-grid">
                    <div><span>ACC</span><strong>{formatPercent(task.metricsSummary.acc)}</strong></div>
                    <div><span>NMI</span><strong>{formatPercent(task.metricsSummary.nmi)}</strong></div>
                    <div><span>ARI</span><strong>{formatPercent(task.metricsSummary.ari)}</strong></div>
                    <div><span>F1</span><strong>{formatPercent(task.metricsSummary.f1)}</strong></div>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === 'params' ? (
            <>
              <section className="task-detail-block">
                <h3>任务参数</h3>
                <dl className="task-param-grid">
                  {Object.entries(params).map(([key, value]) => (
                    <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>
                  ))}
                </dl>
              </section>
              <section className="task-detail-block">
                <h3>数据集快照</h3>
                <div className="task-detail-grid">
                  <div><span>数据集</span><strong>{task.datasetName}</strong></div>
                  <div><span>算法模式</span><strong>{task.mode}</strong></div>
                  <div><span>基础聚类</span><strong>n_base = {String(params.nBase ?? '-')}</strong></div>
                  <div><span>运行次数</span><strong>{String(params.runs ?? '-')}</strong></div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === 'logs' ? (
            <section className="task-detail-block">
              <h3>运行日志</h3>
              <div className="task-log-list">
                {loadingLogs ? <p>日志加载中...</p> : null}
                {!loadingLogs && logs.length === 0 ? <p>暂无日志</p> : null}
                {logs.map((log) => (
                  <article key={log.id} className={`task-log-item level-${log.level}`}>
                    <header><strong>{log.action}</strong><span>{log.createdAt}</span></header>
                    <p>{log.message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === 'notes' ? (
            <section className="task-detail-block task-local-meta-block">
              <div className="task-local-meta-heading">
                <div>
                  <span><NotebookPen size={16} aria-hidden="true" /> 本地管理信息</span>
                  <p>仅保存在当前浏览器会话，不会影响服务端任务调度。</p>
                </div>
                <Bookmark size={18} aria-hidden="true" />
              </div>

              <SelectField
                className="task-form-field"
                label="本地优先级"
                value={localMeta.priority || 'normal'}
                options={[
                  { value: 'high', label: '高优先级' },
                  { value: 'normal', label: '常规优先级' },
                  { value: 'low', label: '低优先级' },
                ]}
                onChange={(value) => onUpdateLocalMeta({ priority: value as TaskLocalMeta['priority'] })}
              />

              <div className="task-tag-editor">
                <span><Tag size={15} aria-hidden="true" /> 任务标签</span>
                <div className="task-tag-list">
                  {tags.length === 0 ? <small>尚未添加标签</small> : null}
                  {tags.map((tag) => (
                    <span key={tag} className="task-local-tag">
                      {tag}
                      <button type="button" onClick={() => onUpdateLocalMeta({ tags: tags.filter((item) => item !== tag) })} aria-label={`删除标签 ${tag}`}>
                        <X size={12} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="task-add-tag">
                  <input
                    aria-label="新增任务标签"
                    value={newTag}
                    maxLength={20}
                    placeholder="例如：待复核"
                    onChange={(event) => setNewTag(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <button type="button" onClick={addTag} aria-label="添加任务标签" title="添加任务标签">
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <label className="task-form-field">
                <span>研究备注</span>
                <textarea
                  aria-label="研究备注内容"
                  value={localMeta.note || ''}
                  placeholder="记录本次实验的假设、观察或后续复核事项。"
                  onChange={(event) => onUpdateLocalMeta({ note: event.target.value.slice(0, 1000) })}
                />
              </label>
            </section>
          ) : null}
        </div>

        <footer className="task-drawer-footer">
          {canStart(task.status) ? <button type="button" className="btn btn-primary" onClick={() => onStart(task)}>启动</button> : null}
          {canCancel(task.status) ? <button type="button" className="btn btn-secondary" onClick={() => onCancel(task)}>取消</button> : null}
          {canRetry(task.status) ? <button type="button" className="btn btn-primary" onClick={() => onRetry(task)}>重试</button> : null}
          <button type="button" className="btn btn-secondary" onClick={() => onClone(task)}>克隆</button>
          {task.status === 'succeeded' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => onOpenResults(task)}>结果分析</button>
              <button type="button" className="btn btn-secondary" onClick={() => onOpenExport(task)}>结果导出</button>
              <button type="button" className="btn btn-secondary" onClick={() => onOpenReport(task)}>分析报告</button>
            </>
          ) : null}
          {canDelete(task.status) ? <button type="button" className="btn btn-danger" onClick={() => onDelete(task)}>删除</button> : null}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
