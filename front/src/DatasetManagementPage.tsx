import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eye,
  Grid3x3,
  List,
  PencilLine,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getStoredAccessToken } from './api/auth';
import { API_BASE_URL } from './api/config';
import { SelectField } from './components/SelectField';

const API = API_BASE_URL;
const DATASET_RENDER_LIMIT = 60;
const DATASET_TYPE_OPTIONS = [
  { value: '全部', label: '全部' },
  { value: '数值', label: '数值' },
  { value: '混合', label: '混合' },
];

type ClusterStat = {
  name: string;
  clusterCount: number;
  range: string;
};

type LabelDistributionItem = {
  label: string;
  count: number;
  percent: number;
};

type DatasetCatalogItem = {
  id: string;
  name: string;
  createdAt: string;
  fileSizeBytes: number;
  sampleCount: number;
  baseCount: number;
  classCount: number;
  hasLabels: boolean;
  dataType: '数值' | '混合';
  taskCount: number;
  lastAnalysisAt: string | null;
  version: number;
  qualityStatus: 'ready' | 'warning' | 'error';
  qualityIssues: string[];
  matrixShape: string;
  labelShape: string;
  labelDistribution: LabelDistributionItem[];
  clusterStats: ClusterStat[];
};

type RawDatasetCatalogItem = Partial<DatasetCatalogItem> & {
  id: string | number;
};

type DatasetCatalogPayload = RawDatasetCatalogItem[] | {
  items?: RawDatasetCatalogItem[];
};

function extractDatasetItems(payload: DatasetCatalogPayload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload.items) ? payload.items : [];
}

function buildInitialSelectedBases(total: number) {
  return Array.from({ length: Math.min(20, Math.max(0, total)) }, (_, index) => index + 1);
}

type RenameDialogProps = {
  dataset: DatasetCatalogItem;
  onClose: () => void;
  onSubmit: (nextName: string) => Promise<void>;
};

function DatasetRenameDialog({ dataset, onClose, onSubmit }: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftName, setDraftName] = useState(dataset.name);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDraftName(dataset.name);
    setLocalError('');
    setSubmitting(false);
  }, [dataset.id, dataset.name]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [dataset.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = draftName.trim();
    if (!nextName) {
      setLocalError('请输入新的数据集名称');
      return;
    }

    if (nextName === dataset.name) {
      setLocalError('名称没有变化');
      return;
    }

    setSubmitting(true);
    setLocalError('');

    try {
      await onSubmit(nextName);
    } catch (err) {
      setSubmitting(false);
      setLocalError(err instanceof Error ? err.message : '重命名失败');
    }
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const trimmedName = draftName.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== dataset.name && !submitting;

  return createPortal(
    <div className="dataset-rename-modal" role="presentation" onClick={submitting ? undefined : onClose}>
      <div
        className="dataset-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataset-rename-title"
        aria-describedby="dataset-rename-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dataset-rename-header">
          <span className="dataset-rename-icon" aria-hidden="true">
            <PencilLine size={18} />
          </span>
          <div className="dataset-rename-copy">
            <h3 id="dataset-rename-title">重命名数据集</h3>
            <p id="dataset-rename-description">修改后会同步更新列表、详情页和后续任务引用。</p>
          </div>
        </div>

        <div className="dataset-rename-summary" aria-label="当前数据集信息">
          <span>{dataset.createdAt}</span>
          <span>{formatFileSize(dataset.fileSizeBytes)}</span>
          <span>{dataset.dataType}</span>
          <span className={`dataset-label-tag ${dataset.hasLabels ? 'has-labels' : ''}`}>
            <span className={`dataset-status-dot ${dataset.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
            {dataset.hasLabels ? '有标签' : '无标签'}
          </span>
        </div>

        <form className="dataset-rename-form" onSubmit={handleSubmit}>
          <label className="dataset-rename-field">
            <span>新名称</span>
            <input
              ref={inputRef}
              className="dataset-rename-input"
              type="text"
              value={draftName}
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(localError)}
              aria-describedby={localError ? 'dataset-rename-error' : undefined}
              onChange={(event) => {
                setDraftName(event.target.value);
                if (localError) {
                  setLocalError('');
                }
              }}
            />
          </label>

          {localError ? (
            <p className="dataset-rename-error" id="dataset-rename-error" role="alert">
              {localError}
            </p>
          ) : null}

          <div className="dataset-rename-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

type DeleteDialogProps = {
  dataset: DatasetCatalogItem;
  onClose: () => void;
  onSubmit: () => Promise<void>;
};

function DatasetDeleteDialog({ dataset, onClose, onSubmit }: DeleteDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLocalError('');
    setSubmitting(false);
  }, [dataset.id]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => confirmButtonRef.current?.focus());

    return () => window.cancelAnimationFrame(raf);
  }, [dataset.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setLocalError('');

    try {
      await onSubmit();
    } catch (err) {
      setSubmitting(false);
      setLocalError(err instanceof Error ? err.message : '删除失败，请稍后重试');
    }
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="dataset-delete-modal" role="presentation" onClick={submitting ? undefined : onClose}>
      <div
        className="dataset-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dataset-delete-title"
        aria-describedby="dataset-delete-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dataset-delete-header">
          <span className="dataset-delete-icon" aria-hidden="true">
            <Trash2 size={18} />
          </span>
          <div className="dataset-delete-copy">
            <h3 id="dataset-delete-title">删除数据集</h3>
            <p id="dataset-delete-description">删除后将无法恢复，请确认目标数据集无误。</p>
          </div>
        </div>

        <div className="dataset-delete-target" aria-label="待删除数据集">
          <span>待删除数据集</span>
          <strong>{dataset.name}</strong>
          <small>{dataset.sampleCount} 个样本 · {dataset.baseCount} 个基础聚类</small>
        </div>

        {localError ? (
          <p className="dataset-delete-error" role="alert">{localError}</p>
        ) : null}

        <form className="dataset-delete-actions" onSubmit={handleSubmit}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button ref={confirmButtonRef} type="submit" className="btn dataset-delete-confirm" disabled={submitting}>
            <Trash2 size={15} aria-hidden="true" />
            {submitting ? '删除中…' : '确认删除'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function selectBases(total: number, count: number, seed: number) {
  const ids = Array.from({ length: total }, (_, index) => index + 1);
  let state = Math.abs(Math.trunc(seed)) || 1;
  for (let index = ids.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids.slice(0, count).sort((left, right) => left - right);
}

function formatBaseName(id: number) {
  return `base_${id}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatMetricWidth(value: number, maximum: number) {
  if (maximum <= 0 || value <= 0) return '0%';
  return `${Math.min(100, Math.max(4, Math.round((value / maximum) * 100)))}%`;
}

function getDatasetMatrixSummary(dataset: DatasetCatalogItem) {
  return dataset.matrixShape || `E: ${dataset.sampleCount} x ${dataset.baseCount}`;
}

function getDatasetLabelSummary(dataset: DatasetCatalogItem) {
  if (!dataset.hasLabels) return '无标签';
  return dataset.labelShape || (dataset.classCount > 0 ? `${dataset.classCount} 类` : '有标签');
}

function getDatasetUsageSummary(dataset: DatasetCatalogItem) {
  if (dataset.taskCount <= 0) return '未使用';
  return dataset.lastAnalysisAt ? `${dataset.taskCount} 任务 · ${dataset.lastAnalysisAt}` : `${dataset.taskCount} 任务`;
}

function getDatasetQualityPresentation(dataset: DatasetCatalogItem) {
  if (dataset.qualityStatus === 'error') {
    return { label: '需处理', description: dataset.qualityIssues.join('；') || '数据检查未通过' };
  }

  if (dataset.qualityStatus === 'warning') {
    return { label: '待确认', description: dataset.qualityIssues.join('；') || '存在需要确认的数据项' };
  }

  return { label: '检查通过', description: '基础聚类矩阵可用于创建任务' };
}

function normalizeDataset(raw: RawDatasetCatalogItem): DatasetCatalogItem {
  const hasLabels = Boolean(raw.hasLabels);
  const sampleCount = Number(raw.sampleCount) || 0;
  const baseCount = Number(raw.baseCount) || 0;

  return {
    id: String(raw.id),
    name: raw.name ?? '未命名数据集',
    createdAt: raw.createdAt ?? '',
    fileSizeBytes: Number(raw.fileSizeBytes) || 0,
    sampleCount,
    baseCount,
    classCount: hasLabels ? Number(raw.classCount) || 0 : 0,
    hasLabels,
    dataType: raw.dataType === '混合' ? '混合' : '数值',
    taskCount: Number(raw.taskCount) || 0,
    lastAnalysisAt: raw.lastAnalysisAt ?? null,
    version: Math.max(1, Number(raw.version) || 1),
    qualityStatus: raw.qualityStatus === 'warning' || raw.qualityStatus === 'error' ? raw.qualityStatus : 'ready',
    qualityIssues: Array.isArray(raw.qualityIssues) ? raw.qualityIssues : [],
    matrixShape: raw.matrixShape ?? `E: ${sampleCount} x ${baseCount}`,
    labelShape: hasLabels ? raw.labelShape ?? `y: ${sampleCount}` : '',
    labelDistribution: Array.isArray(raw.labelDistribution) ? raw.labelDistribution : [],
    clusterStats: Array.isArray(raw.clusterStats) ? raw.clusterStats : [],
  };
}

function getAuthHeaders() {
  const token = getStoredAccessToken();
  if (!token) {
    throw new Error('请先登录后操作数据集');
  }
  return { Authorization: `Bearer ${token}` };
}

function normalizeTypeFilter(value: string | null): '全部' | '数值' | '混合' {
  return value === '数值' || value === '混合' ? value : '全部';
}

function normalizeViewMode(value: string | null): 'list' | 'card' {
  return value === 'card' ? 'card' : 'list';
}

/* ========== 卡片网格视图 ========== */

function DatasetCardGrid({
  datasets,
  onSelect,
  onUpdate,
  onDelete,
  emptyMessage,
  actionDisabled,
}: {
  datasets: DatasetCatalogItem[];
  onSelect: (id: string) => void;
  onUpdate: (dataset: DatasetCatalogItem) => void;
  onDelete: (dataset: DatasetCatalogItem) => void;
  emptyMessage: string;
  actionDisabled: boolean;
}) {
  const metricMaximums = useMemo(
    () =>
      datasets.reduce(
        (max, dataset) => ({
          sampleCount: Math.max(max.sampleCount, dataset.sampleCount),
          baseCount: Math.max(max.baseCount, dataset.baseCount),
          classCount: Math.max(max.classCount, dataset.classCount),
        }),
        { sampleCount: 0, baseCount: 0, classCount: 0 },
      ),
    [datasets],
  );

  return (
    <div className="dataset-card-grid">
      {datasets.length === 0 ? (
        <div className="dataset-table-empty">{emptyMessage}</div>
      ) : (
        datasets.map((d) => {
          const metrics = [
            { key: 'n', value: d.sampleCount, maximum: metricMaximums.sampleCount },
            { key: 'm', value: d.baseCount, maximum: metricMaximums.baseCount },
            { key: 'c', value: d.classCount, maximum: metricMaximums.classCount },
          ];
          const facts = [
            { label: '矩阵', value: getDatasetMatrixSummary(d) },
            { label: '标签', value: getDatasetLabelSummary(d) },
            { label: '任务', value: getDatasetUsageSummary(d) },
          ];

          const quality = getDatasetQualityPresentation(d);

          return (
            <div
              key={d.id}
              className="dataset-card"
            >
              <div className="dataset-card-top">
                <div className="dataset-card-title-block">
                  <strong>{d.name}</strong>
                  <small>{d.createdAt} · {formatFileSize(d.fileSizeBytes)}</small>
                </div>
                <span className="dataset-type-tag dataset-card-type">{d.dataType}</span>
              </div>
              <div className="dataset-card-body">
                <div className="dataset-card-metrics" aria-label={`${d.name} 数据规模`}>
                  {metrics.map((metric) => (
                    <div className="dataset-card-metric" key={metric.key}>
                      <div className="dataset-card-metric-head">
                        <span>{metric.key}</span>
                        <strong>{metric.value}</strong>
                      </div>
                      <div className="dataset-metric-bar" aria-hidden="true">
                        <span
                          className="dataset-metric-fill"
                          style={{ width: formatMetricWidth(metric.value, metric.maximum) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dataset-card-facts" aria-label={`${d.name} 元数据`}>
                  {facts.map((fact) => (
                    <div className="dataset-card-fact" key={fact.label}>
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="dataset-card-footer">
                <div className="dataset-card-statuses">
                  <span className={`dataset-label-tag ${d.hasLabels ? 'has-labels' : ''}`}>
                    <span className={`dataset-status-dot ${d.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
                    {d.hasLabels ? '有标签' : '无标签'}
                  </span>
                  <span className={`dataset-quality-status ${d.qualityStatus}`} title={quality.description}>
                    {quality.label}
                  </span>
                </div>
                <div className="dataset-card-actions" aria-label={`${d.name} 操作`}>
                  <button
                    type="button"
                    className="dataset-list-action view"
                    aria-label="查看"
                    title="查看"
                    onClick={() => onSelect(d.id)}
                  >
                    <Eye size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dataset-list-action update"
                    aria-label="更新"
                    title="更新"
                    disabled={actionDisabled}
                    onClick={() => onUpdate(d)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dataset-list-action delete"
                    aria-label="删除"
                    title="删除"
                    disabled={actionDisabled}
                    onClick={() => onDelete(d)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ========== 目录视图 ========== */

function DatasetCatalogView({
  datasets,
  viewMode,
  emptyMessage,
  onSelect,
  onUpdate,
  onDelete,
  onViewModeChange,
  onUpload,
  uploading,
}: {
  datasets: DatasetCatalogItem[];
  viewMode: 'list' | 'card';
  emptyMessage: string;
  onSelect: (id: string) => void;
  onUpdate: (dataset: DatasetCatalogItem) => void;
  onDelete: (dataset: DatasetCatalogItem) => void;
  onViewModeChange: (mode: 'list' | 'card') => void;
  onUpload: () => void;
  uploading: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [typeFilter, setTypeFilter] = useState<'全部' | '数值' | '混合'>(() =>
    normalizeTypeFilter(searchParams.get('type')),
  );

  useEffect(() => {
    const nextSearch = searchParams.get('q') ?? '';
    const nextType = normalizeTypeFilter(searchParams.get('type'));
    setSearch((current) => (current === nextSearch ? current : nextSearch));
    setTypeFilter((current) => (current === nextType ? current : nextType));
  }, [searchParams]);

  function updateCatalogParam(key: 'q' | 'type', value: string) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === '全部') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    updateCatalogParam('q', value.trim());
  }

  function handleTypeChange(value: '全部' | '数值' | '混合') {
    setTypeFilter(value);
    updateCatalogParam('type', value);
  }

  const filtered = useMemo(() => {
    let list = datasets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (typeFilter !== '全部') {
      list = list.filter((d) => d.dataType === typeFilter);
    }
    return list;
  }, [datasets, search, typeFilter]);
  const visibleDatasets = filtered.slice(0, DATASET_RENDER_LIMIT);
  const isLimited = filtered.length > visibleDatasets.length;
  const tableEmptyMessage = datasets.length === 0 ? emptyMessage : '暂无匹配数据集';

  return (
    <div className="dataset-catalog">
      <div className="dataset-toolbar">
        <div className="dataset-toolbar-left">
          <span className="dataset-search-icon" aria-hidden="true">
            <Search size={15} />
          </span>
          <input
            className="dataset-search-input"
            type="text"
            name="datasetSearch"
            placeholder="搜索数据集…"
            autoComplete="off"
            aria-label="搜索数据集"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="dataset-toolbar-center">
          <SelectField
            className="dataset-type-select"
            size="sm"
            value={typeFilter}
            ariaLabel="数据类型筛选"
            options={DATASET_TYPE_OPTIONS}
            onChange={(value) => handleTypeChange(value as typeof typeFilter)}
          />
        </div>

        <div className="dataset-toolbar-segment">
          <button
            type="button"
            className={`dataset-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => { if (viewMode !== 'list') onViewModeChange('list'); }}
            aria-label="列表视图"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            className={`dataset-view-btn ${viewMode === 'card' ? 'active' : ''}`}
            onClick={() => { if (viewMode !== 'card') onViewModeChange('card'); }}
            aria-label="卡片视图"
          >
            <Grid3x3 size={15} />
          </button>
        </div>

        <div className="dataset-toolbar-right">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onUpload}
            disabled={uploading}
          >
            <Upload size={15} aria-hidden="true" />
            {uploading ? '加载中…' : '上传数据集'}
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="dataset-list-grid">
          <div className="dataset-list-header" aria-hidden="true">
            <span>数据集</span>
            <span>规模 n / m / c</span>
            <span>标签 / 类型</span>
            <span>质量 / 使用</span>
            <span>操作</span>
          </div>
          {filtered.length === 0 ? (
            <div className="dataset-table-empty">{tableEmptyMessage}</div>
          ) : (
            visibleDatasets.map((d) => (
              <article key={d.id} className="dataset-list-item">
                <div className="dataset-list-item-name">
                  <strong title={d.name}>{d.name}</strong>
                  <small>
                    {d.createdAt} · {formatFileSize(d.fileSizeBytes)} · v{d.version}
                  </small>
                </div>
                <span className="dataset-list-metric" aria-label="规模 n m c">
                  <code>{d.sampleCount} / {d.baseCount} / {d.classCount}</code>
                </span>
                <div className="dataset-list-labels">
                  <span className={`dataset-label-tag ${d.hasLabels ? 'has-labels' : ''}`}>
                    <span className={`dataset-status-dot ${d.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
                    {d.hasLabels ? '有标签' : '无标签'}
                  </span>
                  <span className="dataset-type-tag">{d.dataType}</span>
                </div>
                <div className="dataset-list-lifecycle">
                  <span
                    className={`dataset-quality-status ${d.qualityStatus}`}
                    title={getDatasetQualityPresentation(d).description}
                  >
                    {getDatasetQualityPresentation(d).label}
                  </span>
                  <span
                    className={`dataset-usage-status ${d.taskCount > 0 ? 'used' : 'unused'}`}
                    title={d.taskCount > 0 ? `${d.taskCount} 任务 · ${d.lastAnalysisAt}` : undefined}
                  >
                    {getDatasetUsageSummary(d)}
                  </span>
                </div>
                <div className="dataset-list-actions" aria-label={`${d.name} 操作`}>
                  <button
                    type="button"
                    className="dataset-list-action view"
                    aria-label="查看"
                    title="查看"
                    onClick={() => onSelect(d.id)}
                  >
                    <Eye size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dataset-list-action update"
                    aria-label="更新"
                    title="更新"
                    disabled={uploading}
                    onClick={() => onUpdate(d)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dataset-list-action delete"
                    aria-label="删除"
                    title="删除"
                    disabled={uploading}
                    onClick={() => onDelete(d)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))
          )}
          {isLimited ? (
            <div className="dataset-render-limit-note">
              当前显示前 {DATASET_RENDER_LIMIT} 条数据集，请搜索或筛选缩小范围。
            </div>
          ) : null}
        </div>
      ) : (
        <DatasetCardGrid
          datasets={visibleDatasets}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          emptyMessage={tableEmptyMessage}
          actionDisabled={uploading}
        />
      )}
      {viewMode === 'card' && isLimited ? (
        <div className="dataset-render-limit-note">
          当前显示前 {DATASET_RENDER_LIMIT} 条数据集，请搜索或筛选缩小范围。
        </div>
      ) : null}
    </div>
  );
}

/* ========== 详情视图 ========== */

function DatasetDetailView({
  dataset,
  onBack,
  onExport,
  onRename,
  onDelete,
}: {
  dataset: DatasetCatalogItem;
  onBack: () => void;
  onExport: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [nBaseInput, setNBaseInput] = useState(() => String(Math.min(20, Math.max(0, dataset.baseCount))));
  const [seedInput, setSeedInput] = useState('1');
  const [selectedBases, setSelectedBases] = useState(() => buildInitialSelectedBases(dataset.baseCount));

  const nBase = dataset.baseCount > 0 ? clamp(Number(nBaseInput), 0, dataset.baseCount) : 0;
  const seed = clamp(Number(seedInput), 1, 999999);
  const selectedRatio = dataset.baseCount > 0
    ? Math.round((selectedBases.length / dataset.baseCount) * 100)
    : 0;

  const selectedPreview = useMemo(
    () => selectedBases.map((id) => formatBaseName(id)),
    [selectedBases],
  );
  const selectedBaseNameSet = useMemo(() => new Set(selectedPreview), [selectedPreview]);
  const quality = getDatasetQualityPresentation(dataset);
  const detailMetrics = [
    { label: '样本 n', value: dataset.sampleCount, note: '数据对象总量' },
    { label: '基础聚类 m', value: dataset.baseCount, note: '候选聚类成员' },
    { label: '真实类别 c', value: dataset.classCount, note: dataset.hasLabels ? '标签类别数量' : '未提供标签' },
    { label: '已选基础聚类', value: selectedBases.length, note: `当前选择 / ${dataset.baseCount}` },
  ];

  function handleRandomSelect() {
    setSelectedBases(selectBases(dataset.baseCount, nBase, seed));
  }

  function handleRemoveBase(baseId: number) {
    setSelectedBases((current) => {
      const nextSelectedBases = current.filter((id) => id !== baseId);
      setNBaseInput(String(nextSelectedBases.length));
      return nextSelectedBases;
    });
  }

  return (
    <div className="dataset-detail-shell">
      <header className="dataset-detail-hero">
        <div className="dataset-detail-title-row">
          <button type="button" className="dataset-detail-back" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" /> 返回
          </button>
          <div className="dataset-detail-title-block">
            <div className="dataset-detail-identity">
              <h2>{dataset.name}</h2>
              <div className="dataset-detail-meta" aria-label={`${dataset.name} 基本信息`}>
                <span>{dataset.createdAt}</span>
                <span>{formatFileSize(dataset.fileSizeBytes)}</span>
                <span>{dataset.dataType}</span>
                <span className={`dataset-label-tag ${dataset.hasLabels ? 'has-labels' : ''}`}>
                  <span className={`dataset-status-dot ${dataset.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
                  {dataset.hasLabels ? '有标签' : '无标签'}
                </span>
                <span className={`dataset-quality-status ${dataset.qualityStatus}`} title={quality.description}>
                  {quality.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="dataset-detail-actions" aria-label={`${dataset.name} 操作`}>
            <button type="button" className="btn btn-secondary" onClick={onExport}>
              <Download size={14} aria-hidden="true" /> 导出数据
            </button>
            <button type="button" className="btn btn-secondary" onClick={onRename}>
              <PencilLine size={14} aria-hidden="true" /> 重命名
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              <Trash2 size={14} aria-hidden="true" /> 删除
            </button>
        </div>
      </header>

      <div className="dataset-detail-layout">
        <main className="dataset-detail-main">
          {dataset.qualityStatus !== 'ready' && dataset.qualityIssues.length > 0 ? (
            <div className={`dataset-quality-note ${dataset.qualityStatus}`} role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{quality.description}</span>
            </div>
          ) : null}
          <section className="dataset-overview-grid" aria-label="数据集概览">
            {detailMetrics.map((metric) => (
              <div className="dataset-overview-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.note}</small>
              </div>
            ))}
          </section>

          <div className="dataset-detail-workspace">
            <section className="dataset-detail-section" aria-labelledby="dataset-label-distribution-heading">
              <div className="dataset-section-heading">
                <div>
                  <h3 id="dataset-label-distribution-heading">标签分布</h3>
                  <p>按真实类别统计样本数量与占比</p>
                </div>
              </div>
              <div className="label-distribution-panel">
              {dataset.labelDistribution.length === 0 ? (
                <div className="dataset-empty-state">暂无标签分布数据</div>
              ) : (
                <div className="label-distribution-list">
                  {dataset.labelDistribution.map((item) => (
                    <div className="label-distribution-row" key={item.label}>
                      <strong>类别 {item.label}</strong>
                      <span className="label-distribution-count">{item.count} 个</span>
                      <div className="label-distribution-track" aria-hidden="true">
                        <i style={{ width: `${item.percent}%` }} />
                      </div>
                      <span className="label-distribution-percent">{item.percent}%</span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </section>

            <div className="dataset-detail-lower-grid">
              <section className="dataset-detail-section" aria-labelledby="dataset-cluster-table-heading">
                <div className="dataset-section-heading">
                  <div>
                    <h3 id="dataset-cluster-table-heading">基础聚类统计</h3>
                    <p>逐个基础聚类查看簇数量、标签范围和当前选择状态</p>
                  </div>
                </div>
                <div className="dataset-table-wrap">
                  <table className="dataset-stat-table">
                    <thead>
                      <tr>
                        <th>基础聚类</th>
                        <th>簇数量</th>
                        <th>标签范围</th>
                        <th>选择状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.clusterStats.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="dataset-table-empty-cell">
                            暂无聚类统计
                          </td>
                        </tr>
                      ) : (
                        dataset.clusterStats.map((stat) => {
                          const selected = selectedBaseNameSet.has(stat.name);
                          return (
                            <tr key={stat.name}>
                              <td>{stat.name}</td>
                              <td>{stat.clusterCount}</td>
                              <td>{stat.range}</td>
                              <td>
                                <span className={`dataset-selection-status ${selected ? 'selected' : ''}`}>
                                  {selected ? '已选' : '未选'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="dataset-detail-section dataset-selection-panel" aria-labelledby="dataset-selection-heading">
                <div className="selection-control-heading">
                  <h3 id="dataset-selection-heading">选择基础聚类</h3>
                  <strong>{selectedBases.length} / {dataset.baseCount}</strong>
                </div>
                <div className="selection-controls">
                  <div className="selection-inputs">
                    <label>
                      <span>n_base</span>
                      <input
                        type="number"
                        min={0}
                        max={Math.max(1, dataset.baseCount)}
                        aria-label="n_base"
                        value={nBaseInput}
                        onBlur={() => setNBaseInput(String(nBase))}
                        onChange={(e) => setNBaseInput(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>随机种子</span>
                      <input
                        type="number"
                        min={1}
                        aria-label="随机种子"
                        value={seedInput}
                        onBlur={() => setSeedInput(String(seed))}
                        onChange={(e) => setSeedInput(e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleRandomSelect}
                    disabled={dataset.baseCount === 0}
                  >
                    <Shuffle size={16} aria-hidden="true" />
                    随机选择
                  </button>
                </div>
                <div className="selection-meter" aria-label="当前选择进度">
                  <div className="selection-meter-heading">
                    <span>选择进度</span>
                    <strong>{selectedRatio}%</strong>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${selectedRatio}%` }} />
                  </div>
                </div>
                <div className="selected-base-panel" aria-label="已选基础聚类">
                  <div className="selected-base-panel-heading">
                    <span>候选集合</span>
                    <strong>{selectedBases.length} 项</strong>
                  </div>
                  <div className="selected-base-grid">
                    {selectedBases.length === 0 ? (
                      <span className="selected-base-empty">暂无已选基础聚类</span>
                    ) : (
                      selectedBases.map((baseId) => {
                        const name = formatBaseName(baseId);

                        return (
                          <span className="selected-base-chip" key={baseId}>
                            {name}
                            <button
                              type="button"
                              className="selected-base-remove"
                              aria-label={`移除 ${name}`}
                              onClick={() => handleRemoveBase(baseId)}
                            >
                              <X size={13} aria-hidden="true" />
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ========== 主组件 ========== */

export function DatasetManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() =>
    normalizeViewMode(searchParams.get('view')),
  );
  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DatasetCatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatasetCatalogItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetIdRef = useRef<string | null>(null);

  const activeDataset = selectedId
    ? datasets.find((d) => d.id === selectedId) ?? null
    : null;
  const catalogEmptyMessage = loadingDatasets ? '正在加载数据集…' : '暂无数据集，请上传数据集';

  useEffect(() => {
    const nextViewMode = normalizeViewMode(searchParams.get('view'));
    setViewMode((current) => (current === nextViewMode ? current : nextViewMode));
  }, [searchParams]);

  function handleViewModeChange(nextMode: 'list' | 'card') {
    setViewMode(nextMode);
    const next = new URLSearchParams(searchParams);
    if (nextMode === 'card') {
      next.set('view', 'card');
    } else {
      next.delete('view');
    }
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      const token = getStoredAccessToken();
      if (!token) {
        setLoadingDatasets(false);
        return;
      }

      try {
        setLoadError(null);
        const res = await fetch(`${API}/datasets`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(typeof err.detail === 'string' ? err.detail : '加载数据集失败');
        }

        const data = (await res.json()) as DatasetCatalogPayload;
        if (!cancelled) {
          setDatasets(extractDatasetItems(data).map(normalizeDataset));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载数据集失败');
        }
      } finally {
        if (!cancelled) {
          setLoadingDatasets(false);
        }
      }
    }

    loadDatasets();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleUploadClick() {
    uploadTargetIdRef.current = null;
    fileInputRef.current?.click();
  }

  function handleUpdateClick(dataset: DatasetCatalogItem) {
    uploadTargetIdRef.current = dataset.id;
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      uploadTargetIdRef.current = null;
      return;
    }
    const targetId = uploadTargetIdRef.current;

    setUploading(true);
    setLoadError(null);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(targetId ? `${API}/datasets/${targetId}` : `${API}/datasets`, {
        method: targetId ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : targetId ? '更新失败' : '上传失败');
      }

      const data = await res.json();
      const savedDataset = normalizeDataset(data);

      setDatasets((prev) => {
        if (!targetId) return [savedDataset, ...prev];
        return [savedDataset, ...prev.filter((d) => d.id !== targetId)];
      });
      setSelectedId(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : targetId ? '更新失败' : '上传失败');
    } finally {
      setUploading(false);
      uploadTargetIdRef.current = null;
      // 重置 input 以便再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleExport(dataset: DatasetCatalogItem) {
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openRenameDialog(dataset: DatasetCatalogItem) {
    setRenameTarget(dataset);
  }

  function openDeleteDialog(dataset: DatasetCatalogItem) {
    setDeleteTarget(dataset);
  }

  async function submitRename(dataset: DatasetCatalogItem, nextName: string) {
    const res = await fetch(`${API}/datasets/${dataset.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ name: nextName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === 'string' ? err.detail : '重命名失败');
    }

    const renamedDataset = normalizeDataset(await res.json());
    setDatasets((prev) => prev.map((item) => (item.id === dataset.id ? renamedDataset : item)));
    setRenameTarget(null);
  }

  async function submitDelete(dataset: DatasetCatalogItem) {
    const res = await fetch(`${API}/datasets/${dataset.id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === 'string' ? err.detail : '删除失败');
    }

    setDatasets((prev) => prev.filter((item) => item.id !== dataset.id));
    setSelectedId(null);
    setDeleteTarget(null);
  }

  const catalog = (
    <DatasetCatalogView
      datasets={datasets}
      viewMode={viewMode}
      emptyMessage={catalogEmptyMessage}
      onSelect={setSelectedId}
      onUpdate={handleUpdateClick}
      onDelete={openDeleteDialog}
      onViewModeChange={handleViewModeChange}
      onUpload={handleUploadClick}
      uploading={uploading}
    />
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mat"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />
      {loadError || uploadError ? (
        <div className="dataset-upload-error">{loadError ?? uploadError}</div>
      ) : null}
      {selectedId === null ? (
        catalog
      ) : activeDataset ? (
        <DatasetDetailView
          dataset={activeDataset}
          onBack={() => setSelectedId(null)}
          onExport={() => handleExport(activeDataset)}
          onRename={() => openRenameDialog(activeDataset)}
          onDelete={() => openDeleteDialog(activeDataset)}
        />
      ) : (
        catalog
      )}
      {renameTarget ? (
        <DatasetRenameDialog
          dataset={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={(nextName) => submitRename(renameTarget!, nextName)}
        />
      ) : null}
      {deleteTarget ? (
        <DatasetDeleteDialog
          dataset={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSubmit={() => submitDelete(deleteTarget)}
        />
      ) : null}
    </>
  );
}
