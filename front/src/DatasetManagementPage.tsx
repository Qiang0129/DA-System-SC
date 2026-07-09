import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSpreadsheet,
  FileUp,
  FlaskConical,
  Play,
  RefreshCw,
  Shuffle,
  Tags,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type DatasetSummary = {
  name: string;
  matrixShape: string;
  labelShape: string;
  sampleCount: number;
  baseCount: number;
  classCount: number;
  hasLabels: boolean;
};

type ClusterStat = {
  name: string;
  clusterCount: number;
  range: string;
};

type TaskDraft = {
  name: string;
  mode: string;
  nBase: number;
  selectedCount: number;
  createdAt: string;
};

const ionosphereDataset: DatasetSummary = {
  name: 'Ionosphere 示例数据',
  matrixShape: 'E: 351 x 100',
  labelShape: 'y: 351',
  sampleCount: 351,
  baseCount: 100,
  classCount: 2,
  hasLabels: true,
};

const labelDistribution = [
  { label: '类别 1', count: 225, percent: 64 },
  { label: '类别 2', count: 126, percent: 36 },
];

const clusterStats: ClusterStat[] = [
  { name: 'base_1', clusterCount: 11, range: '1 - 11' },
  { name: 'base_2', clusterCount: 16, range: '1 - 16' },
  { name: 'base_3', clusterCount: 3, range: '1 - 3' },
  { name: 'base_4', clusterCount: 9, range: '1 - 9' },
  { name: 'base_5', clusterCount: 15, range: '1 - 15' },
  { name: 'base_6', clusterCount: 14, range: '1 - 14' },
  { name: 'base_7', clusterCount: 11, range: '1 - 11' },
  { name: 'base_8', clusterCount: 2, range: '1 - 2' },
];

const supportedFormats = ['CSV', 'JSON', 'Excel', 'MAT', 'NPZ'];

const defaultSelectedBases = Array.from({ length: 20 }, (_, index) => index + 1);

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

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

function DatasetMetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: 'neutral' | 'green' | 'amber' | 'purple';
}) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <div className="summary-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <span className="card-label">{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

export function DatasetManagementPage() {
  const [sourceName, setSourceName] = useState(ionosphereDataset.name);
  const [fileName, setFileName] = useState('ionosphere_base_clustering.npz / .mat');
  const [nBaseInput, setNBaseInput] = useState('20');
  const [seedInput, setSeedInput] = useState('1');
  const [selectedBases, setSelectedBases] = useState(defaultSelectedBases);

  const nBase = clamp(Number(nBaseInput), 1, ionosphereDataset.baseCount);
  const seed = clamp(Number(seedInput), 1, 999999);

  const selectedRatio = Math.round((selectedBases.length / ionosphereDataset.baseCount) * 100);

  const selectedPreview = useMemo(
    () => selectedBases.map((id) => formatBaseName(id)),
    [selectedBases],
  );

  function handleExampleLoad() {
    setSourceName(ionosphereDataset.name);
    setFileName('ionosphere_base_clustering.npz / .mat');
    setNBaseInput('20');
    setSelectedBases(defaultSelectedBases);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setSourceName(file.name.replace(/\.[^.]+$/, '') || '本地基础聚类数据');
  }

  function handleRandomSelect() {
    setSelectedBases(selectBases(ionosphereDataset.baseCount, nBase, seed));
  }

  return (
    <>
      <section className="status-header" aria-label="数据源状态">
        <div className="status-left">
          <span className="status-dot success" aria-hidden="true" />
          <div>
            <span className="status-label">当前数据源</span>
            <strong>{sourceName}</strong>
          </div>
        </div>
        <div className="status-meta">
          <span>文件路径</span>
          <strong>{fileName}</strong>
        </div>
        <div className="status-actions">
          <button type="button" className="btn btn-secondary" onClick={handleExampleLoad}>
            <RefreshCw size={16} aria-hidden="true" />
            使用示例数据
          </button>
        </div>
      </section>

      <section className="summary-grid" aria-label="数据管理概览">
        <DatasetMetricCard
          label="样本数 n"
          value={String(ionosphereDataset.sampleCount)}
          note="Ionosphere 示例数据"
          icon={Database}
          tone="neutral"
        />
        <DatasetMetricCard
          label="基础聚类 m"
          value={String(ionosphereDataset.baseCount)}
          note="基础聚类矩阵 E"
          icon={Boxes}
          tone="green"
        />
        <DatasetMetricCard
          label="真实类别 c"
          value={String(ionosphereDataset.classCount)}
          note="含真实标签 y"
          icon={Tags}
          tone="purple"
        />
        <DatasetMetricCard
          label="标签状态"
          value={ionosphereDataset.hasLabels ? '已导入' : '未导入'}
          note="可计算 ACC / NMI / ARI / F1"
          icon={CheckCircle2}
          tone="amber"
        />
      </section>

      <section className="dataset-workflow-grid" aria-label="数据管理流程工作台">
        <section className="panel dataset-import-panel" aria-label="导入基础聚类结果">
          <div className="panel-header">
            <div>
              <h2>导入基础聚类结果</h2>
              <span>支持常规表格格式，也保留算法原生示例格式。</span>
            </div>
            <FileUp size={20} aria-hidden="true" />
          </div>

          <label className="dataset-dropzone">
            <input
              type="file"
              aria-label="上传基础聚类结果文件"
              accept=".csv,.json,.xlsx,.xls,.mat,.npz"
              onChange={handleFileChange}
            />
            <span className="dataset-dropzone-icon" aria-hidden="true">
              <Upload size={22} />
            </span>
            <strong>选择或拖入基础聚类结果文件</strong>
            <small>CSV / JSON / Excel / MAT / NPZ</small>
          </label>

          <div className="format-chip-row" aria-label="支持格式">
            {supportedFormats.map((format) => (
              <span key={format}>{format}</span>
            ))}
          </div>

          <div className="dataset-file-summary">
            <div>
              <span>矩阵结构</span>
              <strong>{ionosphereDataset.matrixShape}</strong>
            </div>
            <div>
              <span>标签向量</span>
              <strong>{ionosphereDataset.labelShape}</strong>
            </div>
          </div>
        </section>

        <div className="dataset-middle-stack">
          <section className="panel dataset-statistics-panel" aria-label="查看基础聚类统计">
            <div className="panel-header">
              <div>
                <h2>查看基础聚类统计</h2>
                <span>展示每个基础聚类的簇数量、标签范围和选择状态。</span>
              </div>
              <FileSpreadsheet size={20} aria-hidden="true" />
            </div>

            <div className="dataset-stat-grid">
              <div>
                <span>标签分布</span>
                {labelDistribution.map((item) => (
                  <div className="label-distribution-row" key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.count}</span>
                    <i style={{ width: `${item.percent}%` }} aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div>
                <span>簇数量范围</span>
                <strong>2 - 18</strong>
                <small>前 8 个基础聚类预览</small>
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
                  {clusterStats.map((stat) => (
                    <tr key={stat.name}>
                      <td>{stat.name}</td>
                      <td>{stat.clusterCount}</td>
                      <td>{stat.range}</td>
                      <td>{selectedPreview.includes(stat.name) ? '已选' : '未选'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel dataset-selection-panel" aria-label="基础聚类随机选择">
            <div className="panel-header">
              <div>
                <h2>基础聚类随机选择</h2>
                <span>按 n_base 和随机种子生成本次 CA 构建使用的基础聚类子集。</span>
              </div>
              <Shuffle size={20} aria-hidden="true" />
            </div>

            <div className="selection-controls">
              <label>
                <span>n_base</span>
                <input
                  type="number"
                  min={1}
                  max={ionosphereDataset.baseCount}
                  aria-label="n_base"
                  value={nBaseInput}
                  onBlur={() => setNBaseInput(String(nBase))}
                  onChange={(event) => setNBaseInput(event.target.value)}
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
                  onChange={(event) => setSeedInput(event.target.value)}
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
                <strong>{selectedBases.length} / {ionosphereDataset.baseCount}</strong>
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
        </div>

      </section>
    </>
  );
}
