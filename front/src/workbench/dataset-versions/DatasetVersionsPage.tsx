import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Database,
  FileClock,
  GitCompareArrows,
  History,
  PencilLine,
  RefreshCw,
  Replace,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  fetchDatasetCatalog,
  fetchDatasetVersions,
  type DatasetCatalogItem,
  type DatasetQualityStatus,
  type DatasetRevision,
} from '../../api/datasets';
import { SelectField } from '../../components/SelectField';

type QueryPatch = {
  datasetId?: number | null;
  version?: number | null;
  compare?: number | null;
};

type RevisionActionMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
};

type RevisionDiffField = {
  key: string;
  label: string;
  baselineValue: string;
  currentValue: string;
  changed: boolean;
};

const QUALITY_LABELS: Record<DatasetQualityStatus, string> = {
  ready: '检查通过',
  warning: '待确认',
  error: '需处理',
};

const ACTION_META: Record<string, RevisionActionMeta> = {
  uploaded: {
    label: '初始上传',
    description: '创建数据集并保存首个可追踪版本。',
    icon: UploadCloud,
  },
  replaced: {
    label: '替换文件',
    description: '更新源文件，并记录替换后的结构与质量状态。',
    icon: Replace,
  },
  renamed: {
    label: '重命名',
    description: '调整数据集名称，文件内容保持不变。',
    icon: PencilLine,
  },
};

function parsePositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getActionMeta(action: string): RevisionActionMeta {
  return (
    ACTION_META[action] ?? {
      label: action || '数据变更',
      description: '记录本次数据集元数据变更。',
      icon: FileClock,
    }
  );
}

function getDefaultBaseline(revisions: DatasetRevision[], selectedVersion: number) {
  const selectedIndex = revisions.findIndex((revision) => revision.version === selectedVersion);
  return selectedIndex >= 0 ? revisions[selectedIndex + 1] ?? null : null;
}

function formatLabels(revision: DatasetRevision) {
  return revision.hasLabels ? `已提供（${revision.classCount} 类）` : '未提供';
}

function formatIssues(revision: DatasetRevision) {
  return revision.qualityIssues.length > 0 ? revision.qualityIssues.join('；') : '无质量问题';
}

function buildDiffFields(
  current: DatasetRevision,
  baseline: DatasetRevision | null,
): RevisionDiffField[] {
  // 版本接口保存的是可追踪元数据，差异表固定字段顺序，便于不同版本之间逐项核对。
  const values = [
    ['name', '数据集名称', current.name, baseline?.name ?? '首次记录'],
    ['filename', '原始文件', current.originalFilename, baseline?.originalFilename ?? '首次记录'],
    ['samples', '样本数 n', String(current.sampleCount), baseline ? String(baseline.sampleCount) : '首次记录'],
    ['bases', '基础聚类数 m', String(current.baseCount), baseline ? String(baseline.baseCount) : '首次记录'],
    ['classes', '类别数 c', current.hasLabels ? String(current.classCount) : '未提供', baseline ? (baseline.hasLabels ? String(baseline.classCount) : '未提供') : '首次记录'],
    ['labels', '真实标签', formatLabels(current), baseline ? formatLabels(baseline) : '首次记录'],
    ['quality', '质量状态', QUALITY_LABELS[current.qualityStatus], baseline ? QUALITY_LABELS[baseline.qualityStatus] : '首次记录'],
    ['issues', '质量问题', formatIssues(current), baseline ? formatIssues(baseline) : '首次记录'],
  ] as const;

  return values.map(([key, label, currentValue, baselineValue]) => ({
    key,
    label,
    currentValue,
    baselineValue,
    changed: Boolean(baseline && currentValue !== baselineValue),
  }));
}

function RevisionQualityBadge({ status }: { status: DatasetQualityStatus }) {
  return <span className={`versions-quality-badge ${status}`}>{QUALITY_LABELS[status]}</span>;
}

export function DatasetVersionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 目录和版本记录分两次异步加载，ref 用于保留地址栏指定的恢复目标。
  const requestedVersionRef = useRef(parsePositiveNumber(searchParams.get('version')));
  const requestedCompareRef = useRef(parsePositiveNumber(searchParams.get('compare')));

  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(() =>
    parsePositiveNumber(searchParams.get('datasetId')),
  );
  const [revisions, setRevisions] = useState<DatasetRevision[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(
    requestedVersionRef.current,
  );
  const [compareVersion, setCompareVersion] = useState<number | null>(
    requestedCompareRef.current,
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionReloadKey, setRevisionReloadKey] = useState(0);
  const [error, setError] = useState('');

  const updateQuery = useCallback(
    (patch: QueryPatch) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          const assign = (key: keyof QueryPatch, value: number | null | undefined) => {
            if (value) params.set(key, String(value));
            else params.delete(key);
          };

          if (Object.prototype.hasOwnProperty.call(patch, 'datasetId')) {
            assign('datasetId', patch.datasetId);
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'version')) {
            assign('version', patch.version);
          }
          if (Object.prototype.hasOwnProperty.call(patch, 'compare')) {
            assign('compare', patch.compare);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError('');
    try {
      const page = await fetchDatasetCatalog();
      setDatasets(page.items);
      setSelectedDatasetId((current) => {
        if (current && page.items.some((dataset) => dataset.id === current)) return current;
        return page.items[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据集目录失败');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // 仅在数据集切换或主动重试时请求版本，比较基准变化不会重复访问后端。
  useEffect(() => {
    if (!selectedDatasetId) {
      setRevisions([]);
      setSelectedVersion(null);
      setCompareVersion(null);
      return;
    }

    let cancelled = false;
    setRevisionsLoading(true);
    setError('');

    void fetchDatasetVersions(selectedDatasetId)
      .then((items) => {
        if (cancelled) return;

        setRevisions(items);
        const selected =
          items.find((revision) => revision.version === requestedVersionRef.current) ??
          items[0] ??
          null;
        const requestedCompare = items.find(
          (revision) =>
            revision.version === requestedCompareRef.current &&
            revision.version !== selected?.version,
        );
        const baseline = selected
          ? requestedCompare ?? getDefaultBaseline(items, selected.version)
          : null;

        setSelectedVersion(selected?.version ?? null);
        setCompareVersion(baseline?.version ?? null);
        requestedVersionRef.current = selected?.version ?? null;
        requestedCompareRef.current = baseline?.version ?? null;
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载版本记录失败');
          setRevisions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRevisionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [revisionReloadKey, selectedDatasetId]);

  // 地址栏同步与数据请求分离，防止查询参数更新覆盖用户刚选择的版本。
  useEffect(() => {
    if (!selectedDatasetId) return;
    updateQuery({
      datasetId: selectedDatasetId,
      version: selectedVersion,
      compare: compareVersion,
    });
  }, [compareVersion, selectedDatasetId, selectedVersion, updateQuery]);

  const selectedDataset =
    datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const selectedRevision =
    revisions.find((revision) => revision.version === selectedVersion) ?? null;
  const compareRevision =
    revisions.find((revision) => revision.version === compareVersion) ?? null;
  const diffFields = useMemo(
    () => (selectedRevision ? buildDiffFields(selectedRevision, compareRevision) : []),
    [compareRevision, selectedRevision],
  );
  const changedCount = diffFields.filter((field) => field.changed).length;

  function handleDatasetChange(datasetId: number) {
    setSelectedDatasetId(datasetId);
    setRevisions([]);
    setSelectedVersion(null);
    setCompareVersion(null);
    requestedVersionRef.current = null;
    requestedCompareRef.current = null;
  }

  function handleVersionChange(version: number) {
    const baseline = getDefaultBaseline(revisions, version);
    setSelectedVersion(version);
    setCompareVersion(baseline?.version ?? null);
    requestedVersionRef.current = version;
    requestedCompareRef.current = baseline?.version ?? null;
  }

  function handleCompareChange(version: number | null) {
    setCompareVersion(version);
    requestedCompareRef.current = version;
  }

  const selectedAction = selectedRevision ? getActionMeta(selectedRevision.action) : null;
  const datasetSelectOptions = useMemo(
    () => (datasets.length === 0
      ? [{ value: '', label: '暂无数据集' }]
      : datasets.map((dataset) => ({
          value: String(dataset.id),
          label: dataset.name,
        }))),
    [datasets],
  );
  const compareSelectOptions = useMemo(
    () => [
      { value: '', label: '不比较（查看快照）' },
      ...revisions
        .filter((revision) => revision.version !== selectedRevision?.version)
        .map((revision) => ({
          value: String(revision.version),
          label: `v${revision.version} · ${getActionMeta(revision.action).label}`,
        })),
    ],
    [revisions, selectedRevision?.version],
  );

  return (
    <section className="versions-workspace" aria-label="数据版本记录">
      <header className="versions-page-header">
        <div>
          <span className="versions-page-icon" aria-hidden="true">
            <History size={20} />
          </span>
          <div>
            <h1>数据版本记录</h1>
            <p>按数据集查看上传、替换和重命名历史，并核对每次变更影响的元数据。</p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate('/workbench/datasets')}
        >
          <Database size={15} aria-hidden="true" />
          进入数据管理
        </button>
      </header>

      {error ? (
        <div className="versions-feedback error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() =>
              selectedDatasetId
                ? setRevisionReloadKey((current) => current + 1)
                : void loadCatalog()
            }
          >
            <RefreshCw size={14} aria-hidden="true" />
            重试
          </button>
        </div>
      ) : null}

      <section className="versions-dataset-bar panel" aria-label="版本数据集选择">
        <SelectField
          className="versions-dataset-picker"
          label="选择数据集"
          ariaLabel="选择版本数据集"
          disabled={catalogLoading || datasets.length === 0}
          value={selectedDatasetId ? String(selectedDatasetId) : ''}
          options={datasetSelectOptions}
          onChange={(value) => handleDatasetChange(Number(value))}
        />

        <div className="versions-dataset-context" aria-label="所选数据集版本摘要">
          <div>
            <span>当前版本</span>
            <strong>{selectedDataset ? `v${selectedDataset.version}` : '--'}</strong>
          </div>
          <div>
            <span>历史记录</span>
            <strong>{revisionsLoading ? '--' : `${revisions.length} 条`}</strong>
          </div>
          <div>
            <span>数据规模</span>
            <strong>
              {selectedDataset
                ? `${selectedDataset.sampleCount} x ${selectedDataset.baseCount}`
                : '--'}
            </strong>
          </div>
          <div>
            <span>当前质量</span>
            {selectedDataset ? (
              <RevisionQualityBadge status={selectedDataset.qualityStatus} />
            ) : (
              <strong>--</strong>
            )}
          </div>
        </div>
      </section>

      {catalogLoading ? (
        <div className="versions-loading panel" aria-label="正在加载版本数据">
          <span />
          <span />
          <span />
        </div>
      ) : datasets.length === 0 ? (
        <section className="versions-empty panel">
          <Database size={28} aria-hidden="true" />
          <h2>暂无可追踪的数据集</h2>
          <p>上传数据集后，系统会自动保存初始版本，并持续记录替换和重命名操作。</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/workbench/datasets')}
          >
            <Database size={15} aria-hidden="true" />
            前往数据管理
          </button>
        </section>
      ) : (
        <section className="versions-explorer panel" aria-label="数据版本浏览器">
          <aside className="versions-rail" aria-label="版本轨道">
            <div className="versions-rail-header">
              <div>
                <strong>版本轨道</strong>
                <span>{selectedDataset?.name}</span>
              </div>
              <b>{revisions.length}</b>
            </div>

            <div className="versions-rail-list">
              {revisionsLoading ? (
                <div className="versions-rail-loading" aria-label="正在加载版本轨道">
                  <span />
                  <span />
                  <span />
                </div>
              ) : revisions.length === 0 ? (
                <div className="versions-rail-empty">
                  <FileClock size={21} aria-hidden="true" />
                  <strong>暂无版本记录</strong>
                  <span>该数据集尚未生成可追踪版本。</span>
                </div>
              ) : (
                revisions.map((revision, index) => {
                  const action = getActionMeta(revision.action);
                  const ActionIcon = action.icon;
                  const active = revision.version === selectedVersion;

                  return (
                    <button
                      type="button"
                      className={`versions-rail-item${active ? ' active' : ''}`}
                      aria-current={active ? 'true' : undefined}
                      key={revision.id}
                      onClick={() => handleVersionChange(revision.version)}
                    >
                      <span className="versions-rail-node" aria-hidden="true">
                        <ActionIcon size={14} />
                      </span>
                      <span className="versions-rail-copy">
                        <strong>
                          v{revision.version} · {action.label}
                        </strong>
                        <time>{revision.createdAt || '时间未知'}</time>
                      </span>
                      <span className={`versions-rail-state ${revision.qualityStatus}`}>
                        {index === 0 ? '当前' : QUALITY_LABELS[revision.qualityStatus]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="versions-inspector" aria-label="版本差异详情">
            {selectedRevision && selectedAction ? (
              <>
                <header className="versions-inspector-header">
                  <div>
                    <span>查看版本</span>
                    <h2>
                      v{selectedRevision.version} · {selectedAction.label}
                    </h2>
                    <p>{selectedAction.description}</p>
                  </div>
                  <SelectField
                    className="versions-compare-picker"
                    label="比较基准"
                    ariaLabel="选择比较基准"
                    value={compareVersion ? String(compareVersion) : ''}
                    options={compareSelectOptions}
                    onChange={(value) => handleCompareChange(value ? Number(value) : null)}
                  />
                </header>

                <div className="versions-revision-meta">
                  <span>
                    <FileClock size={14} aria-hidden="true" />
                    {selectedRevision.createdAt || '时间未知'}
                  </span>
                  <RevisionQualityBadge status={selectedRevision.qualityStatus} />
                  <span>{selectedRevision.originalFilename}</span>
                </div>

                <section className={`versions-change-summary${compareRevision ? '' : ' snapshot'}`}>
                  {compareRevision ? (
                    <GitCompareArrows size={19} aria-hidden="true" />
                  ) : (
                    <FileClock size={19} aria-hidden="true" />
                  )}
                  <div>
                    <strong>
                      {compareRevision
                        ? `与 v${compareRevision.version} 相比，${changedCount} 项元数据发生变化`
                        : '当前以版本快照方式查看'}
                    </strong>
                    <span>
                      {compareRevision
                        ? changedCount > 0
                          ? '变更字段已在下方突出显示，未变化字段保持普通状态。'
                          : '两个版本的可追踪元数据一致。'
                        : '选择其他版本作为比较基准，可查看字段级差异。'}
                    </span>
                  </div>
                  <b>{compareRevision ? `${changedCount} / ${diffFields.length}` : '快照'}</b>
                </section>

                <div className="versions-diff-table" role="table" aria-label="版本元数据差异">
                  <div className="versions-diff-row header" role="row">
                    <span role="columnheader">字段</span>
                    <span role="columnheader">
                      {compareRevision ? `基准 v${compareRevision.version}` : '基准'}
                    </span>
                    <span aria-hidden="true" />
                    <span role="columnheader">查看 v{selectedRevision.version}</span>
                  </div>
                  {diffFields.map((field) => (
                    <div
                      className={`versions-diff-row${field.changed ? ' changed' : ''}`}
                      role="row"
                      key={field.key}
                    >
                      <strong role="rowheader">{field.label}</strong>
                      <span role="cell">{field.baselineValue}</span>
                      <ArrowRight size={15} aria-hidden="true" />
                      <span role="cell">
                        {field.currentValue}
                        {field.changed ? <b>已变更</b> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="versions-inspector-empty">
                <FileClock size={27} aria-hidden="true" />
                <strong>{revisionsLoading ? '正在加载版本详情' : '暂无版本详情'}</strong>
                <span>
                  {revisionsLoading
                    ? '正在读取所选数据集的历史记录。'
                    : '该数据集还没有可比较的版本记录。'}
                </span>
              </div>
            )}
          </section>
        </section>
      )}
    </section>
  );
}

export default DatasetVersionsPage;
