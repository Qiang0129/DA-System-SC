import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  ArrowLeft,
  Download,
  Grid3x3,
  List,
  Play,
  Search,
  Shuffle,
  Upload,
} from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

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
  sampleCount: number;
  baseCount: number;
  classCount: number;
  hasLabels: boolean;
  dataType: '数值' | '混合';
  taskCount: number;
  lastAnalysisAt: string | null;
  matrixShape: string;
  labelShape: string;
  labelDistribution: LabelDistributionItem[];
  clusterStats: ClusterStat[];
};

const sampleDatasets: DatasetCatalogItem[] = [
  {
    id: 'ionosphere',
    name: 'Ionosphere 雷达数据',
    createdAt: '2026-07-01',
    sampleCount: 351,
    baseCount: 100,
    classCount: 2,
    hasLabels: true,
    dataType: '数值',
    taskCount: 3,
    lastAnalysisAt: '2026-07-08',
    matrixShape: 'E: 351 x 100',
    labelShape: 'y: 351',
    labelDistribution: [
      { label: '类别 1', count: 225, percent: 64 },
      { label: '类别 2', count: 126, percent: 36 },
    ],
    clusterStats: [
      { name: 'base_1', clusterCount: 11, range: '1 - 11' },
      { name: 'base_2', clusterCount: 16, range: '1 - 16' },
      { name: 'base_3', clusterCount: 3, range: '1 - 3' },
      { name: 'base_4', clusterCount: 9, range: '1 - 9' },
      { name: 'base_5', clusterCount: 15, range: '1 - 15' },
      { name: 'base_6', clusterCount: 14, range: '1 - 14' },
      { name: 'base_7', clusterCount: 11, range: '1 - 11' },
      { name: 'base_8', clusterCount: 2, range: '1 - 2' },
    ],
  },
  {
    id: 'wine',
    name: 'Wine 葡萄酒成分',
    createdAt: '2026-06-21',
    sampleCount: 178,
    baseCount: 80,
    classCount: 3,
    hasLabels: true,
    dataType: '数值',
    taskCount: 1,
    lastAnalysisAt: '2026-06-28',
    matrixShape: 'E: 178 x 80',
    labelShape: 'y: 178',
    labelDistribution: [
      { label: '类别 1', count: 59, percent: 33 },
      { label: '类别 2', count: 71, percent: 40 },
      { label: '类别 3', count: 48, percent: 27 },
    ],
    clusterStats: [
      { name: 'base_1', clusterCount: 8, range: '1 - 8' },
      { name: 'base_2', clusterCount: 12, range: '1 - 12' },
      { name: 'base_3', clusterCount: 5, range: '1 - 5' },
      { name: 'base_4', clusterCount: 10, range: '1 - 10' },
      { name: 'base_5', clusterCount: 7, range: '1 - 7' },
      { name: 'base_6', clusterCount: 9, range: '1 - 9' },
    ],
  },
  {
    id: 'seeds',
    name: 'Seeds 小麦种子',
    createdAt: '2026-05-14',
    sampleCount: 210,
    baseCount: 60,
    classCount: 3,
    hasLabels: true,
    dataType: '数值',
    taskCount: 0,
    lastAnalysisAt: null,
    matrixShape: 'E: 210 x 60',
    labelShape: 'y: 210',
    labelDistribution: [
      { label: '类别 K', count: 70, percent: 33 },
      { label: '类别 R', count: 70, percent: 33 },
      { label: '类别 W', count: 70, percent: 33 },
    ],
    clusterStats: [
      { name: 'base_1', clusterCount: 6, range: '1 - 6' },
      { name: 'base_2', clusterCount: 9, range: '1 - 9' },
      { name: 'base_3', clusterCount: 4, range: '1 - 4' },
      { name: 'base_4', clusterCount: 7, range: '1 - 7' },
      { name: 'base_5', clusterCount: 5, range: '1 - 5' },
    ],
  },
];

const defaultSelectedBases = Array.from({ length: 20 }, (_, index) => index + 1);

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

/* ========== 卡片网格视图 ========== */

function DatasetCardGrid({
  datasets,
  onSelect,
}: {
  datasets: DatasetCatalogItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="dataset-card-grid">
      {datasets.length === 0 ? (
        <div className="dataset-table-empty">暂无匹配数据集</div>
      ) : (
        datasets.map((d) => (
          <div
            key={d.id}
            className="dataset-card"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(d.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(d.id); }}
          >
            <div className="dataset-card-header">
              <strong>{d.name}</strong>
              <small>{d.createdAt}</small>
            </div>
            <div className="dataset-card-body">
              <div className="dataset-card-sizes">
                <div><span>n</span><strong>{d.sampleCount}</strong></div>
                <div><span>m</span><strong>{d.baseCount}</strong></div>
                <div><span>c</span><strong>{d.classCount}</strong></div>
              </div>
            </div>
            <div className="dataset-card-footer">
              <span className={`dataset-status-dot ${d.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
              <span>{d.hasLabels ? '有标签' : '无标签'}</span>
              <span className="dataset-type-tag">{d.dataType}</span>
              {d.taskCount > 0 ? (
                <small className="dataset-card-task-count">{d.taskCount} 任务</small>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ========== 目录视图 ========== */

function DatasetCatalogView({
  datasets,
  viewMode,
  onSelect,
  onToggleView,
  onUpload,
  uploading,
}: {
  datasets: DatasetCatalogItem[];
  viewMode: 'list' | 'card';
  onSelect: (id: string) => void;
  onToggleView: () => void;
  onUpload: () => void;
  uploading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'全部' | '数值' | '混合'>('全部');

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
            placeholder="搜索数据集…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="dataset-toolbar-center">
          <select
            className="dataset-type-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            aria-label="数据类型筛选"
          >
            <option value="全部">全部</option>
            <option value="数值">数值</option>
            <option value="混合">混合</option>
          </select>
        </div>

        <div className="dataset-toolbar-segment">
          <button
            type="button"
            className={`dataset-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => { if (viewMode !== 'list') onToggleView(); }}
            aria-label="列表视图"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            className={`dataset-view-btn ${viewMode === 'card' ? 'active' : ''}`}
            onClick={() => { if (viewMode !== 'card') onToggleView(); }}
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
        <div className="dataset-table">
          <div className="dataset-table-header">
            <span className="dataset-col-name">数据集</span>
            <span className="dataset-col-size">规模 n / m / c</span>
            <span className="dataset-col-status">状态 / 类型</span>
            <span className="dataset-col-usage">使用情况</span>
            <span className="dataset-col-enter" />
          </div>
          {filtered.length === 0 ? (
            <div className="dataset-table-empty">暂无匹配数据集</div>
          ) : (
            filtered.map((d) => (
              <div
                key={d.id}
                className="dataset-row"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(d.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect(d.id); }}
              >
                <span className="dataset-col-name">
                  <strong>{d.name}</strong>
                  <small>{d.createdAt}</small>
                </span>
                <span className="dataset-col-size">
                  <code>{d.sampleCount} / {d.baseCount} / {d.classCount}</code>
                </span>
                <span className="dataset-col-status">
                  <span className={`dataset-status-dot ${d.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
                  {d.hasLabels ? '有标签' : '无标签'}
                  <span className="dataset-type-tag">{d.dataType}</span>
                </span>
                <span className="dataset-col-usage">
                  {d.taskCount > 0 ? (
                    <>{d.taskCount} 任务 · {d.lastAnalysisAt}</>
                  ) : (
                    <span className="dataset-usage-empty">未使用</span>
                  )}
                </span>
                <span className="dataset-col-enter" aria-hidden="true">&rsaquo;</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <DatasetCardGrid datasets={filtered} onSelect={onSelect} />
      )}
    </div>
  );
}

/* ========== 详情视图 ========== */

function DatasetDetailView({
  dataset,
  onBack,
}: {
  dataset: DatasetCatalogItem;
  onBack: () => void;
}) {
  const [nBaseInput, setNBaseInput] = useState('20');
  const [seedInput, setSeedInput] = useState('1');
  const [selectedBases, setSelectedBases] = useState(defaultSelectedBases);

  const nBase = clamp(Number(nBaseInput), 1, dataset.baseCount);
  const seed = clamp(Number(seedInput), 1, 999999);
  const selectedRatio = Math.round((selectedBases.length / dataset.baseCount) * 100);

  const selectedPreview = useMemo(
    () => selectedBases.map((id) => formatBaseName(id)),
    [selectedBases],
  );

  function handleRandomSelect() {
    setSelectedBases(selectBases(dataset.baseCount, nBase, seed));
  }

  return (
    <div className="dataset-detail-shell">
      <div className="dataset-detail-topbar">
        <button type="button" className="dataset-detail-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> 返回
        </button>
        <span className="dataset-detail-breadcrumb">数据集 · {dataset.name}</span>
      </div>

      <div className="dataset-detail-layout">
        <aside className="dataset-detail-sidebar">
          <div className="dataset-detail-card">
            <h4>基本信息</h4>
            <dl>
              <dt>名称</dt><dd>{dataset.name}</dd>
              <dt>上传时间</dt><dd>{dataset.createdAt}</dd>
              <dt>类型</dt><dd>{dataset.dataType}</dd>
              <dt>状态</dt>
              <dd>
                <span className={`dataset-status-dot ${dataset.hasLabels ? 'has-labels' : ''}`} aria-hidden="true" />
                {dataset.hasLabels ? '有标签' : '无标签'}
              </dd>
            </dl>
          </div>

          <div className="dataset-detail-card">
            <h4>规模</h4>
            <div className="dataset-scale-numbers">
              <div><strong>{dataset.sampleCount}</strong><span>样本 n</span></div>
              <div><strong>{dataset.baseCount}</strong><span>基础聚类 m</span></div>
              <div><strong>{dataset.classCount}</strong><span>真实类别 c</span></div>
            </div>
          </div>

          <div className="dataset-detail-card dataset-detail-actions">
            <h4>操作</h4>
            <button type="button" className="btn btn-primary" onClick={() => {}}>
              <Play size={14} aria-hidden="true" /> 创建任务（TODO）
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => {}}>
              <Download size={14} aria-hidden="true" /> 导出数据（TODO）
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => {}}>
              重命名（TODO）
            </button>
            <button type="button" className="btn btn-danger" onClick={() => {}}>
              删除（TODO）
            </button>
          </div>
        </aside>

        <main className="dataset-detail-main">
          <section className="dataset-detail-section">
            <h3>标签分布</h3>
            <div className="dataset-stat-grid">
              {dataset.labelDistribution.length === 0 ? (
                <span className="dataset-usage-empty">暂无标签分布数据</span>
              ) : (
                dataset.labelDistribution.map((item) => (
                  <div className="label-distribution-row" key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.count}</span>
                    <i style={{ width: `${item.percent}%` }} aria-hidden="true" />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="dataset-detail-section">
            <h3>基础聚类统计</h3>
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
                      <td colSpan={4} className="dataset-usage-empty" style={{ textAlign: 'center', padding: '20px' }}>
                        暂无聚类统计
                      </td>
                    </tr>
                  ) : (
                    dataset.clusterStats.map((stat) => (
                      <tr key={stat.name}>
                        <td>{stat.name}</td>
                        <td>{stat.clusterCount}</td>
                        <td>{stat.range}</td>
                        <td>{selectedPreview.includes(stat.name) ? '已选' : '未选'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dataset-detail-section">
            <h3>选择基础聚类</h3>
            <div className="selection-controls">
              <label>
                <span>n_base</span>
                <input
                  type="number"
                  min={1}
                  max={dataset.baseCount}
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
              <button type="button" className="btn btn-secondary" onClick={handleRandomSelect}>
                <Shuffle size={16} aria-hidden="true" />
                随机选择
              </button>
            </div>
            <div className="selection-meter">
              <div>
                <span>当前选择</span>
                <strong>{selectedBases.length} / {dataset.baseCount}</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${selectedRatio}%` }} />
              </div>
            </div>
            <div className="selected-base-grid" aria-label="已选基础聚类">
              {selectedPreview.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

/* ========== 主组件 ========== */

export function DatasetManagementPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [datasets, setDatasets] = useState<DatasetCatalogItem[]>(sampleDatasets);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDataset = selectedId
    ? datasets.find((d) => d.id === selectedId) ?? null
    : null;

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API}/datasets/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || '解析失败');
      }

      const data = await res.json();

      const now = new Date().toISOString().slice(0, 10);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const id = `uploaded-${Date.now()}`;

      // 生成基础聚类统计示例
      const clusterCount = Math.min(data.baseCount, 10);
      const sampleClusterStats: ClusterStat[] = Array.from(
        { length: Math.min(clusterCount, 6) },
        (_, i) => ({
          name: `base_${i + 1}`,
          clusterCount: Math.max(2, Math.round(10 + Math.sin(i) * 5)),
          range: `1 - ${Math.max(2, Math.round(10 + Math.sin(i) * 5))}`,
        }),
      );

      const newDataset: DatasetCatalogItem = {
        id,
        name: baseName,
        createdAt: now,
        sampleCount: data.sampleCount,
        baseCount: data.baseCount,
        classCount: data.classCount ?? 2,
        hasLabels: data.hasLabels ?? false,
        dataType: '数值',
        taskCount: 0,
        lastAnalysisAt: null,
        matrixShape: `E: ${data.sampleCount} x ${data.baseCount}`,
        labelShape: data.hasLabels ? `y: ${data.sampleCount}` : '',
        labelDistribution: [],
        clusterStats: sampleClusterStats,
      };

      setDatasets((prev) => [newDataset, ...prev]);
      setSelectedId(id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      // 重置 input 以便再次选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const catalog = (
    <DatasetCatalogView
      datasets={datasets}
      viewMode={viewMode}
      onSelect={setSelectedId}
      onToggleView={() => setViewMode((v) => (v === 'list' ? 'card' : 'list'))}
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
      {uploadError ? (
        <div className="dataset-upload-error">{uploadError}</div>
      ) : null}
      {selectedId === null ? (
        catalog
      ) : activeDataset ? (
        <DatasetDetailView
          dataset={activeDataset}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        catalog
      )}
    </>
  );
}

export { sampleDatasets };
