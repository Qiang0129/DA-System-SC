import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Database, FileStack, Settings2, Trash2 } from 'lucide-react';
import { SelectField } from '../../../components/SelectField';
import type { CreateTaskPayload, DatasetOption, TaskMode, TaskParams, TaskTemplate } from '../types';

type CreateStep = 1 | 2 | 3;

type Props = {
  open: boolean;
  datasets: DatasetOption[];
  templates: TaskTemplate[];
  initialDatasetId?: number | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTaskPayload, saveAsTemplateName?: string) => Promise<void> | void;
  onDeleteTemplate: (template: TaskTemplate) => void;
};

const DEFAULT_PARAMS: TaskParams = {
  nBase: 20,
  sigma: 1,
  lambda: 5,
  gamma: 5,
  anchor: 10,
  runs: 10,
  maxIter: 10,
  randomSeed: 1,
};

const STEPS: Array<{ key: CreateStep; label: string; icon: typeof Database }> = [
  { key: 1, label: '选择数据', icon: Database },
  { key: 2, label: '配置算法', icon: Settings2 },
  { key: 3, label: '确认执行', icon: CheckCircle2 },
];

export function TaskCreateDrawer({
  open,
  datasets,
  templates,
  initialDatasetId,
  submitting,
  onClose,
  onSubmit,
  onDeleteTemplate,
}: Props) {
  const [step, setStep] = useState<CreateStep>(1);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<TaskMode>('OMELET-SV');
  const [datasetId, setDatasetId] = useState('');
  const [params, setParams] = useState<TaskParams>(DEFAULT_PARAMS);
  const [startImmediately, setStartImmediately] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [error, setError] = useState('');

  const selectedDataset = useMemo(
    () => datasets.find((item) => String(item.id) === datasetId) || null,
    [datasets, datasetId],
  );

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError('');
    setTemplateName('');
    if (initialDatasetId) {
      setDatasetId(String(initialDatasetId));
    } else if (datasets[0]) {
      setDatasetId(String(datasets[0].id));
    }
  }, [open, initialDatasetId, datasets]);

  useEffect(() => {
    if (!selectedDataset) return;
    setParams((prev) => ({ ...prev, nBase: Math.min(prev.nBase || 20, selectedDataset.baseCount || 20) }));
    if (!name.trim()) setName(`${selectedDataset.name} ${mode} 任务`);
  }, [selectedDataset?.id, mode]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => String(item.id) === id);
    if (!template) return;
    setMode((template.mode as TaskMode) || 'OMELET-SV');
    setParams({
      ...DEFAULT_PARAMS,
      ...template.params,
      lambda: Number(template.params.lambda ?? DEFAULT_PARAMS.lambda),
      nBase: Number(template.params.nBase ?? DEFAULT_PARAMS.nBase),
      sigma: Number(template.params.sigma ?? DEFAULT_PARAMS.sigma),
      gamma: Number(template.params.gamma ?? DEFAULT_PARAMS.gamma),
      anchor: Number(template.params.anchor ?? DEFAULT_PARAMS.anchor),
      runs: Number(template.params.runs ?? DEFAULT_PARAMS.runs),
      maxIter: Number(template.params.maxIter ?? DEFAULT_PARAMS.maxIter),
      randomSeed: Number(template.params.randomSeed ?? DEFAULT_PARAMS.randomSeed),
    });
  }

  function validateData() {
    if (!datasetId) {
      setError('请选择数据集');
      return false;
    }
    if (selectedDataset?.qualityStatus === 'error') {
      setError('该数据集质量检查未通过，无法创建任务');
      return false;
    }
    if (selectedDataset?.hasLabels === false || (selectedDataset?.classCount ?? 0) < 2) {
      setError('真实 OMELET 分析需要包含至少两个类别的 y 标签');
      return false;
    }
    return true;
  }

  function validateParams() {
    if (!selectedDataset) return false;
    if (!Number.isFinite(params.nBase) || params.nBase < 1 || params.nBase > selectedDataset.baseCount) {
      setError(`n_base 应为 1 到 ${selectedDataset.baseCount} 之间的整数`);
      return false;
    }
    if ([params.sigma, params.lambda, params.gamma, params.runs, params.maxIter].some((value) => !Number.isFinite(value) || value <= 0)) {
      setError('sigma、lambda、gamma、runs 与 max_iter 必须大于 0');
      return false;
    }
    if (!Number.isInteger(params.randomSeed) || params.randomSeed < 0) {
      setError('random_seed 必须是大于或等于 0 的整数');
      return false;
    }
    if (mode === 'OMELET-SV' && (!Number.isFinite(params.anchor) || params.anchor < 1)) {
      setError('OMELET-SV 的 anchor 必须大于 0');
      return false;
    }
    return true;
  }

  function nextStep() {
    setError('');
    if (step === 1 && !validateData()) return;
    if (step === 2 && !validateParams()) return;
    setStep((current) => Math.min(3, current + 1) as CreateStep);
  }

  async function handleSubmit() {
    setError('');
    if (!validateData() || !validateParams()) return;

    const payload: CreateTaskPayload = {
      datasetId: Number(datasetId),
      name: name.trim() || undefined,
      mode,
      startImmediately,
      templateId: templateId ? Number(templateId) : undefined,
      params: {
        nBase: Number(params.nBase),
        sigma: Number(params.sigma),
        lambda: Number(params.lambda),
        gamma: Number(params.gamma),
        anchor: mode === 'OMELET-SV' ? Number(params.anchor) : 0,
        runs: Number(params.runs),
        maxIter: Number(params.maxIter),
        randomSeed: Number(params.randomSeed),
      },
    };

    try {
      await onSubmit(payload, templateName.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="task-drawer-root" role="dialog" aria-modal="true" aria-label="新建任务">
      <button type="button" className="task-drawer-mask" aria-label="关闭新建任务" onClick={onClose} />
      <aside className="task-drawer-panel create">
        <header className="task-drawer-header">
          <div>
            <h2>新建分析任务</h2>
            <span>将数据集、算法参数和执行计划整理为可追踪的实验任务。</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>关闭</button>
        </header>

        <div className="task-create-stepper" aria-label="创建任务步骤">
          {STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className={step === item.key ? 'active' : step > item.key ? 'done' : ''}>
                <span><Icon size={15} aria-hidden="true" /></span>
                <strong>{item.key} {item.label}</strong>
              </div>
            );
          })}
        </div>

        <div className="task-drawer-body">
          {step === 1 ? (
            <>
              <label className="task-form-field">
                <span>任务名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Ionosphere OMELET-SV 任务" />
              </label>

              <SelectField
                className="task-form-field"
                label="选择数据集"
                value={datasetId}
                options={[
                  { value: '', label: '请选择数据集' },
                  ...datasets.map((item) => ({
                    value: String(item.id),
                    label: `${item.name}（m=${item.baseCount}, n=${item.sampleCount}${item.hasLabels ? `，${item.classCount} 类标签` : '，无标签'}${item.qualityStatus === 'error' ? '，质量异常' : ''}）`,
                  })),
                ]}
                onChange={setDatasetId}
              />

              {selectedDataset ? (
                <section className={`task-dataset-snapshot quality-${selectedDataset.qualityStatus}`}>
                  <header><Database size={16} aria-hidden="true" /><strong>{selectedDataset.name}</strong></header>
                  <dl>
                    <div><dt>样本数量</dt><dd>{selectedDataset.sampleCount}</dd></div>
                    <div><dt>基础聚类</dt><dd>{selectedDataset.baseCount}</dd></div>
                    <div><dt>质量状态</dt><dd>{selectedDataset.qualityStatus === 'error' ? '需处理' : selectedDataset.qualityStatus === 'warning' ? '待确认' : '检查通过'}</dd></div>
                  </dl>
                  {selectedDataset.qualityIssues?.length ? <p>{selectedDataset.qualityIssues.join('；')}</p> : null}
                </section>
              ) : null}

              <section className="task-template-picker">
                <div className="task-template-picker-heading"><FileStack size={16} aria-hidden="true" /><strong>参数模板</strong></div>
                <SelectField
                  className="task-form-field"
                  label="从模板填充"
                  value={templateId}
                  options={[
                    { value: '', label: '不使用模板' },
                    ...templates.map((item) => ({
                      value: String(item.id),
                      label: `${item.name} (${item.mode})`,
                    })),
                  ]}
                  onChange={applyTemplate}
                />
                {templates.length > 0 ? (
                  <div className="task-template-list">
                    {templates.map((item) => (
                      <div key={item.id}>
                        <span>{item.name} · {item.mode}</span>
                        <button type="button" title="删除模板" aria-label={`删除模板 ${item.name}`} onClick={() => onDeleteTemplate(item)}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <small>尚无已保存模板，可在最后一步保存当前参数。</small>}
              </section>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <section className="task-mode-control" aria-label="算法模式">
                {(['OMELET', 'OMELET-SV'] as TaskMode[]).map((item) => (
                  <button key={item} type="button" className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>
                ))}
              </section>
              <p className="task-parameter-note">OMELET-SV 适用于大规模数据并启用 anchor；OMELET 使用完整相似性计算。</p>
              <div className="task-create-grid">
                {(
                  [
                    ['nBase', 'n_base', 1, 1],
                    ['sigma', 'sigma', 0.1, 0.1],
                    ['lambda', 'lambda', 0.1, 0.1],
                    ['gamma', 'gamma', 0.1, 0.1],
                    ['runs', 'runs', 1, 1],
                    ['maxIter', 'max_iter', 1, 1],
                    ['randomSeed', 'random_seed', 0, 1],
                  ] as const
                ).map(([key, label, min, stepValue]) => (
                  <label key={key} className="task-form-field">
                    <span>{label}</span>
                    <input type="number" min={min} step={stepValue} value={params[key]} onChange={(event) => setParams((prev) => ({ ...prev, [key]: Number(event.target.value) }))} />
                  </label>
                ))}
                {mode === 'OMELET-SV' ? (
                  <label className="task-form-field">
                    <span>anchor</span>
                    <input type="number" min={1} step={1} value={params.anchor} onChange={(event) => setParams((prev) => ({ ...prev, anchor: Number(event.target.value) }))} />
                  </label>
                ) : null}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <section className="task-create-summary">
                <header><CheckCircle2 size={17} aria-hidden="true" /><strong>执行摘要</strong></header>
                <dl>
                  <div><dt>任务</dt><dd>{name || '未命名任务'}</dd></div>
                  <div><dt>数据集</dt><dd>{selectedDataset?.name || '-'}</dd></div>
                  <div><dt>算法</dt><dd>{mode}</dd></div>
                  <div><dt>运行次数</dt><dd>{params.runs}</dd></div>
                  <div><dt>迭代上限</dt><dd>{params.maxIter}</dd></div>
                  <div><dt>基础聚类</dt><dd>{params.nBase}</dd></div>
                </dl>
              </section>
              <label className="task-check-field">
                <input type="checkbox" checked={startImmediately} onChange={(event) => setStartImmediately(event.target.checked)} />
                <span>创建后立即启动</span>
              </label>
              <label className="task-form-field">
                <span>同时保存为模板（可选）</span>
                <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="例如 默认 OMELET-SV 参数" />
              </label>
            </>
          ) : null}

          {error ? <div className="task-error-box">{error}</div> : null}
        </div>

        <footer className="task-drawer-footer">
          {step > 1 ? (
            <button type="button" className="btn btn-secondary" onClick={() => setStep((current) => Math.max(1, current - 1) as CreateStep)}>
              <ChevronLeft size={16} aria-hidden="true" /> 上一步
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={nextStep}>
              下一步 <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!!submitting} onClick={handleSubmit}>
              {submitting ? '提交中...' : startImmediately ? '创建并启动任务' : '创建任务草稿'}
            </button>
          )}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
