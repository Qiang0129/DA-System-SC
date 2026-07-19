import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  Download,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  HardDrive,
  History,
  Images,
  LayoutGrid,
  ListChecks,
  PackageOpen,
  Network,
  PackageCheck,
  SlidersHorizontal,
  Target,
  TrendingDown,
} from 'lucide-react';
import { MathFormula } from '../../components/MathFormula';
import { createTaskExport, downloadProtectedFile, fetchTaskExports } from '../../api/results';
import {
  WorkbenchMetricStrip,
  WorkbenchNotice,
  WorkbenchSectionHeader,
  WorkbenchStatus,
} from '../WorkbenchUi';
import {
  buildConvergenceOption,
  buildKernelRunsOption,
  buildMatrixOption,
  buildMetricRunsOption,
  buildScatterOption,
  buildWeightsOption,
  ConvergencePanel,
  MatrixScaleLegend,
  MatrixPanel,
  OptionChartPanel,
  ScatterPanel,
  useResultChart,
} from './ResultChartPanels';
import { MetricStrip, ReadyHeader } from './ResultPageShared';
import {
  downloadTextFile,
  formatBytes,
  formatNumber,
  formatPercent,
  metricLabels,
  taskResultPath,
  type MetricKey,
} from './resultPresentation';
import type { AnalysisResult, TaskExport, TaskResultResource } from './types';

const kernelDefinitions = [
  {
    key: 'rbf_sigma_squared',
    name: 'K1 · RBF 核',
    short: 'RBF / sigma^2',
    latex: String.raw`\mathbf{K}_1(\mathbf{c}_i,\mathbf{c}_j)=\exp\left(-\frac{\lVert \mathbf{c}_i-\mathbf{c}_j\rVert_2^2}{\sigma^2+\varepsilon}\right)`,
    label: 'K1 RBF 核，带宽分母为 sigma 平方加 epsilon',
  },
  {
    key: 'linear',
    name: 'K2 · 线性核',
    short: 'Linear',
    latex: String.raw`\mathbf{K}_2(\mathbf{c}_i,\mathbf{c}_j)=\mathbf{c}_i^{\mathsf T}\mathbf{c}_j`,
    label: 'K2 线性核',
  },
  {
    key: 'rbf_sigma',
    name: 'K3 · RBF 核',
    short: 'RBF / sigma',
    latex: String.raw`\mathbf{K}_3(\mathbf{c}_i,\mathbf{c}_j)=\exp\left(-\frac{\lVert \mathbf{c}_i-\mathbf{c}_j\rVert_2^2}{\sigma+\varepsilon}\right)`,
    label: 'K3 RBF 核，带宽分母为 sigma 加 epsilon',
  },
  {
    key: 'polynomial_2',
    name: 'K4 · 二次多项式核',
    short: 'Polynomial / 2',
    latex: String.raw`\mathbf{K}_4(\mathbf{c}_i,\mathbf{c}_j)=\left(\mathbf{c}_i^{\mathsf T}\mathbf{c}_j+1\right)^2`,
    label: 'K4 二次多项式核',
  },
] as const;

type KernelKey = (typeof kernelDefinitions)[number]['key'];
type KernelTrendMode = 'relative' | 'absolute';

const topPairCountPresets = [5, 10, 20] as const;

function getTopPairCountOptions(availableCount: number) {
  if (availableCount <= 0) return [];
  const options = topPairCountPresets.filter((count) => count <= availableCount);
  if (!options.includes(availableCount as (typeof topPairCountPresets)[number])) {
    return [...options, availableCount];
  }
  return options;
}

const exportOptions = [
  { key: 'metrics', label: '性能指标', detail: '聚合统计与逐轮结果', icon: BarChart3 },
  { key: 'parameters', label: '任务参数', detail: '算法配置与随机种子', icon: SlidersHorizontal },
  { key: 'result', label: '结果清单', detail: '任务和产物索引', icon: ListChecks },
  { key: 'labels', label: '聚类标签', detail: '代表轮次及全部轮次标签', icon: FileSpreadsheet },
  { key: 'ca', label: 'CA 矩阵', detail: '完整协关联矩阵', icon: LayoutGrid },
  { key: 's', label: 'S 矩阵', detail: '多核相似性结果', icon: Network },
  { key: 'z', label: 'Z 矩阵', detail: '拓扑关系结果', icon: Target },
] as const;

const exportPresets = [
  { key: 'review', label: '评审交付', detail: '指标、参数、结果清单与标签', items: ['metrics', 'parameters', 'result', 'labels'] },
  { key: 'reproduce', label: '复现实验', detail: '任务参数、结果清单与全部矩阵', items: ['parameters', 'result', 'labels', 'ca', 's', 'z'] },
  { key: 'complete', label: '完整归档', detail: '保存当前任务的全部可交付内容', items: exportOptions.map((item) => item.key) },
] as const;

function exportItemLabels(items: string[]) {
  return items.map((key) => exportOptions.find((item) => item.key === key)?.label ?? key);
}

type ReportSection = 'summary' | 'metrics' | 'parameters' | 'runs' | 'artifacts';

const reportSectionOptions: Array<{ key: ReportSection; label: string; detail: string }> = [
  { key: 'summary', label: '任务摘要', detail: '数据集、算法、样本和耗时' },
  { key: 'metrics', label: '性能指标', detail: '均值、标准差与取值范围' },
  { key: 'parameters', label: '算法参数', detail: '本次执行的真实参数' },
  { key: 'runs', label: '重复实验', detail: '逐轮指标和随机种子' },
  { key: 'artifacts', label: '结果产物', detail: '文件格式与大小清单' },
];

type ReportPreviewSectionProps = {
  section: ReportSection;
  title: string;
  meta: string;
  expanded: boolean;
  onToggle: (section: ReportSection, expanded: boolean) => void;
  children: ReactNode;
};

function ReportPreviewSection({ section, title, meta, expanded, onToggle, children }: ReportPreviewSectionProps) {
  const bodyId = `report-preview-${section}`;

  return (
    <details
      className="report-preview-section"
      open={expanded}
      onToggle={(event) => onToggle(section, event.currentTarget.open)}
    >
      <summary aria-controls={bodyId} aria-expanded={expanded}>
        <span>
          <h3>{title}</h3>
          <small>{meta}</small>
        </span>
        <ChevronsDown size={16} aria-hidden="true" />
      </summary>
      <div className="report-preview-section-body" id={bodyId}>
        {children}
      </div>
    </details>
  );
}

function DetailLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="text-action" onClick={onClick}>
      {label}
      <ArrowRight size={14} aria-hidden="true" />
    </button>
  );
}

function matrixStatus(result: AnalysisResult) {
  const error = result.preview.matrices.ca.stats.symmetryMaxError;
  if (error === null || !Number.isFinite(error)) return { tone: 'neutral' as const, label: '未计算对称误差' };
  return error <= 1e-8
    ? { tone: 'success' as const, label: '矩阵对称' }
    : { tone: 'warning' as const, label: '存在对称偏差' };
}

export function CaResultPage({ resource }: { resource: TaskResultResource }) {
  const navigate = useNavigate();
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;
  const matrix = result.preview.matrices.ca;
  const status = matrixStatus(result);
  const availableTopPairCount = matrix.topPairs.length;
  const topPairCountOptions = useMemo(
    () => getTopPairCountOptions(availableTopPairCount),
    [availableTopPairCount],
  );
  const [topPairCount, setTopPairCount] = useState(() => Math.min(10, availableTopPairCount));
  const visibleTopPairs = matrix.topPairs.slice(0, topPairCount);

  useEffect(() => {
    setTopPairCount(Math.min(10, availableTopPairCount));
  }, [availableTopPairCount]);

  return (
    <section className="soft-page result-detail-page result-ca-page">
      <ReadyHeader title="CA 协关联矩阵" icon={LayoutGrid} resource={resource} />
      <MetricStrip result={result} />

      <div className="result-detail-primary result-ca-primary">
        <MatrixPanel
          matrix={matrix}
          title="CA 矩阵预览"
          description="等距抽取完整矩阵，坐标对应原始样本编号"
          actions={
            <DetailLink
              label="导出完整矩阵"
              onClick={() => navigate(taskResultPath('export', task.id))}
            />
          }
        />

        <section className="panel result-diagnostic-panel" aria-label="矩阵诊断">
          <WorkbenchSectionHeader
            title="矩阵诊断"
            meta="基于持久化矩阵预览的真实统计"
            actions={<WorkbenchStatus tone={status.tone}>{status.label}</WorkbenchStatus>}
          />
          <dl className="result-diagnostic-list">
            <div><dt>完整尺寸</dt><dd>{matrix.shape[0]} × {matrix.shape[1]}</dd></div>
            <div><dt>预览采样</dt><dd>{matrix.rowIndices.length} × {matrix.columnIndices.length}</dd></div>
            <div><dt>对角均值</dt><dd>{formatNumber(matrix.stats.diagonalMean, 5)}</dd></div>
            <div><dt>非零比例</dt><dd>{formatPercent(matrix.stats.nonzeroRatio)}</dd></div>
            <div><dt>最小 / 最大</dt><dd>{formatNumber(matrix.stats.min, 4)} / {formatNumber(matrix.stats.max, 4)}</dd></div>
            <div><dt>对称误差</dt><dd>{formatNumber(matrix.stats.symmetryMaxError, 8)}</dd></div>
          </dl>
          <div className="result-formula-inline">
            <span>构造公式</span>
            <MathFormula
              className="result-ca-formula"
              displayMode
              latex={String.raw`\mathbf{CA}=\frac{\mathbf{M}\mathbf{M}^{\mathsf T}}{n_{\mathrm{base}}}`}
              label="CA 等于 M 乘 M 转置除以基础聚类数量"
            />
          </div>
          <WorkbenchNotice
            tone="info"
            icon={LayoutGrid}
            title="预览经过等距抽样"
            detail="统计值来自完整矩阵，热力图仅降低浏览器渲染密度。"
          />
        </section>
      </div>

      <section className="panel result-ranked-table-panel" aria-label="高协关联样本对">
        <WorkbenchSectionHeader
          title="高协关联样本对"
          meta={`忽略对角线后按 CA 数值降序展示，当前显示 ${visibleTopPairs.length} / ${availableTopPairCount} 组`}
          actions={availableTopPairCount ? (
            <div className="result-panel-actions">
              <label className="result-top-pair-control">
                <span>显示数量</span>
                <select
                  className="result-run-select result-top-pair-select"
                  value={topPairCount}
                  onChange={(event) => setTopPairCount(Number(event.target.value))}
                  aria-label="选择高协关联样本对显示数量"
                >
                  {topPairCountOptions.map((count) => <option key={count} value={count}>Top {count}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        />
        {matrix.topPairs.length ? (
          <div className="result-ranked-table" role="table" aria-label="高协关联样本对排名">
            <div className="result-ranked-row header" role="row">
              <span role="columnheader">排名</span><span role="columnheader">样本 A</span><span role="columnheader">样本 B</span><span role="columnheader">CA 数值</span><span role="columnheader">矩阵位置</span>
            </div>
            {visibleTopPairs.map((pair, index) => (
              <div className="result-ranked-row" role="row" key={`${pair.row}-${pair.column}`}>
                <strong role="cell">{String(index + 1).padStart(2, '0')}</strong>
                <span role="cell">S{pair.row}</span>
                <span role="cell">S{pair.column}</span>
                <strong role="cell">{formatNumber(pair.value, 5)}</strong>
                <span role="cell">({pair.row}, {pair.column})</span>
              </div>
            ))}
          </div>
        ) : (
          <WorkbenchNotice tone="info" icon={LayoutGrid} title="暂无样本对" detail="当前矩阵预览没有可排序的非对角元素。" />
        )}
      </section>
    </section>
  );
}

export function KernelResultPage({ resource }: { resource: TaskResultResource }) {
  const result = resource.envelope!.result!;
  const [active, setActive] = useState<KernelKey>(kernelDefinitions[0].key);
  const [trendMode, setTrendMode] = useState<KernelTrendMode>('relative');
  const definition = kernelDefinitions.find((item) => item.key === active) ?? kernelDefinitions[0];
  const weight = result.kernelWeights.items.find((item) => item.key === active);
  const runsOption = useMemo(() => buildKernelRunsOption(result, trendMode), [result, trendMode]);
  const runsRef = useResultChart(runsOption);
  const hasRunWeights = result.kernelWeights.runs.length > 0 && result.kernelWeights.items.length > 0;
  const parameters: Array<[string, unknown]> = [
    ['sigma', result.parameters.sigma],
    ['lambda', result.parameters.lambda],
    ['gamma', result.parameters.gamma],
    ['anchor', result.parameters.anchor],
    ['nBase', result.parameters.nBase],
    ['runs', result.parameters.runs],
  ];

  return (
    <section className="soft-page result-detail-page result-kernel-page">
      <ReadyHeader title="核函数配置" icon={SlidersHorizontal} resource={resource} />
      <section className="panel result-kernel-workbench">
        <WorkbenchSectionHeader title="核函数工作区" meta="选择核函数，核对公式、真实权重与本次任务参数" />
        <div className="result-kernel-workspace-body">
          <nav className="result-kernel-catalog" role="tablist" aria-label="选择核函数">
            <span>可用核函数</span>
            {kernelDefinitions.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                className={active === item.key ? 'active' : ''}
                aria-selected={active === item.key}
                aria-controls="kernel-definition-panel"
                onClick={() => setActive(item.key)}
              >
                <span><strong>{item.name}</strong><small>{item.short}</small></span>
                <em>{formatNumber(result.kernelWeights.items.find((current) => current.key === item.key)?.representative, 5)}</em>
              </button>
            ))}
          </nav>
          <article className="result-kernel-definition" id="kernel-definition-panel" role="tabpanel">
            <header>
              <div><span>当前定义</span><strong>{definition.name}</strong></div>
              <WorkbenchStatus tone="info">{definition.short}</WorkbenchStatus>
            </header>
            <MathFormula className="result-kernel-formula" displayMode latex={definition.latex} label={definition.label} />
            <p>{definition.label}。公式与后端 Python 核矩阵实现保持一致。</p>
          </article>
          <aside className="result-kernel-selected-weight" aria-label="当前核权重">
            <header><span>当前核权重</span><strong>{formatNumber(weight?.representative, 5)}</strong></header>
            <dl>
              <div><dt>重复实验均值</dt><dd>{formatNumber(weight?.mean, 5)}</dd></div>
              <div><dt>标准差</dt><dd>{formatNumber(weight?.std, 5)}</dd></div>
              <div><dt>代表轮次</dt><dd>{formatNumber(weight?.representative, 5)}</dd></div>
            </dl>
            <small>该数值为代表轮次的原始 alpha，不在前端重新归一化。</small>
          </aside>
        </div>
        <div className="result-parameter-strip" aria-label="算法参数">
          {parameters.map(([label, value]) => (
            <div key={String(label)}><span>{label}</span><strong>{String(value ?? '—')}</strong></div>
          ))}
        </div>
      </section>

      <section className="panel result-kernel-stability-panel">
        <WorkbenchSectionHeader
          title="跨轮核权重稳定性"
          meta={trendMode === 'relative'
            ? `${result.kernelWeights.runs.length} 轮数据，以各核自身均值为基线放大波动`
            : `${result.kernelWeights.runs.length} 轮真实 alpha，保留原始权重尺度`}
          actions={(
            <div className="result-kernel-stability-actions">
              <div className="result-kernel-trend-toggle" role="group" aria-label="切换核权重趋势视图">
                <button type="button" className={trendMode === 'relative' ? 'active' : ''} aria-pressed={trendMode === 'relative'} disabled={!hasRunWeights} onClick={() => setTrendMode('relative')}>相对变化</button>
                <button type="button" className={trendMode === 'absolute' ? 'active' : ''} aria-pressed={trendMode === 'absolute'} disabled={!hasRunWeights} onClick={() => setTrendMode('absolute')}>绝对权重</button>
              </div>
              <WorkbenchStatus tone={hasRunWeights ? 'success' : 'warning'}>{hasRunWeights ? '数据完整' : '暂无趋势'}</WorkbenchStatus>
            </div>
          )}
        />
        {hasRunWeights ? <div className="result-chart result-kernel-stability-chart" ref={runsRef} /> : <WorkbenchNotice tone="info" icon={Activity} title="暂无跨轮权重" detail="当前任务没有可绘制的逐轮核权重。" />}
        <div className="result-kernel-comparison" role="table" aria-label="核贡献对照表">
          <div className="result-kernel-comparison-row header" role="row">
            <span>核函数</span><span>定义</span><span>均值</span><span>标准差</span><span>代表轮次</span>
          </div>
          {kernelDefinitions.map((item) => {
            const current = result.kernelWeights.items.find((weightItem) => weightItem.key === item.key);
            return (
              <div className="result-kernel-comparison-row" role="row" key={item.key}>
                <strong>{item.name}</strong><span>{item.short}</span><span>{formatNumber(current?.mean, 5)}</span><span>{formatNumber(current?.std, 5)}</span><span>{formatNumber(current?.representative, 5)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function objectiveReduction(initial?: number, final?: number) {
  if (initial == null || final == null || !Number.isFinite(initial) || !Number.isFinite(final) || initial === 0) return null;
  return (initial - final) / Math.abs(initial);
}

export function MklResultPage({ resource }: { resource: TaskResultResource }) {
  const result = resource.envelope!.result!;
  const [run, setRun] = useState(result.convergence.representativeRun);
  useEffect(() => setRun(result.convergence.representativeRun), [result.convergence.representativeRun]);
  const current = result.convergence.runs.find((item) => item.run === run) ?? result.convergence.runs[0];
  const option = useMemo(() => buildConvergenceOption(result, current?.run ?? run), [current?.run, result, run]);
  const chartRef = useResultChart(option);
  const points = current?.points ?? [];
  const firstPoint = points[0];
  const finalPoint = points[points.length - 1];
  const reduction = objectiveReduction(firstPoint?.objective, finalPoint?.objective);
  const weights = result.kernelWeights.items;
  const largestWeight = Math.max(0, ...weights.map((item) => item.representative));

  return (
    <section className="soft-page result-detail-page result-mkl-page">
      <ReadyHeader title="多核相似性学习" icon={Network} resource={resource} />
      <section className="panel result-mkl-solver-panel">
        <WorkbenchSectionHeader
          title="求解轨迹"
          meta="跟踪目标函数下降过程，并检查每一轮优化是否达到终止条件"
          actions={result.convergence.runs.length ? (
            <select className="result-run-select" value={current?.run ?? ''} onChange={(event) => setRun(Number(event.target.value))} aria-label="选择求解轮次">
              {result.convergence.runs.map((item) => <option key={item.run} value={item.run}>第 {item.run} 轮</option>)}
            </select>
          ) : null}
        />
        <div className="result-mkl-solver-workspace">
          <div className="result-mkl-chart-area">
            {points.length ? <div className="result-chart result-mkl-convergence-chart" ref={chartRef} /> : <WorkbenchNotice tone="info" icon={Activity} title="暂无收敛轨迹" detail="当前任务没有返回可绘制的目标函数序列。" />}
          </div>
          <aside className="result-mkl-diagnostics" aria-label="本轮求解诊断">
            <header>
              <div><span>当前诊断</span><strong>{current ? `第 ${current.run} 轮` : '暂无轮次'}</strong></div>
              <WorkbenchStatus tone={!current ? 'warning' : current.converged ? 'success' : 'info'}>{!current ? '无数据' : current.converged ? '提前收敛' : '达到迭代上限'}</WorkbenchStatus>
            </header>
            <dl>
              <div><dt>迭代点数</dt><dd>{points.length}</dd></div>
              <div><dt>初始目标函数</dt><dd>{formatNumber(firstPoint?.objective, 5)}</dd></div>
              <div><dt>最终目标函数</dt><dd>{formatNumber(finalPoint?.objective, 5)}</dd></div>
              <div><dt>目标下降幅度</dt><dd>{formatPercent(reduction)}</dd></div>
              <div><dt>最终相对变化</dt><dd>{formatPercent(finalPoint?.relativeChange)}</dd></div>
              <div><dt>代表轮次</dt><dd>第 {result.convergence.representativeRun} 轮</dd></div>
            </dl>
            <p>诊断值直接取自求解器轨迹，不使用性能指标替代优化过程。</p>
          </aside>
        </div>
      </section>

      <div className="result-mkl-detail-grid">
        <section className="panel result-mkl-iteration-panel">
          <WorkbenchSectionHeader title="迭代明细" meta={current ? `第 ${current.run} 轮的完整目标函数序列` : '当前没有可展示的迭代记录'} />
          {points.length ? (
            <div className="result-mkl-iteration-table" role="table" aria-label="迭代目标函数明细">
              <div className="result-mkl-iteration-row header" role="row"><span>迭代</span><span>目标函数</span><span>相对变化</span><span>状态</span></div>
              {points.map((point, index) => (
                <div className="result-mkl-iteration-row" role="row" key={point.iteration}>
                  <strong>第 {point.iteration} 次</strong>
                  <span>{formatNumber(point.objective, 5)}</span>
                  <span>{formatPercent(point.relativeChange)}</span>
                  <span>{index === points.length - 1 ? (current?.converged ? '收敛点' : '终止点') : '迭代中'}</span>
                </div>
              ))}
            </div>
          ) : <WorkbenchNotice tone="info" icon={Activity} title="暂无迭代明细" detail="选择包含收敛轨迹的任务后可查看逐次变化。" />}
        </section>

        <section className="panel result-mkl-mixture-panel">
          <WorkbenchSectionHeader title="代表轮次核组合" meta="使用代表轮次原始 alpha 展示最终学习结果" actions={<WorkbenchStatus tone={weights.length ? 'success' : 'warning'}>{weights.length} 个核</WorkbenchStatus>} />
          {weights.length ? (
            <div className="result-mkl-mixture-list">
              {weights.map((item, index) => {
                const definition = kernelDefinitions.find((currentItem) => currentItem.key === item.key);
                const width = largestWeight > 0 ? Math.max(1, item.representative / largestWeight * 100) : 0;
                return (
                  <div className={`tone-${index + 1}`} key={item.key}>
                    <span><strong>{definition?.name ?? item.key}</strong><em>{formatNumber(item.representative, 5)}</em></span>
                    <i aria-hidden="true"><b style={{ width: `${width}%` }} /></i>
                    <small>均值 {formatNumber(item.mean, 5)} · std {formatNumber(item.std, 5)}</small>
                  </div>
                );
              })}
            </div>
          ) : <WorkbenchNotice tone="info" icon={Network} title="暂无核组合" detail="当前结果没有记录代表轮次的核权重。" />}
          <p className="result-mkl-mixture-note">条形长度以当前最大权重为参照，标签数值始终保留原始 alpha。</p>
        </section>
      </div>
    </section>
  );
}

function selectedViewSummary(result: AnalysisResult, selected: string) {
  const matrix = result.preview.matrices.ca;
  const representative = result.convergence.runs.find((item) => item.run === result.convergence.representativeRun);
  const finalPoint = representative?.points[representative.points.length - 1];
  const weightSum = result.kernelWeights.items.reduce((sum, item) => sum + item.mean, 0);
  const clusterCount = new Set(result.preview.scatter.points.map((item) => item.predictedLabel)).size;

  if (selected === 'weights') return [['核数量', result.kernelWeights.items.length], ['权重总和', formatNumber(weightSum, 5)], ['重复轮次', result.kernelWeights.runs.length], ['代表轮次', result.convergence.representativeRun]];
  if (selected === 'scatter') return [['预览点', result.preview.scatter.points.length], ['完整样本', result.preview.scatter.totalCount], ['预测簇', clusterCount], ['是否抽样', result.preview.scatter.sampled ? '是' : '否']];
  if (selected === 'convergence') return [['代表轮次', result.convergence.representativeRun], ['迭代点', representative?.points.length ?? 0], ['最终目标', formatNumber(finalPoint?.objective, 5)], ['求解状态', representative?.converged ? '提前收敛' : '达到上限']];
  return [['完整尺寸', `${matrix.shape[0]} × ${matrix.shape[1]}`], ['预览尺寸', `${matrix.rowIndices.length} × ${matrix.columnIndices.length}`], ['矩阵均值', formatNumber(matrix.stats.mean, 5)], ['对称误差', formatNumber(matrix.stats.symmetryMaxError, 8)]];
}

export function VisualizationResultPage({ resource }: { resource: TaskResultResource }) {
  const result = resource.envelope!.result!;
  const options = useMemo(() => [
    { key: 'ca', title: 'CA 热力图', description: '观察样本协关联结构', option: buildMatrixOption(result.preview.matrices.ca, 'CA'), icon: LayoutGrid, section: 'ca-matrix' },
    { key: 'weights', title: '核权重', description: '比较多核贡献差异', option: buildWeightsOption(result), icon: BarChart3, section: 'kernel-config' },
    { key: 'scatter', title: '聚类散点', description: '检查代表轮次标签分布', option: buildScatterOption(result), icon: Target, section: 'results' },
    { key: 'convergence', title: '收敛曲线', description: '跟踪目标函数变化', option: buildConvergenceOption(result, result.convergence.representativeRun), icon: TrendingDown, section: 'mkl' },
  ], [result]);
  const [selected, setSelected] = useState(options[0].key);
  const current = options.find((item) => item.key === selected) ?? options[0];
  const [activeMatrixValue, setActiveMatrixValue] = useState<number | null>(null);
  const ref = useResultChart(current.option, setActiveMatrixValue);
  const summary = selectedViewSummary(result, selected);
  const task = resource.envelope!.task!;
  const navigate = useNavigate();

  const exportSvg = () => {
    const svg = ref.current?.querySelector('svg')?.outerHTML;
    if (svg) downloadTextFile(`${current.key}-task-${task.id}.svg`, svg, 'image/svg+xml;charset=utf-8');
  };

  return (
    <section className="soft-page result-detail-page result-visualization-page">
      <ReadyHeader title="可视化展示" icon={Images} resource={resource} />
      <MetricStrip result={result} />
      <div className="result-visual-workspace">
        <section className="panel result-chart-panel result-visual-canvas">
          <WorkbenchSectionHeader
            title={current.title}
            meta={`${current.description} · 浏览器端 SVG 渲染`}
            actions={<button type="button" className="btn btn-secondary" onClick={exportSvg}><Download size={15} />导出 SVG</button>}
          />
          <div className="result-chart large" ref={ref} />
          {current.key === 'ca' ? (
            <MatrixScaleLegend
              matrix={result.preview.matrices.ca}
              activeValue={activeMatrixValue}
            />
          ) : null}
        </section>
        <aside className="panel result-visual-toolbox" aria-label="结果视图工具箱">
          <WorkbenchSectionHeader title="结果视图" meta="切换当前任务的真实结果图" />
          <div className="result-visualization-list">
            {options.map((item) => {
              const Icon = item.icon;
              return <button key={item.key} type="button" className={selected === item.key ? 'active' : ''} onClick={() => setSelected(item.key)}><Icon size={16} /><span><strong>{item.title}</strong><small>{item.description}</small></span></button>;
            })}
          </div>
          <dl className="result-view-summary">
            {summary.map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{String(value)}</dd></div>)}
          </dl>
          <button type="button" className="btn btn-primary result-view-detail-button" onClick={() => navigate(taskResultPath(current.section, task.id))}>
            打开专业分析页 <ArrowRight size={15} />
          </button>
        </aside>
      </div>
      <section className="panel result-view-catalog" aria-label="可视化目录">
        <WorkbenchSectionHeader title="可视化目录" meta="四类结果视图对应不同分析环节" />
        <div>
          {options.map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.key} onClick={() => setSelected(item.key)}><Icon size={17} /><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowRight size={14} /></button>;
          })}
        </div>
      </section>
    </section>
  );
}

function distributionRows(result: AnalysisResult, field: 'predictedLabel' | 'trueLabel') {
  const counts = new Map<string, number>();
  result.preview.scatter.points.forEach((point) => counts.set(point[field], (counts.get(point[field]) ?? 0) + 1));
  const total = Math.max(1, result.preview.scatter.points.length);
  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([label, count]) => ({ label, count, percent: count / total * 100 }));
}

export function ResultsAnalysisPage({ resource }: { resource: TaskResultResource }) {
  const result = resource.envelope!.result!;
  const metricTrend = useMemo(() => buildMetricRunsOption(result), [result]);
  const runs = result.metrics.runs;
  const bestRun = runs.length ? [...runs].sort((left, right) => right.acc - left.acc)[0] : null;
  const stableMetric = (Object.keys(metricLabels) as MetricKey[]).sort((left, right) => result.metrics.aggregate[left].std - result.metrics.aggregate[right].std)[0];
  const convergedCount = result.convergence.runs.filter((item) => item.converged).length;
  const averageRuntime = runs.length ? runs.reduce((sum, item) => sum + item.runtimeSeconds, 0) / runs.length : null;
  const predicted = distributionRows(result, 'predictedLabel');
  const truth = distributionRows(result, 'trueLabel');

  return (
    <section className="soft-page result-detail-page result-analysis-page">
      <ReadyHeader title="结果分析" icon={BarChart3} resource={resource} />
      <MetricStrip result={result} />
      <section className="panel result-analysis-summary-panel" aria-label="实验诊断摘要">
        <div className="result-analysis-summary-heading">
          <WorkbenchSectionHeader title="实验诊断摘要" meta="先查看结论，再结合下方图表核对证据" />
          <WorkbenchStatus tone={convergedCount > 0 ? 'success' : 'warning'}>
            {convergedCount > 0 ? `${convergedCount} 轮提前收敛` : '全部达到迭代上限'}
          </WorkbenchStatus>
        </div>
        <div className="result-analysis-summary-body">
          <dl className="result-analysis-facts">
            <div className="is-primary"><dt>最高 ACC 轮次</dt><dd>{bestRun ? `第 ${bestRun.run} 轮 · ${formatPercent(bestRun.acc)}` : '—'}</dd></div>
            <div className="is-primary"><dt>最稳定指标</dt><dd>{metricLabels[stableMetric]} · std {formatPercent(result.metrics.aggregate[stableMetric].std)}</dd></div>
            <div><dt>提前收敛轮次</dt><dd>{convergedCount} / {result.convergence.runs.length}</dd></div>
            <div><dt>平均单轮耗时</dt><dd>{formatNumber(averageRuntime, 2)} s</dd></div>
            <div><dt>代表轮次</dt><dd>第 {result.preview.summary.representativeRun} 轮</dd></div>
            <div><dt>随机种子起点</dt><dd>{result.preview.summary.randomSeed}</dd></div>
          </dl>
          <WorkbenchNotice tone="info" icon={Activity} title="代表轮次不是最优轮次" detail="后端选择最接近各指标均值的轮次，用于降低单次极值偏差。" />
        </div>
      </section>
      <div className="result-analysis-evidence" role="region" aria-label="实验图表证据">
        <div className="result-analysis-scatter">
          <ScatterPanel result={result} />
        </div>
        <div className="result-analysis-convergence">
          <ConvergencePanel result={result} />
        </div>
        <div className="result-analysis-trend">
          <OptionChartPanel
            title="重复实验指标趋势"
            meta={`${runs.length} 轮真实运行，统一按百分比展示`}
            option={metricTrend}
            hasData={runs.length > 0}
            emptyTitle="暂无指标趋势"
            emptyDetail="当前任务没有逐轮指标数据。"
          />
        </div>
      </div>
      <section className="panel result-distribution-panel" aria-label="标签分布对照">
        <WorkbenchSectionHeader title="标签分布对照" meta={result.preview.scatter.sampled ? '基于当前抽样预览点统计' : '基于全部预览点统计'} />
        <div className="result-distribution-columns">
          {[['预测簇', predicted], ['真实标签', truth]].map(([title, rows]) => (
            <div className="result-distribution-column" key={title as string}>
              <strong>{title as string}</strong>
              {(rows as ReturnType<typeof distributionRows>).map((row) => (
                <div className="result-distribution-row" key={row.label}>
                  <span>类别 {row.label}</span><i><b style={{ width: `${row.percent}%` }} /></i><strong>{row.count}</strong><small>{row.percent.toFixed(1)}%</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function ExportResultPage({ resource }: { resource: TaskResultResource }) {
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;
  const [selected, setSelected] = useState<string[]>(['metrics', 'parameters', 'labels']);
  const [exports, setExports] = useState<TaskExport[]>([]);
  const [archiveName, setArchiveName] = useState(`${task.datasetName} · ${task.mode} 交付档案`);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const totalSize = result.artifacts.reduce((sum, item) => sum + item.size, 0);
  const reload = () => void fetchTaskExports(task.id).then((response) => setExports(response.items)).catch(() => undefined);

  useEffect(reload, [task.id]);

  const create = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const item = await createTaskExport(task.id, selected, archiveName);
      setMessage(`已生成 ${item.filename}`);
      reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败');
    } finally {
      setSubmitting(false);
    }
  };
  const toggle = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  return (
    <section className="soft-page result-detail-page result-export-page">
      <ReadyHeader title="结果导出" icon={Download} resource={resource} />
      <WorkbenchMetricStrip
        label="交付摘要"
        metrics={[
          { label: '完整产物', value: `${result.artifacts.length} 项`, note: '后端持久化文件', icon: Archive, tone: 'blue' },
          { label: '产物体积', value: formatBytes(totalSize), note: '不含新生成 ZIP', icon: HardDrive, tone: 'neutral' },
          { label: '当前选择', value: `${selected.length} 项`, note: '组合导出内容', icon: ListChecks, tone: 'teal' },
          { label: '导出记录', value: `${exports.length} 条`, note: '当前任务历史', icon: History, tone: 'green' },
        ]}
      />
      <section className="panel result-export-builder result-export-composer" aria-label="创建交付档案">
        <WorkbenchSectionHeader title="创建交付档案" meta="为本次交付命名、选择预设，并确认需要归档的数据" actions={<WorkbenchStatus tone="info">自动附带 manifest.json</WorkbenchStatus>} />
        <div className="result-export-compose-grid">
          <div className="result-export-setup">
            <label className="result-export-name-field">
              <span>档案名称</span>
              <input value={archiveName} maxLength={128} onChange={(event) => setArchiveName(event.target.value)} placeholder="例如：论文复现实验交付包" />
            </label>
            <div className="result-export-presets" aria-label="交付预设">
              {exportPresets.map((preset) => (
                <button key={preset.key} type="button" onClick={() => setSelected([...preset.items])}>
                  <span><strong>{preset.label}</strong><small>{preset.detail}</small></span>
                  <span>{preset.items.length} 项</span>
                </button>
              ))}
            </div>
            <dl className="result-export-manifest">
              <div><dt>任务</dt><dd>#{task.id} · {task.name}</dd></div>
              <div><dt>数据集</dt><dd>{task.datasetName}</dd></div>
              <div><dt>算法</dt><dd>{task.mode}</dd></div>
              <div><dt>代表轮次</dt><dd>第 {result.preview.summary.representativeRun} 轮</dd></div>
            </dl>
          </div>
          <div className="result-export-selection">
            <header><strong>归档内容</strong><span>已选择 {selected.length} / {exportOptions.length}</span></header>
          <div className="result-export-option-list">
            {exportOptions.map((item) => {
              const Icon = item.icon;
              const checked = selected.includes(item.key);
              return (
                <label className={checked ? 'selected' : ''} key={item.key}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(item.key)} />
                  <Icon size={16} aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </label>
              );
            })}
          </div>
            <button type="button" className="btn btn-primary result-export-submit" disabled={!selected.length || !archiveName.trim() || submitting} onClick={() => void create()}><PackageCheck size={16} />{submitting ? '正在生成档案…' : `创建交付档案（${selected.length} 项）`}</button>
          </div>
        </div>
          {message ? <WorkbenchNotice tone="info" icon={CheckCircle2} title="导出状态" detail={message} /> : null}
      </section>
      <div className="result-export-library">
        <section className="panel result-export-history-panel">
          <WorkbenchSectionHeader title="交付档案" meta={`任务 #${task.id} 的可追溯 ZIP 档案`} actions={<button type="button" className="text-action" onClick={reload}>刷新记录</button>} />
          {exports.length ? (
            <div className="result-export-archive-list" aria-label="交付档案记录">
              {exports.map((item) => (
                <article className="result-export-archive" key={item.id}>
                  <span className="result-export-archive-icon"><PackageOpen size={18} /></span>
                  <div className="result-export-archive-main">
                    <strong>{item.name}</strong>
                    <small>{item.filename}</small>
                    <div>{exportItemLabels(item.items).map((label) => <span key={label}>{label}</span>)}</div>
                  </div>
                  <div className="result-export-archive-meta">
                    <span>{item.itemCount || '旧版'} 项</span><strong>{formatBytes(item.fileSize)}</strong><time>{item.createdAt}</time>
                  </div>
                  <WorkbenchStatus tone="success">{item.status === 'ready' ? '可下载' : item.status}</WorkbenchStatus>
                  <button type="button" className="btn btn-secondary" onClick={() => void downloadProtectedFile(item.downloadUrl, item.filename)}><Download size={14} />下载</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="result-export-empty">
              <PackageOpen size={24} aria-hidden="true" />
              <strong>还没有交付档案</strong>
              <span>使用上方预设创建第一份带清单的 ZIP，之后可在这里重复下载。</span>
            </div>
          )}
        </section>
        <section className="panel result-artifact-panel">
          <WorkbenchSectionHeader title="原始产物" meta="由任务直接生成，可单独下载" actions={<WorkbenchStatus tone="success">{result.artifacts.length} 项可用</WorkbenchStatus>} />
          <div className="result-artifact-list">
            {result.artifacts.map((artifact) => (
              <article className="result-artifact-item" key={artifact.key}>
                <span className="result-artifact-icon"><FileArchive size={17} /></span>
                <span><strong>{artifact.name}</strong><small>{artifact.key} · {artifact.format}</small></span>
                <span><small>文件大小</small><strong>{formatBytes(artifact.size)}</strong></span>
                <button type="button" className="btn btn-secondary" title={`下载${artifact.name}`} aria-label={`下载${artifact.name}`} onClick={() => void downloadProtectedFile(artifact.downloadUrl, `${artifact.key}.${artifact.format.toLowerCase()}`)}><Download size={14} /></button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function buildReportMarkdown(data: Record<string, unknown>, selected: ReportSection[]) {
  const lines = [`# ${String(data.title)}`, '', `任务：#${String(data.taskId)}`, `数据集：${String(data.dataset)}`, `算法：${String(data.mode)}`, ''];
  const record = data as any;
  if (selected.includes('summary')) lines.push('## 任务摘要', '', `- 样本：${record.summary.sampleCount}`, `- 类别：${record.summary.classCount}`, `- 基础聚类：${record.summary.baseClusterCount}`, `- 运行耗时：${formatNumber(record.runtimeSeconds, 2)} s`, '');
  if (selected.includes('metrics')) lines.push('## 性能指标', '', ...(Object.keys(metricLabels) as MetricKey[]).map((key) => `- ${metricLabels[key]}：${formatPercent(record.metrics[key].mean)}（标准差 ${formatPercent(record.metrics[key].std)}）`), '');
  if (selected.includes('parameters')) lines.push('## 算法参数', '', ...Object.entries(record.parameters).map(([key, value]) => `- ${key}：${String(value)}`), '');
  if (selected.includes('runs')) lines.push('## 重复实验', '', ...record.runs.map((run: any) => `- 第 ${run.run} 轮：ACC ${formatPercent(run.acc)}，NMI ${formatPercent(run.nmi)}，ARI ${formatPercent(run.ari)}，F1 ${formatPercent(run.f1)}`), '');
  if (selected.includes('artifacts')) lines.push('## 结果产物', '', ...record.artifacts.map((item: any) => `- ${item.name}（${item.format}，${formatBytes(item.size)}）`), '');
  return lines.join('\n');
}

export function ReportResultPage({ resource }: { resource: TaskResultResource }) {
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;
  const [title, setTitle] = useState(`${task.datasetName} 分析报告`);
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');
  const [sections, setSections] = useState<ReportSection[]>(['summary', 'metrics', 'parameters', 'runs', 'artifacts']);
  const [expandedSections, setExpandedSections] = useState<ReportSection[]>(['summary', 'metrics']);
  const parameters = Object.entries(result.parameters);
  const previewRuns = result.metrics.runs.slice(0, 5);
  const expandedSectionCount = sections.filter((section) => expandedSections.includes(section)).length;
  const reportSectionMeta: Record<ReportSection, string> = {
    summary: '6 项信息',
    metrics: `${Object.keys(metricLabels).length} 项指标`,
    parameters: `${parameters.length} 项参数`,
    runs: `${result.metrics.runs.length} 轮数据`,
    artifacts: `${result.artifacts.length} 项产物`,
  };
  const report = useMemo(() => ({
    title,
    taskId: task.id,
    dataset: task.datasetName,
    mode: task.mode,
    finishedAt: task.finishedAt,
    runtimeSeconds: result.runtimeSeconds,
    summary: result.preview.summary,
    metrics: result.metrics.aggregate,
    parameters: result.parameters,
    runs: result.metrics.runs,
    artifacts: result.artifacts,
  }), [result, task, title]);

  const toggleSection = (section: ReportSection) => setSections((current) => current.includes(section) ? current.filter((item) => item !== section) : [...current, section]);
  const togglePreviewSection = (section: ReportSection, expanded: boolean) => {
    setExpandedSections((current) => expanded
      ? (current.includes(section) ? current : [...current, section])
      : current.filter((item) => item !== section));
  };
  const expandAllPreviewSections = () => setExpandedSections(sections);
  const collapseAllPreviewSections = () => setExpandedSections([]);
  const exportReport = () => {
    const selectedData = Object.fromEntries(Object.entries(report).filter(([key]) => !['summary', 'metrics', 'parameters', 'runs', 'artifacts'].includes(key) || sections.includes(key as ReportSection)));
    const content = format === 'json' ? JSON.stringify(selectedData, null, 2) : buildReportMarkdown(report, sections);
    downloadTextFile(`${title || 'omelet-report'}.${format === 'json' ? 'json' : 'md'}`, content, format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8');
  };

  return (
    <section className="soft-page result-detail-page result-report-page">
      <ReadyHeader title="分析报告" icon={FileText} resource={resource} />
      <WorkbenchMetricStrip
        label="报告摘要"
        metrics={[
          { label: '已选章节', value: `${sections.length} / ${reportSectionOptions.length}`, note: '控制预览和导出内容', icon: ListChecks, tone: 'blue' },
          { label: '重复实验', value: `${result.metrics.runs.length} 轮`, note: '真实运行明细', icon: Activity, tone: 'teal' },
          { label: '算法参数', value: `${parameters.length} 项`, note: '来自任务持久化结果', icon: SlidersHorizontal, tone: 'neutral' },
          { label: '结果产物', value: `${result.artifacts.length} 项`, note: '纳入交付清单', icon: Archive, tone: 'green' },
        ]}
      />
      <div className="result-report-workspace">
        <section className="panel result-report-controls">
          <WorkbenchSectionHeader title="报告设置" meta="调整名称、格式和交付章节" />
          <label className="task-form-field"><span>报告名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <fieldset className="result-report-format"><legend>文件格式</legend><div className="soft-segmented"><button type="button" className={`soft-segment ${format === 'markdown' ? 'active' : ''}`} onClick={() => setFormat('markdown')}><FileText size={14} />Markdown</button><button type="button" className={`soft-segment ${format === 'json' ? 'active' : ''}`} onClick={() => setFormat('json')}><FileJson size={14} />JSON</button></div></fieldset>
          <fieldset className="result-report-sections"><legend>报告章节</legend>{reportSectionOptions.map((item) => <label className={sections.includes(item.key) ? 'selected' : ''} key={item.key}><input type="checkbox" checked={sections.includes(item.key)} onChange={() => toggleSection(item.key)} /><span><strong>{item.label}</strong><small>{item.detail}</small></span></label>)}</fieldset>
          <button type="button" className="btn btn-primary result-report-submit" disabled={!sections.length} onClick={exportReport}><Download size={15} />生成 {format === 'json' ? 'JSON' : 'Markdown'} 报告</button>
        </section>
        <section className="panel result-report-preview">
          <WorkbenchSectionHeader
            title="报告预览"
            meta="所有内容均来自当前任务持久化结果"
            actions={(
              <div className="result-report-preview-actions">
                <WorkbenchStatus tone="info">{expandedSectionCount} / {sections.length} 展开</WorkbenchStatus>
                <button
                  type="button"
                  className="result-report-action"
                  title="全部展开"
                  aria-label="全部展开报告章节"
                  disabled={!sections.length}
                  onClick={expandAllPreviewSections}
                >
                  <ChevronsDown size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="result-report-action"
                  title="全部收起"
                  aria-label="全部收起报告章节"
                  disabled={!sections.length}
                  onClick={collapseAllPreviewSections}
                >
                  <ChevronsUp size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          />
          <article className="report-document result-report-document">
            <header><span>OMELET LAB · ANALYSIS REPORT</span><strong>{title || '未命名报告'}</strong><small>任务 #{task.id} · {task.finishedAt ?? '未完成'}</small></header>
            {sections.includes('summary') ? (
              <ReportPreviewSection section="summary" title="任务摘要" meta={reportSectionMeta.summary} expanded={expandedSections.includes('summary')} onToggle={togglePreviewSection}>
                <div className="report-document-summary"><div><span>数据集</span><strong>{task.datasetName}</strong></div><div><span>算法</span><strong>{task.mode}</strong></div><div><span>样本</span><strong>{result.preview.summary.sampleCount}</strong></div><div><span>类别</span><strong>{result.preview.summary.classCount}</strong></div><div><span>基础聚类</span><strong>{result.preview.summary.baseClusterCount}</strong></div><div><span>耗时</span><strong>{formatNumber(result.runtimeSeconds, 2)} s</strong></div></div>
              </ReportPreviewSection>
            ) : null}
            {sections.includes('metrics') ? (
              <ReportPreviewSection section="metrics" title="性能指标" meta={reportSectionMeta.metrics} expanded={expandedSections.includes('metrics')} onToggle={togglePreviewSection}>
                <div className="report-document-metrics">{(Object.keys(metricLabels) as MetricKey[]).map((key) => <div key={key}><span>{metricLabels[key]}</span><strong>{formatPercent(result.metrics.aggregate[key].mean)}</strong><small>std {formatPercent(result.metrics.aggregate[key].std)} · {formatPercent(result.metrics.aggregate[key].min)}–{formatPercent(result.metrics.aggregate[key].max)}</small></div>)}</div>
              </ReportPreviewSection>
            ) : null}
            {sections.includes('parameters') ? (
              <ReportPreviewSection section="parameters" title="算法参数" meta={reportSectionMeta.parameters} expanded={expandedSections.includes('parameters')} onToggle={togglePreviewSection}>
                <div className="report-parameter-list">{parameters.map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}</div>
              </ReportPreviewSection>
            ) : null}
            {sections.includes('runs') ? (
              <ReportPreviewSection section="runs" title="重复实验" meta={reportSectionMeta.runs} expanded={expandedSections.includes('runs')} onToggle={togglePreviewSection}>
                <div className="report-run-table"><div className="header"><span>轮次</span><span>ACC</span><span>NMI</span><span>ARI</span><span>F1</span></div>{previewRuns.map((run) => <div key={run.run}><strong>第 {run.run} 轮</strong><span>{formatPercent(run.acc)}</span><span>{formatPercent(run.nmi)}</span><span>{formatPercent(run.ari)}</span><span>{formatPercent(run.f1)}</span></div>)}</div>{result.metrics.runs.length > previewRuns.length ? <small className="report-preview-note">预览前 {previewRuns.length} 轮，导出文件包含全部 {result.metrics.runs.length} 轮。</small> : null}
              </ReportPreviewSection>
            ) : null}
            {sections.includes('artifacts') ? (
              <ReportPreviewSection section="artifacts" title="结果产物" meta={reportSectionMeta.artifacts} expanded={expandedSections.includes('artifacts')} onToggle={togglePreviewSection}>
                {result.artifacts.length ? <div className="report-artifact-list">{result.artifacts.map((item) => <div key={item.key}><FileArchive size={14} /><span>{item.name}</span><strong>{item.format} · {formatBytes(item.size)}</strong></div>)}</div> : <p className="report-preview-empty">当前任务没有可交付的结果产物。</p>}
              </ReportPreviewSection>
            ) : null}
          </article>
        </section>
      </div>
    </section>
  );
}
