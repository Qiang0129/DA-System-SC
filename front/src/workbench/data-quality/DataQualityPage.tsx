import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  fetchDatasetCatalog,
  recheckDatasetQuality,
  type DatasetCatalogItem,
  type DatasetQualityStatus,
} from '../../api/datasets';

type QualityFilter = 'all' | DatasetQualityStatus;
type RuleTone = 'pass' | 'warning' | 'error';

const FILTERS: Array<{ key: QualityFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'error', label: '需处理' },
  { key: 'warning', label: '待确认' },
  { key: 'ready', label: '检查通过' },
];

const STATUS_META: Record<
  DatasetQualityStatus,
  { label: string; description: string; tone: 'ready' | 'warning' | 'error' }
> = {
  ready: {
    label: '检查通过',
    description: '数据结构完整，当前未发现阻塞质量问题。',
    tone: 'ready',
  },
  warning: {
    label: '待确认',
    description: '存在待确认项，建议复检或核对标签信息。',
    tone: 'warning',
  },
  error: {
    label: '需处理',
    description: '存在质量问题，请修复后重新复检。',
    tone: 'error',
  },
};

function normalizeFilter(value: string | null): QualityFilter {
  return value === 'ready' || value === 'warning' || value === 'error' ? value : 'all';
}

function pickDefaultDataset(items: DatasetCatalogItem[]) {
  return (
    items.find((item) => item.qualityStatus === 'error') ??
    items.find((item) => item.qualityStatus === 'warning') ??
    items[0] ??
    null
  );
}

function includesIssue(dataset: DatasetCatalogItem, phrase: string) {
  return dataset.qualityIssues.some((issue) => issue.includes(phrase));
}

function buildQualityRules(dataset: DatasetCatalogItem) {
  const matrixInvalid = includesIssue(dataset, '未检测到有效的基础聚类矩阵');
  const labelsMissing = !dataset.hasLabels || includesIssue(dataset, '未提供真实标签');
  const labelCountMismatch = includesIssue(dataset, '标签数量与样本数量不一致');

  return [
    {
      key: 'matrix',
      title: '基础聚类矩阵',
      tone: matrixInvalid ? ('error' as RuleTone) : ('pass' as RuleTone),
      result: matrixInvalid ? '未检测到有效矩阵' : dataset.matrixShape || `${dataset.sampleCount} x ${dataset.baseCount}`,
      detail: matrixInvalid
        ? '请重新上传包含有效基础聚类矩阵的数据文件。'
        : '样本数和基础聚类数量均已识别。',
    },
    {
      key: 'labels',
      title: '真实标签可用性',
      tone: labelsMissing ? ('warning' as RuleTone) : ('pass' as RuleTone),
      result: labelsMissing ? '未提供真实标签' : dataset.labelShape || `${dataset.sampleCount} 个标签`,
      detail: labelsMissing
        ? '聚类计算仍可执行，但 ACC、NMI、ARI 和 F1 等监督指标不可用。'
        : '真实标签可以用于性能评估。',
    },
    {
      key: 'label-count',
      title: '标签数量一致性',
      tone: labelCountMismatch ? ('warning' as RuleTone) : ('pass' as RuleTone),
      result: labelCountMismatch ? '标签数量与样本数不一致' : '数量一致',
      detail: labelCountMismatch
        ? '建议检查标签变量和主矩阵是否来自同一批样本。'
        : '标签数量与基础聚类矩阵样本数一致。',
    },
    {
      key: 'readiness',
      title: '质量检查结论',
      tone:
        dataset.qualityStatus === 'error'
          ? ('error' as RuleTone)
          : dataset.qualityStatus === 'warning'
            ? ('warning' as RuleTone)
            : ('pass' as RuleTone),
      result:
        dataset.qualityStatus === 'error'
          ? '需要处理'
          : dataset.qualityStatus === 'warning'
            ? '建议确认'
            : '检查通过',
      detail: STATUS_META[dataset.qualityStatus].description,
    },
  ];
}

function QualityStatus({ status }: { status: DatasetQualityStatus }) {
  const meta = STATUS_META[status];
  return <span className={`quality-status ${meta.tone}`}>{meta.label}</span>;
}

function RuleIcon({ tone }: { tone: RuleTone }) {
  if (tone === 'pass') {
    return <CheckCircle2 size={18} aria-hidden="true" />;
  }
  if (tone === 'warning') {
    return <CircleAlert size={18} aria-hidden="true" />;
  }
  return <AlertTriangle size={18} aria-hidden="true" />;
}

export function DataQualityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>([]);
  const [filter, setFilter] = useState<QualityFilter>(() => normalizeFilter(searchParams.get('status')));
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const value = Number(searchParams.get('datasetId'));
    return Number.isFinite(value) && value > 0 ? value : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [recheckingIds, setRecheckingIds] = useState<number[]>([]);

  // 每次交互只改动对应的查询字段，避免搜索、筛选和当前数据集互相覆盖。
  const syncQuery = useCallback(
    (next: { status?: QualityFilter; q?: string; datasetId?: number | null }) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);

          if (next.status !== undefined) {
            if (next.status === 'all') params.delete('status');
            else params.set('status', next.status);
          }
          if (next.q !== undefined) {
            if (next.q.trim()) params.set('q', next.q.trim());
            else params.delete('q');
          }
          if (next.datasetId !== undefined) {
            if (next.datasetId) params.set('datasetId', String(next.datasetId));
            else params.delete('datasetId');
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchDatasetCatalog();
      setDatasets(page.items);
      setSelectedId((current) => {
        if (current && page.items.some((item) => item.id === current)) return current;
        return pickDefaultDataset(page.items)?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据质量信息失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  const counts = useMemo(
    () => ({
      all: datasets.length,
      error: datasets.filter((item) => item.qualityStatus === 'error').length,
      warning: datasets.filter((item) => item.qualityStatus === 'warning').length,
      ready: datasets.filter((item) => item.qualityStatus === 'ready').length,
    }),
    [datasets],
  );

  const filteredDatasets = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return datasets.filter((dataset) => {
      if (filter !== 'all' && dataset.qualityStatus !== filter) return false;
      if (!normalizedKeyword) return true;
      return dataset.name.toLowerCase().includes(normalizedKeyword);
    });
  }, [datasets, filter, keyword]);

  useEffect(() => {
    if (filteredDatasets.length === 0) return;
    if (selectedId && filteredDatasets.some((item) => item.id === selectedId)) return;
    const nextId = filteredDatasets[0].id;
    setSelectedId(nextId);
    syncQuery({ datasetId: nextId });
  }, [filteredDatasets, selectedId, syncQuery]);

  const selectedDataset = datasets.find((item) => item.id === selectedId) ?? null;
  const rules = selectedDataset ? buildQualityRules(selectedDataset) : [];
  const abnormalIds = datasets
    .filter((item) => item.qualityStatus !== 'ready')
    .map((item) => item.id);
  const isRechecking = recheckingIds.length > 0;

  async function handleRecheck(ids: number[]) {
    if (ids.length === 0 || isRechecking) return;

    setRecheckingIds(ids);
    setError('');
    setMessage('');

    // 批量复检允许部分成功，成功结果立即回写列表，失败项统一给出数量提示。
    const results = await Promise.allSettled(ids.map((id) => recheckDatasetQuality(id)));
    const updated = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failureCount = results.length - updated.length;

    if (updated.length > 0) {
      const byId = new Map(updated.map((item) => [item.id, item]));
      setDatasets((current) => current.map((item) => byId.get(item.id) ?? item));
    }

    if (failureCount > 0) {
      setError(`完成 ${updated.length} 项复检，${failureCount} 项失败，请稍后重试。`);
    } else {
      setMessage(`已完成 ${updated.length} 个数据集的质量复检。`);
    }

    setRecheckingIds([]);
  }

  function handleFilterChange(nextFilter: QualityFilter) {
    setFilter(nextFilter);
    syncQuery({ status: nextFilter });
  }

  function handleSelect(datasetId: number) {
    setSelectedId(datasetId);
    syncQuery({ datasetId });
  }

  return (
    <section className="quality-workspace" aria-label="数据质量检查">
      <header className="quality-page-header">
        <div>
          <span className="quality-page-icon" aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1>数据质量检查</h1>
            <p>优先处理基础数据结构问题，再复核标签相关提醒。</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={abnormalIds.length === 0 || isRechecking}
          onClick={() => void handleRecheck(abnormalIds)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {isRechecking ? '正在复检' : `复检异常项 (${abnormalIds.length})`}
        </button>
      </header>

      {error ? <div className="quality-feedback error" role="alert">{error}</div> : null}
      {message ? <div className="quality-feedback success" role="status">{message}</div> : null}

      <div className="quality-layout">
        <aside className="quality-queue panel" aria-label="数据集质量队列">
          <div className="quality-queue-header">
            <div>
              <strong>检查队列</strong>
              <span>{datasets.length} 个数据集</span>
            </div>
            <div className="quality-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={keyword}
                placeholder="搜索数据集"
                aria-label="搜索质量检查数据集"
                onChange={(event) => {
                  setKeyword(event.target.value);
                  syncQuery({ q: event.target.value });
                }}
              />
            </div>
          </div>

          <div className="quality-filters" aria-label="质量状态筛选">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={filter === item.key ? 'active' : ''}
                aria-pressed={filter === item.key}
                onClick={() => handleFilterChange(item.key)}
              >
                <span>{item.label}</span>
                <strong>{counts[item.key]}</strong>
              </button>
            ))}
          </div>

          <div className="quality-queue-list">
            {loading ? (
              <div className="quality-loading" aria-label="正在加载数据质量信息">
                <span />
                <span />
                <span />
              </div>
            ) : filteredDatasets.length === 0 ? (
              <div className="quality-empty">
                <Database size={22} aria-hidden="true" />
                <strong>没有匹配的数据集</strong>
                <span>调整状态筛选或搜索关键词。</span>
              </div>
            ) : (
              filteredDatasets.map((dataset) => (
                <button
                  type="button"
                  className={`quality-queue-item${dataset.id === selectedId ? ' active' : ''}`}
                  key={dataset.id}
                  onClick={() => handleSelect(dataset.id)}
                >
                  <div>
                    <strong>{dataset.name}</strong>
                    <span>
                      n {dataset.sampleCount} · m {dataset.baseCount} · v{dataset.version}
                    </span>
                  </div>
                  <div>
                    <QualityStatus status={dataset.qualityStatus} />
                    <small>{dataset.qualityIssues.length} 个问题</small>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="quality-inspector panel" aria-label="质量检查详情">
          {selectedDataset ? (
            <>
              <div className="quality-inspector-header">
                <div>
                  <span>当前数据集</span>
                  <h2>{selectedDataset.name}</h2>
                  <p>{STATUS_META[selectedDataset.qualityStatus].description}</p>
                </div>
                <div className="quality-inspector-actions">
                  <QualityStatus status={selectedDataset.qualityStatus} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isRechecking}
                    onClick={() => void handleRecheck([selectedDataset.id])}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    复检当前
                  </button>
                </div>
              </div>

              <dl className="quality-dataset-meta" aria-label="数据集质量元数据">
                <div>
                  <dt>矩阵规模</dt>
                  <dd>{selectedDataset.matrixShape || `${selectedDataset.sampleCount} x ${selectedDataset.baseCount}`}</dd>
                </div>
                <div>
                  <dt>真实类别</dt>
                  <dd>{selectedDataset.hasLabels ? `${selectedDataset.classCount} 类` : '未提供'}</dd>
                </div>
                <div>
                  <dt>当前版本</dt>
                  <dd>v{selectedDataset.version}</dd>
                </div>
                <div>
                  <dt>关联任务</dt>
                  <dd>{selectedDataset.taskCount} 个</dd>
                </div>
              </dl>

              <section className={`quality-issue-summary ${selectedDataset.qualityStatus}`}>
                {selectedDataset.qualityStatus === 'ready' ? (
                  <CheckCircle2 size={19} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={19} aria-hidden="true" />
                )}
                <div>
                  <strong>
                    {selectedDataset.qualityIssues.length > 0
                      ? `发现 ${selectedDataset.qualityIssues.length} 个质量提醒`
                      : '未发现质量问题'}
                  </strong>
                  <span>
                    {selectedDataset.qualityIssues.length > 0
                      ? selectedDataset.qualityIssues.join('；')
                      : '基础聚类矩阵和标签数据均通过当前质量规则。'}
                  </span>
                </div>
              </section>

              <div className="quality-rule-heading">
                <div>
                  <h3>检查结果</h3>
                  <span>依据后端实际质量规则与数据结构检查结果生成。</span>
                </div>
                <ShieldCheck size={18} aria-hidden="true" />
              </div>

              <div className="quality-rule-results">
                {rules.map((rule) => (
                  <article className={`quality-rule-result ${rule.tone}`} key={rule.key}>
                    <span className="quality-rule-icon">
                      <RuleIcon tone={rule.tone} />
                    </span>
                    <div>
                      <strong>{rule.title}</strong>
                      <span>{rule.detail}</span>
                    </div>
                    <b>{rule.result}</b>
                  </article>
                ))}
              </div>

              <footer className={`quality-readiness ${selectedDataset.qualityStatus}`}>
                <div>
                  <strong>
                    {selectedDataset.qualityStatus === 'error'
                      ? '存在质量问题'
                      : selectedDataset.qualityStatus === 'warning'
                        ? '存在待确认项'
                        : '质量检查通过'}
                  </strong>
                  <span>{STATUS_META[selectedDataset.qualityStatus].description}</span>
                </div>
              </footer>
            </>
          ) : (
            <div className="quality-empty inspector">
              <ShieldCheck size={26} aria-hidden="true" />
              <strong>{loading ? '正在加载检查详情' : '暂无可检查数据集'}</strong>
              <span>{loading ? '请稍候。' : '请先在数据管理中上传基础聚类结果。'}</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

export default DataQualityPage;
