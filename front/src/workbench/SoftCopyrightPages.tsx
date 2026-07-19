import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileJson,
  FileText,
  Filter,
  Images,
  LayoutGrid,
  Network,
  Play,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Target,
  TrendingDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  WorkbenchMetricStrip,
  WorkbenchNotice,
  WorkbenchPageHeader,
  WorkbenchProgress,
  WorkbenchSectionHeader,
  WorkbenchStatus,
} from './WorkbenchUi';

type ResultMetric = {
  label: string;
  value: string;
  note: string;
};

export type VisualizationPageProps = {
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
  convergenceOption: EChartsOption;
  scatterOption: EChartsOption;
};

export type PerformanceEvaluationPageProps = {
  metrics: ResultMetric[];
};

type VisualizationKey = 'ca' | 'weights' | 'topology' | 'scatter' | 'convergence';

const kernelOptions = [
  {
    key: 'rbf',
    label: 'RBF 核',
    formula: 'K(i,j) = exp(-||xi-xj||^2 / 2σ^2)',
    params: [
      ['sigma', '1.00'],
      ['lambda', '5.00'],
      ['gamma', '5.00'],
      ['max_iter', '10'],
    ],
  },
  {
    key: 'linear',
    label: '线性核',
    formula: 'K(i,j) = xi · xj',
    params: [
      ['normalize', 'true'],
      ['lambda', '5.00'],
      ['gamma', '5.00'],
      ['max_iter', '10'],
    ],
  },
  {
    key: 'poly',
    label: '多项式核',
    formula: 'K(i,j) = (γ xi·xj + coef0)^d',
    params: [
      ['degree', '3'],
      ['gamma', '0.50'],
      ['coef0', '1.00'],
      ['max_iter', '10'],
    ],
  },
];

const runStats = [
  ['1', '91.8%', '86.7%', '83.1%', '88.5%', '18.2s'],
  ['2', '90.4%', '85.9%', '81.6%', '87.2%', '18.7s'],
  ['3', '92.1%', '87.1%', '83.9%', '89.0%', '17.9s'],
  ['4', '90.9%', '86.2%', '82.4%', '87.8%', '18.5s'],
];

const reportSections = [
  { key: 'summary', title: '数据摘要', detail: '样本规模、基础聚类数量、类别标签完整性' },
  { key: 'parameters', title: '算法参数', detail: '核函数、n_base、lambda、gamma、迭代次数' },
  { key: 'metrics', title: '性能指标', detail: 'ACC、NMI、ARI、F1-score 与重复实验统计' },
  { key: 'charts', title: '图像结果', detail: 'CA 矩阵、核权重、散点图与收敛曲线' },
  { key: 'logs', title: '运行日志', detail: '任务开始、迭代更新、结果保存与导出记录' },
];

const operationLogs = [
  { level: 'info', action: '数据导入', message: 'Ionosphere 基础聚类结果上传完成', time: '2026-07-09 19:16:14', source: 'dataset' },
  { level: 'info', action: '质量检查', message: '矩阵维度与标签数量校验通过', time: '2026-07-09 19:16:20', source: 'quality' },
  { level: 'warning', action: '任务执行', message: '第 6 轮目标函数下降幅度低于阈值', time: '2026-07-09 19:18:03', source: 'task' },
  { level: 'info', action: '结果保存', message: '聚类标签、指标表格与预览图写入结果目录', time: '2026-07-09 19:19:27', source: 'result' },
  { level: 'error', action: '导出报告', message: 'Synthetic Benchmark 缺少完整质量检查记录', time: '2026-07-09 19:22:10', source: 'report' },
] as const;

function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function useChart(option: EChartsOption) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return undefined;

    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [option]);

  return ref;
}

export function KernelConfigPage() {
  const [activeKernel, setActiveKernel] = useState(kernelOptions[0].key);
  const kernel = kernelOptions.find((item) => item.key === activeKernel) ?? kernelOptions[0];
  const [parameters, setParameters] = useState<Record<string, string>>(() => Object.fromEntries(kernel.params));
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setParameters(Object.fromEntries(kernel.params));
    setApplied(false);
  }, [kernel]);

  function savePreset() {
    downloadTextFile(
      `kernel-${kernel.key}-preset.json`,
      JSON.stringify({ kernel: kernel.key, parameters }, null, 2),
      'application/json',
    );
  }

  return (
    <section className="soft-page kernel-config-page" aria-label="核函数配置">
      <WorkbenchPageHeader
        icon={SlidersHorizontal}
        title="核函数配置"
        context="任务草稿 #OMELET-072 · Ionosphere · 4 组基础核矩阵"
        status={<WorkbenchStatus tone={applied ? 'success' : 'info'}>{applied ? '草稿已更新' : '参数有效'}</WorkbenchStatus>}
        actions={
          <button type="button" className="btn btn-secondary" onClick={savePreset}>
            <Save size={15} aria-hidden="true" />
            保存预设
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="核配置摘要"
        metrics={[
          { label: '基础核矩阵', value: '4 组', note: 'K1 - K4 均已构建', icon: Boxes, tone: 'blue' },
          { label: '当前编辑', value: kernel.label, note: kernel.key === 'rbf' ? '局部相似性' : kernel.key === 'linear' ? '全局线性结构' : '高阶非线性关系', icon: Network, tone: 'teal' },
          { label: '矩阵维度', value: '351 × 351', note: '与样本数量一致', icon: LayoutGrid, tone: 'neutral' },
          { label: '参数校验', value: '4 / 4', note: '没有越界或缺失项', icon: CheckCircle2, tone: 'green' },
        ]}
      />

      <div className="soft-two-column kernel-config-grid">
        <section className="panel soft-kernel-panel" aria-label="核函数参数">
          <WorkbenchSectionHeader title="参数编辑" meta="更改会先保存在当前任务草稿中。" />
          <div className="soft-segmented" role="tablist" aria-label="选择核函数类型">
            {kernelOptions.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={item.key === activeKernel}
                className={`soft-segment ${item.key === activeKernel ? 'active' : ''}`}
                key={item.key}
                onClick={() => setActiveKernel(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="soft-formula-box">
            <span>当前公式</span>
            <strong>{kernel.formula}</strong>
          </div>
          <div className="soft-param-grid">
            {kernel.params.map(([name]) => (
              <label key={name}>
                <span>{name}</span>
                <input
                  value={parameters[name] ?? ''}
                  aria-label={`${kernel.label} ${name}`}
                  onChange={(event) => {
                    setParameters((current) => ({ ...current, [name]: event.target.value }));
                    setApplied(false);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="kernel-validation-list">
            <span><CheckCircle2 size={14} aria-hidden="true" />数值范围有效</span>
            <span><CheckCircle2 size={14} aria-hidden="true" />矩阵规模匹配</span>
            <span><CheckCircle2 size={14} aria-hidden="true" />归一化策略可用</span>
          </div>
          <button type="button" className="btn btn-primary soft-full-button" onClick={() => setApplied(true)}>
            <Play size={15} aria-hidden="true" />
            应用到任务草稿
          </button>
        </section>

        <section className="panel soft-matrix-panel" aria-label="基础核矩阵预览">
          <WorkbenchSectionHeader
            title="基础核矩阵预览"
            meta="K1 - K4 · 已归一化 · 对称性检查通过"
            actions={<WorkbenchStatus tone="success">就绪</WorkbenchStatus>}
          />
          <div className="soft-kernel-grid" aria-label="核矩阵结构预览">
            {Array.from({ length: 36 }, (_, index) => (
              <span key={index} style={{ opacity: 0.25 + ((index * 7) % 10) / 14 }} />
            ))}
          </div>
          <div className="kernel-matrix-legend">
            <span><i className="low" />低相似</span>
            <span><i className="mid" />中相似</span>
            <span><i className="high" />高相似</span>
          </div>
          <div className="kernel-source-list">
            {[
              ['K1', 'RBF · σ = 1', '0.31'],
              ['K2', 'Linear · normalized', '0.22'],
              ['K3', 'RBF · σ = 2', '0.29'],
              ['K4', 'Polynomial · d = 3', '0.18'],
            ].map(([name, detail, weight]) => (
              <div key={name}><Boxes size={15} aria-hidden="true" /><strong>{name}</strong><span>{detail}</span><b>α {weight}</b></div>
            ))}
          </div>
        </section>
      </div>

      {applied ? (
        <WorkbenchNotice tone="success" icon={CheckCircle2} title="参数已写入任务草稿" detail={`${kernel.label} 将用于下一次矩阵重建。`} />
      ) : null}
    </section>
  );
}

export function PerformanceEvaluationPage({ metrics }: PerformanceEvaluationPageProps) {
  function exportMetrics() {
    const content = ['run,ACC,NMI,ARI,F1,runtime', ...runStats.map((row) => row.join(','))].join('\n');
    downloadTextFile('omelet-performance.csv', content, 'text/csv;charset=utf-8');
  }

  return (
    <section className="soft-page performance-page" aria-label="性能评估">
      <WorkbenchPageHeader
        icon={ClipboardCheck}
        title="性能评估"
        context="任务 #OMELET-072 · 10 次重复实验 · 95% 置信区间"
        status={<WorkbenchStatus tone="success">评估完成</WorkbenchStatus>}
        actions={
          <button type="button" className="btn btn-primary" onClick={exportMetrics}>
            <Download size={15} aria-hidden="true" />
            导出指标
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="页面关键指标"
        metrics={metrics.slice(0, 4).map((metric, index) => ({
          label: metric.label,
          value: metric.value,
          note: index === 0 ? '较对照方法提升 3.8%' : metric.note,
          icon: [Target, Network, Boxes, ClipboardCheck][index],
          tone: (['green', 'blue', 'teal', 'neutral'] as const)[index],
        }))}
      />

      <div className="performance-layout">
        <section className="panel soft-table-panel" aria-label="多次运行统计">
          <WorkbenchSectionHeader title="多次运行统计" meta="当前显示最近 4 次，数值按原始运行顺序排列。" />
          <div className="soft-data-table evaluation" role="table" aria-label="性能评估明细">
            <div className="soft-data-row header" role="row">
              <span role="columnheader">运行</span><span role="columnheader">ACC</span><span role="columnheader">NMI</span><span role="columnheader">ARI</span><span role="columnheader">F1-score</span><span role="columnheader">耗时</span>
            </div>
            {runStats.map((row) => (
              <div className="soft-data-row" role="row" key={row[0]}>
                {row.map((cell, index) => <span role="cell" key={`${row[0]}-${index}`}>{index === 0 ? `第 ${cell} 次` : cell}</span>)}
              </div>
            ))}
          </div>
        </section>

        <section className="panel performance-stability-panel" aria-label="稳定性诊断">
          <WorkbenchSectionHeader title="稳定性诊断" meta="跨运行标准差均低于 2.2%。" actions={<WorkbenchStatus tone="success">稳定</WorkbenchStatus>} />
          <div className="performance-score">
            <div><span>综合稳定度</span><strong>96.4</strong><small>/ 100</small></div>
            <TrendingDown size={22} aria-hidden="true" />
          </div>
          <div className="performance-progress-list">
            <WorkbenchProgress value={98} label="ACC 稳定度" tone="green" />
            <WorkbenchProgress value={99} label="NMI 稳定度" tone="blue" />
            <WorkbenchProgress value={97} label="ARI 稳定度" tone="teal" />
            <WorkbenchProgress value={98} label="F1 稳定度" tone="amber" />
          </div>
          <WorkbenchNotice tone="success" icon={CheckCircle2} title="重复实验一致" detail="没有发现离群运行或异常耗时。" />
        </section>
      </div>

      <section className="panel performance-comparison-panel" aria-label="方法基线对比">
        <WorkbenchSectionHeader
          title="方法基线对比"
          meta="同一数据集、相同重复次数与随机种子设置。"
          actions={<WorkbenchStatus tone="success">OMELET-SV 最优</WorkbenchStatus>}
        />
        <div className="performance-comparison-table" role="table" aria-label="聚类方法基线对比">
          <div className="performance-comparison-row header" role="row">
            <span role="columnheader">方法</span><span role="columnheader">ACC</span><span role="columnheader">NMI</span><span role="columnheader">ARI</span><span role="columnheader">F1</span><span role="columnheader">相对提升</span>
          </div>
          {[
            ['OMELET-SV', '91.2%', '86.4%', '82.7%', '88.0%', '+3.8%', 'best'],
            ['OMELET', '89.6%', '84.9%', '80.8%', '86.7%', '+2.1%', 'good'],
            ['Spectral', '87.4%', '81.8%', '77.2%', '83.9%', '基线', 'base'],
          ].map(([method, acc, nmi, ari, f1, gain, tone]) => (
            <div className={`performance-comparison-row ${tone}`} role="row" key={method}>
              <strong role="cell">{method}</strong><span role="cell">{acc}</span><span role="cell">{nmi}</span><span role="cell">{ari}</span><span role="cell">{f1}</span><b role="cell">{gain}</b>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export function VisualizationShowcasePage({
  weightsOption,
  topologyOption,
  convergenceOption,
  scatterOption,
}: VisualizationPageProps) {
  const visualizations = useMemo<Array<{
    key: VisualizationKey;
    title: string;
    note: string;
    icon: LucideIcon;
    option: EChartsOption;
    metric: string;
  }>>(
    () => [
      { key: 'ca', title: 'CA 矩阵热力图', note: '351 × 351 · 均值 0.34', icon: LayoutGrid, option: topologyOption, metric: '5 组高共聚样本对' },
      { key: 'weights', title: '核权重分布', note: 'K1 - K4 · 权重和 1.00', icon: BarChart3, option: weightsOption, metric: '主导核 K1 · 0.31' },
      { key: 'topology', title: '拓扑亲和矩阵', note: '去噪矩阵 S · 稀疏度 68%', icon: Network, option: topologyOption, metric: '结构保留率 92.6%' },
      { key: 'scatter', title: '聚类散点图', note: '2 个簇 · 351 个样本', icon: Target, option: scatterOption, metric: '轮廓系数 0.71' },
      { key: 'convergence', title: '收敛曲线', note: '10 轮迭代 · 第 6 轮稳定', icon: TrendingDown, option: convergenceOption, metric: '目标函数 113.9' },
    ],
    [convergenceOption, scatterOption, topologyOption, weightsOption],
  );
  const [activeKey, setActiveKey] = useState<VisualizationKey>('ca');
  const active = visualizations.find((item) => item.key === activeKey) ?? visualizations[0];
  const chartRef = useChart(active.option);

  function exportChart() {
    const svg = chartRef.current?.querySelector('svg')?.outerHTML;
    if (!svg) return;
    downloadTextFile(`${active.key}-visualization.svg`, svg, 'image/svg+xml;charset=utf-8');
  }

  return (
    <section className="soft-page visualization-page" aria-label="可视化展示">
      <WorkbenchPageHeader
        icon={Images}
        title="可视化展示"
        context="任务 #OMELET-072 · Ionosphere · 5 个结果视图"
        status={<WorkbenchStatus tone="success">图表已同步</WorkbenchStatus>}
        actions={
          <button type="button" className="btn btn-primary" onClick={exportChart}>
            <Download size={15} aria-hidden="true" />
            导出当前图
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="可视化摘要"
        metrics={[
          { label: '结果视图', value: '5 个', note: '矩阵、权重、分布与收敛', icon: Images, tone: 'blue' },
          { label: '当前视图', value: active.title, note: active.note, icon: active.icon, tone: 'teal' },
          { label: '图像规格', value: '1600 × 900', note: 'SVG 矢量导出', icon: LayoutGrid, tone: 'neutral' },
          { label: '结果状态', value: '已验证', note: '与任务 #OMELET-072 一致', icon: CheckCircle2, tone: 'green' },
        ]}
      />

      <div className="visualization-workspace">
        <section className="panel visualization-featured" aria-label={active.title}>
          <WorkbenchSectionHeader
            title={active.title}
            meta={active.note}
            actions={<WorkbenchStatus tone="info">{active.metric}</WorkbenchStatus>}
          />
          <div className="visualization-chart" ref={chartRef} />
          <div className="visualization-chart-footer">
            <span><Clock3 size={14} aria-hidden="true" />更新于 10:31:42</span>
            <span><CheckCircle2 size={14} aria-hidden="true" />数据与任务结果一致</span>
          </div>
        </section>

        <aside className="panel visualization-index" aria-label="结果视图列表">
          <WorkbenchSectionHeader title="结果视图" meta="选择需要检查或导出的图表。" />
          <div className="visualization-view-list" role="tablist" aria-label="选择可视化视图">
            {visualizations.map((item) => {
              const Icon = item.icon;
              const selected = item.key === activeKey;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={selected ? 'active' : ''}
                  key={item.key}
                  onClick={() => setActiveKey(item.key)}
                >
                  <span className="visualization-view-icon" aria-hidden="true"><Icon size={17} /></span>
                  <span><strong>{item.title}</strong><small>{item.note}</small></span>
                  {selected ? <i>当前</i> : null}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function ReportCenterPage() {
  const [selectedSections, setSelectedSections] = useState<string[]>(reportSections.map((section) => section.key));
  const [title, setTitle] = useState('新材料数据分析报告');
  const [author, setAuthor] = useState('OMELET Lab');
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');
  const [generated, setGenerated] = useState(false);

  function toggleSection(key: string) {
    setSelectedSections((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setGenerated(false);
  }

  function generateReport() {
    const included = reportSections.filter((section) => selectedSections.includes(section.key));
    const report = {
      title,
      author,
      dataset: 'Ionosphere',
      mode: 'OMELET-SV',
      metrics: { ACC: '91.2%', NMI: '86.4%', ARI: '82.7%', F1: '88.0%' },
      sections: included.map((section) => section.title),
    };
    const content = format === 'json'
      ? JSON.stringify(report, null, 2)
      : `# ${title}\n\n作者：${author}\n\n数据集：Ionosphere\n\n算法：OMELET-SV\n\n核心指标：ACC 91.2%、NMI 86.4%、ARI 82.7%、F1 88.0%\n\n## 目录\n\n${included.map((section) => `- ${section.title}`).join('\n')}`;
    downloadTextFile(`${title}.${format === 'json' ? 'json' : 'md'}`, content, format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8');
    setGenerated(true);
  }

  return (
    <section className="soft-page report-center-page" aria-label="分析报告">
      <WorkbenchPageHeader
        icon={FileText}
        title="分析报告"
        context="任务 #OMELET-072 · Ionosphere · 报告草稿自动保存"
        status={<WorkbenchStatus tone={generated ? 'success' : 'info'}>{generated ? '报告已生成' : '草稿已保存'}</WorkbenchStatus>}
        actions={
          <button type="button" className="btn btn-primary" disabled={selectedSections.length === 0} onClick={generateReport}>
            <Download size={15} aria-hidden="true" />
            生成报告
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="报告摘要"
        metrics={[
          { label: '已选章节', value: `${selectedSections.length} / ${reportSections.length}`, note: '可在左侧调整', icon: ClipboardCheck, tone: 'blue' },
          { label: '预计页数', value: `${Math.max(2, selectedSections.length * 2)} 页`, note: '按当前章节估算', icon: FileText, tone: 'neutral' },
          { label: '图像结果', value: selectedSections.includes('charts') ? '5 张' : '未包含', note: 'SVG / PNG', icon: Images, tone: 'teal' },
          { label: '质量状态', value: '已通过', note: '可生成正式版本', icon: CheckCircle2, tone: 'green' },
        ]}
      />

      <div className="report-workspace">
        <section className="panel report-builder-panel" aria-label="报告生成配置">
          <WorkbenchSectionHeader title="报告设置" meta="内容更改会立即反映到右侧预览。" />
          <div className="report-fields">
            <label><span>报告名称</span><input value={title} onChange={(event) => { setTitle(event.target.value); setGenerated(false); }} /></label>
            <label><span>作者 / 单位</span><input value={author} onChange={(event) => { setAuthor(event.target.value); setGenerated(false); }} /></label>
          </div>
          <fieldset className="report-format-field">
            <legend>交付格式</legend>
            <div>
              <button type="button" className={format === 'markdown' ? 'active' : ''} aria-pressed={format === 'markdown'} onClick={() => setFormat('markdown')}><FileText size={15} aria-hidden="true" />Markdown</button>
              <button type="button" className={format === 'json' ? 'active' : ''} aria-pressed={format === 'json'} onClick={() => setFormat('json')}><FileJson size={15} aria-hidden="true" />JSON</button>
            </div>
          </fieldset>
          <div className="report-section-list">
            {reportSections.map((section) => {
              const checked = selectedSections.includes(section.key);
              return (
                <label className={checked ? 'selected' : ''} key={section.key}>
                  <input type="checkbox" checked={checked} onChange={() => toggleSection(section.key)} />
                  <span><strong>{section.title}</strong><small>{section.detail}</small></span>
                </label>
              );
            })}
          </div>
          {generated ? <WorkbenchNotice tone="success" icon={CheckCircle2} title="报告已生成" detail="文件已保存到浏览器下载目录。" /> : null}
        </section>

        <section className="panel report-preview-panel" aria-label="报告预览">
          <WorkbenchSectionHeader title="报告预览" meta={`${selectedSections.length} 个章节 · ${format === 'markdown' ? 'Markdown' : 'JSON'} 交付`} />
          <article className="report-document">
            <header><span>OMELET LAB · ANALYSIS REPORT</span><strong>{title || '未命名报告'}</strong><small>{author || '未填写作者'} · 2026-07-16</small></header>
            <section className="report-document-summary">
              <div><span>数据集</span><strong>Ionosphere</strong></div>
              <div><span>算法</span><strong>OMELET-SV</strong></div>
              <div><span>样本</span><strong>351</strong></div>
              <div><span>类别</span><strong>2</strong></div>
            </section>
            <section className="report-document-metrics">
              {['ACC 91.2%', 'NMI 86.4%', 'ARI 82.7%', 'F1 88.0%'].map((item) => <span key={item}>{item}</span>)}
            </section>
            <section className="report-document-toc">
              <h3>报告目录</h3>
              {reportSections.filter((section) => selectedSections.includes(section.key)).map((section) => <div key={section.key}><span>{section.title}</span><i /></div>)}
              {selectedSections.length === 0 ? <p>尚未选择报告章节。</p> : null}
            </section>
            <footer><span>任务 #OMELET-072</span><span>OMELET Lab</span></footer>
          </article>
        </section>
      </div>
    </section>
  );
}

export function OperationLogsPage() {
  const [level, setLevel] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const filteredLogs = useMemo(
    () => operationLogs.filter((log) => {
      const matchesLevel = level === 'all' || log.level === level;
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery = !normalizedQuery || `${log.action} ${log.message} ${log.source}`.toLowerCase().includes(normalizedQuery);
      return matchesLevel && matchesQuery;
    }),
    [level, query],
  );

  function refreshLogs() {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 700);
  }

  function exportLogs() {
    const content = ['level,action,message,time,source', ...filteredLogs.map((log) => [log.level, log.action, log.message, log.time, log.source].join(','))].join('\n');
    downloadTextFile('omelet-operation-logs.csv', content, 'text/csv;charset=utf-8');
  }

  return (
    <section className="soft-page operation-logs-page" aria-label="运行日志">
      <WorkbenchPageHeader
        icon={Activity}
        title="运行日志"
        context="任务 #OMELET-072 · 最近同步 10:32:08 · 保留 30 天"
        status={<WorkbenchStatus tone={refreshing ? 'warning' : 'success'} pulse={refreshing}>{refreshing ? '同步中' : '日志已同步'}</WorkbenchStatus>}
        actions={
          <>
            <button type="button" className="btn btn-secondary" disabled={refreshing} onClick={refreshLogs}><RefreshCw size={15} aria-hidden="true" />刷新</button>
            <button type="button" className="btn btn-primary" onClick={exportLogs}><Download size={15} aria-hidden="true" />导出日志</button>
          </>
        }
      />

      <WorkbenchMetricStrip
        label="日志摘要"
        metrics={[
          { label: '今日日志', value: '142', note: '较昨日增加 12 条', icon: Activity, tone: 'blue' },
          { label: '任务事件', value: '63', note: '迭代与结果保存', icon: Play, tone: 'green' },
          { label: '提醒', value: '8', note: '需要人工复核', icon: Clock3, tone: 'amber' },
          { label: '异常', value: '1', note: '报告生成阻塞', icon: Filter, tone: 'red' },
        ]}
      />

      <section className="panel logs-workspace" aria-label="日志列表">
        <WorkbenchSectionHeader title="操作日志" meta={`${filteredLogs.length} 条结果 · 按时间倒序`} />
        <div className="logs-toolbar">
          <label className="logs-search"><Search size={15} aria-hidden="true" /><input value={query} placeholder="搜索事件、模块或内容" onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="logs-level-filter" role="group" aria-label="筛选日志级别">
            {[
              ['all', '全部'],
              ['info', '信息'],
              ['warning', '提醒'],
              ['error', '异常'],
            ].map(([value, label]) => <button type="button" className={level === value ? 'active' : ''} aria-pressed={level === value} key={value} onClick={() => setLevel(value as typeof level)}>{label}</button>)}
          </div>
        </div>
        <div className="logs-table" role="table" aria-label="系统操作日志">
          <div className="logs-row header" role="row"><span role="columnheader">级别</span><span role="columnheader">事件</span><span role="columnheader">内容</span><span role="columnheader">模块</span><span role="columnheader">时间</span></div>
          {filteredLogs.map((log) => (
            <div className={`logs-row level-${log.level}`} role="row" key={`${log.action}-${log.time}`}>
              <span role="cell"><WorkbenchStatus tone={log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'info'}>{log.level === 'error' ? '异常' : log.level === 'warning' ? '提醒' : '信息'}</WorkbenchStatus></span>
              <strong role="cell">{log.action}</strong>
              <span role="cell">{log.message}</span>
              <code role="cell">{log.source}</code>
              <time role="cell">{log.time}</time>
            </div>
          ))}
          {filteredLogs.length === 0 ? <div className="logs-empty"><Search size={22} aria-hidden="true" /><strong>没有匹配的日志</strong><span>调整级别或搜索词后重试。</span></div> : null}
        </div>
      </section>
    </section>
  );
}
