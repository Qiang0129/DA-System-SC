import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  LayoutGrid,
  LogOut,
  Menu,
  Network,
  Play,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './landing.css';
import sidebarBrandLogo from './images/Logo.svg';
import { LandingPage } from './LandingPage';
import { AuthFlipCard } from './AuthPages';
import { AppBackground } from './AppBackground';
import { DatasetManagementPage } from './DatasetManagementPage';
import {
  clearAuthSession,
  getCurrentUser,
  getStoredAccessToken,
  logout as logoutFromApi,
  type AuthUser,
} from './api/auth';
import {
  dashboardGroups,
  dashboardNavItems,
  defaultWorkbenchPath,
  getActiveWorkbenchSection,
  legacyWorkbenchRedirects,
  type DashboardGroupKey,
} from './dashboard/navigation';

type SummaryCard = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: 'neutral' | 'green' | 'amber' | 'purple';
};

type Metric = {
  label: string;
  value: string;
  note: string;
};

type PipelineStep = {
  title: string;
  status: 'done' | 'running' | 'pending';
  detail: string;
};

type SelectableChartKey = 'kernelWeights' | 'topologyAffinity';

const summaryCards: SummaryCard[] = [
  {
    label: '样本数 n',
    value: '351',
    note: 'Ionosphere 示例数据',
    icon: Database,
    tone: 'neutral',
  },
  {
    label: '基础聚类 m',
    value: '100',
    note: '基础聚类矩阵 E',
    icon: Boxes,
    tone: 'green',
  },
  {
    label: '真实类别 c',
    value: '2',
    note: '含真实标签 y',
    icon: Network,
    tone: 'purple',
  },
  {
    label: '算法模式',
    value: 'OMELET-SV',
    note: 'anchor = 10 * sqrt(n)',
    icon: FlaskConical,
    tone: 'amber',
  },
];

const metrics: Metric[] = [
  { label: 'ACC', value: '91.2 ± 1.8%', note: '10 次运行均值与标准差' },
  { label: 'NMI', value: '86.4 ± 1.2%', note: '10 次运行均值与标准差' },
  { label: 'ARI', value: '82.7 ± 2.1%', note: '10 次运行均值与标准差' },
  { label: 'F1 分数', value: '88.0 ± 1.6%', note: '10 次运行均值与标准差' },
  { label: '目标函数', value: '113.9', note: '第 6 轮 objective' },
  { label: '运行耗时', value: '18.4s', note: 'OMELET-SV 示例任务' },
];

const pipelineSteps: PipelineStep[] = [
  { title: '选择基础聚类结果', status: 'done', detail: '从 E 中选择 n_base = 20' },
  { title: 'GBE 编码与 CA 构建', status: 'done', detail: '计算样本共聚频率矩阵' },
  { title: '构造四组核矩阵', status: 'done', detail: 'RBF / Linear / RBF / Polynomial' },
  { title: '更新 Z / S / alpha', status: 'running', detail: '多核与拓扑约束联合优化' },
  { title: '谱聚类与指标评估', status: 'pending', detail: '输出 labels、ACC、NMI、ARI、F1' },
];

const taskParams = [
  ['mode', 'OMELET-SV'],
  ['n_base', '20'],
  ['sigma', '1'],
  ['lambda', '5'],
  ['gamma', '5'],
  ['anchor', '10'],
  ['runs', '10'],
  ['max_iter', '10'],
];

const caPreview = [
  [1, 0.82, 0.78, 0.24, 0.18, 0.12, 0.09, 0.06],
  [0.82, 1, 0.74, 0.31, 0.22, 0.16, 0.11, 0.08],
  [0.78, 0.74, 1, 0.28, 0.19, 0.13, 0.1, 0.07],
  [0.24, 0.31, 0.28, 1, 0.69, 0.62, 0.35, 0.2],
  [0.18, 0.22, 0.19, 0.69, 1, 0.71, 0.42, 0.26],
  [0.12, 0.16, 0.13, 0.62, 0.71, 1, 0.47, 0.32],
  [0.09, 0.11, 0.1, 0.35, 0.42, 0.47, 1, 0.76],
  [0.06, 0.08, 0.07, 0.2, 0.26, 0.32, 0.76, 1],
];

const caLegend = [
  ['低共聚', 'low'],
  ['中共聚', 'mid'],
  ['高共聚', 'high'],
  ['对角线', 'diagonal'],
];

const caStats = [
  { label: '矩阵规模', value: '351 × 351', note: '样本级共聚频率' },
  { label: '预览窗口', value: 'S1 - S8', note: '当前矩阵切片' },
  { label: '基础聚类', value: '20 / 100', note: '用于构建 CA' },
  { label: 'CA 均值', value: '0.34', note: '预览窗口非对角均值' },
];

const caHighPairs = [
  { pair: 'S1 / S2', value: '0.82' },
  { pair: 'S1 / S3', value: '0.78' },
  { pair: 'S7 / S8', value: '0.76' },
];

function useChart(option: EChartsOption) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') {
      return undefined;
    }

    if (!ref.current) {
      return undefined;
    }

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

const chartTextStyle = {
  color: '#8b95a6',
  fontSize: 10,
  fontWeight: 600,
};

const chartTooltipTextStyle = {
  textStyle: { fontWeight: 600 },
};

export function buildHeatmapOption(): EChartsOption {
  const data = Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_unused, col) => [
      row,
      col,
      Number((0.12 + ((row * col + row + col) % 10) / 12).toFixed(2)),
    ]),
  ).flat();

  return {
    animation: false,
    textStyle: { fontWeight: 600 },
    tooltip: chartTooltipTextStyle,
    grid: { top: 8, right: 8, bottom: 24, left: 28 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 8 }, (_, i) => `${i + 1}`),
      axisLabel: chartTextStyle,
      axisLine: { lineStyle: { color: '#e8eef6' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: 8 }, (_, i) => `${i + 1}`),
      axisLabel: chartTextStyle,
      axisLine: { lineStyle: { color: '#e8eef6' } },
      axisTick: { show: false },
    },
    visualMap: {
      show: false,
      min: 0,
      max: 1,
      inRange: { color: ['#ecf5ff', '#a0cfff', '#409eff', '#337ecc'] },
    },
    series: [
      {
        type: 'heatmap',
        data,
        emphasis: { itemStyle: { borderColor: '#337ecc', borderWidth: 1 } },
      },
    ],
  };
}

export function buildKernelWeightsOption(): EChartsOption {
  return {
    animation: false,
    textStyle: { fontWeight: 600 },
    tooltip: chartTooltipTextStyle,
    grid: { top: 12, right: 10, bottom: 28, left: 34 },
    xAxis: {
      type: 'category',
      data: ['高斯核 1', '线性核', '高斯核 2', '多项式核'],
      axisTick: { show: false },
      axisLabel: chartTextStyle,
      axisLine: { lineStyle: { color: '#e8eef6' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: chartTextStyle,
      splitLine: { lineStyle: { color: '#e8eef6' } },
    },
    series: [
      {
        type: 'bar',
        data: [0.31, 0.22, 0.29, 0.18],
        barWidth: 24,
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

export function buildConvergenceOption(): EChartsOption {
  return {
    animation: false,
    textStyle: { fontWeight: 600 },
    tooltip: { ...chartTooltipTextStyle, trigger: 'axis' },
    grid: { top: 12, right: 10, bottom: 28, left: 40 },
    xAxis: {
      type: 'category',
      data: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      axisLabel: chartTextStyle,
      axisLine: { lineStyle: { color: '#e8eef6' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: chartTextStyle,
      splitLine: { lineStyle: { color: '#e8eef6' } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 7,
        data: [245.6, 188.4, 151.7, 132.5, 121.4, 113.9, 112.7, 112.1, 111.9, 111.8],
        lineStyle: { color: '#409eff', width: 3 },
        itemStyle: { color: '#409eff' },
        areaStyle: { color: 'rgba(64, 158, 255, 0.12)' },
      },
    ],
  };
}

export function buildClusterScatterOption(): EChartsOption {
  const clusters = [
    {
      name: '簇 1',
      color: '#409eff',
      data: [
        [1.2, 2.3],
        [1.8, 2.8],
        [2.2, 2.1],
        [1.5, 1.8],
      ],
    },
    {
      name: '簇 2',
      color: '#67c23a',
      data: [
        [4.2, 3.6],
        [4.7, 4.1],
        [5.1, 3.4],
        [4.4, 2.9],
      ],
    },
  ];

  return {
    animation: false,
    textStyle: { fontWeight: 600 },
    tooltip: chartTooltipTextStyle,
    grid: { top: 12, right: 10, bottom: 28, left: 34 },
    xAxis: {
      type: 'value',
      axisLabel: chartTextStyle,
      splitLine: { lineStyle: { color: '#e8eef6' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: chartTextStyle,
      splitLine: { lineStyle: { color: '#e8eef6' } },
    },
    series: clusters.map((cluster) => ({
      name: cluster.name,
      type: 'scatter',
      symbolSize: 12,
      data: cluster.data,
      itemStyle: { color: cluster.color },
    })),
  };
}

function Sidebar({
  activeSection,
  collapsed,
  open,
  onClose,
}: {
  activeSection: string;
  collapsed: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop ${open ? 'visible' : ''}`}
        aria-label="关闭导航"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" title="OMELET Lab">
          <span className="brand-logo" aria-hidden="true">
            <img className="sidebar-brand-logo-image" src={sidebarBrandLogo} alt="" aria-hidden="true" />
          </span>
          <span className="brand-copy">
            <strong translate="no">OMELET Lab</strong>
            <small>新材料聚类分析</small>
          </span>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {dashboardGroups.map((group) => (
            <div className="nav-group" key={group.key}>
              <span className="nav-group-label">{group.label}</span>
              {dashboardNavItems
                .filter((item) => item.group === group.key)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.label;

                  return (
                    <NavLink
                      key={item.label}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={({ isActive: routeIsActive }) =>
                        `nav-item ${routeIsActive ? 'active' : ''}`
                      }
                      onClick={onClose}
                      title={item.label}
                    >
                      <span className="nav-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <span className="nav-label">{item.label}</span>
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

function TopHeader({
  activeSection,
  onToggleMobileNav,
  onLogout,
}: {
  activeSection: string;
  onToggleMobileNav: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="main-header">
      <div className="navbar-left">
        <button
          type="button"
          className="header-icon-button mobile-nav-button"
          aria-label="打开导航"
          onClick={onToggleMobileNav}
        >
          <Menu size={18} />
        </button>
        <nav className="breadcrumb" aria-label="当前位置">
          <span>工作台</span>
          <ChevronRight size={14} aria-hidden="true" />
          <strong>{activeSection}</strong>
        </nav>
      </div>

      <div className="navbar-right">
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            name="dashboardSearch"
            placeholder="搜索任务、矩阵或指标…"
            autoComplete="off"
            aria-label="搜索任务、矩阵或指标"
          />
        </label>
        <button type="button" className="header-icon-button" aria-label="刷新仪表盘">
          <RefreshCw size={16} />
        </button>
        <button type="button" className="header-icon-button" aria-label="通知中心">
          <Bell size={16} />
        </button>
        <button type="button" className="header-icon-button" aria-label="系统设置">
          <Settings size={16} />
        </button>
        <button type="button" className="header-icon-button" aria-label="退出登录" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function StatusHeader() {
  return (
    <section className="status-header" aria-label="系统连接状态">
      <div className="status-left">
        <span className="status-dot warning" aria-hidden="true" />
        <div>
          <span className="status-label">Python 服务</span>
          <strong>等待 FastAPI 接入</strong>
        </div>
      </div>
      <div className="status-meta">
        <span>服务地址</span>
        <strong>http://localhost:8000</strong>
      </div>
      <div className="status-actions">
        <button type="button" className="btn btn-secondary">
          <Upload size={16} aria-hidden="true" />
          导入数据
        </button>
        <button type="button" className="btn btn-primary">
          <Play size={16} aria-hidden="true" />
          创建任务
        </button>
      </div>
    </section>
  );
}

function SummaryCard({ card }: { card: SummaryCard }) {
  const Icon = card.icon;

  return (
    <article className={`summary-card tone-${card.tone}`}>
      <div className="summary-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div>
        <span className="card-label">{card.label}</span>
        <strong>{card.value}</strong>
        <small>{card.note}</small>
      </div>
    </article>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card">
      <div className="metric-head">
        <span>{metric.label}</span>
      </div>
      <strong>{metric.value}</strong>
      <span className="metric-note">{metric.note}</span>
    </article>
  );
}

function ChartPanel({
  title,
  description,
  label,
  option,
  className = '',
}: {
  title: string;
  description: string;
  label: string;
  option: EChartsOption;
  className?: string;
}) {
  const ref = useChart(option);

  return (
    <section className={`panel chart-panel ${className}`} aria-label={label}>
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <button type="button" className="panel-action" aria-label={`查看${title}`}>
          <BarChart3 size={17} />
        </button>
      </div>
      <div className="chart-surface" ref={ref} />
    </section>
  );
}

function SelectableChartPanel({
  weightsOption,
  topologyOption,
}: {
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
}) {
  const [selectedChart, setSelectedChart] = useState<SelectableChartKey>('kernelWeights');

  const chartOptions: Array<{
    key: SelectableChartKey;
    label: string;
    title: string;
    description: string;
    panelLabel: string;
    icon: LucideIcon;
    option: EChartsOption;
  }> = [
    {
      key: 'kernelWeights',
      label: '核权重 alpha',
      title: '多核学习结果',
      description: '四组核矩阵的 alpha 权重',
      panelLabel: '核权重分布图',
      icon: BarChart3,
      option: weightsOption,
    },
    {
      key: 'topologyAffinity',
      label: '拓扑亲和矩阵 S',
      title: '多核学习结果',
      description: '去噪后的 S 矩阵结构',
      panelLabel: '拓扑亲和矩阵图',
      icon: LayoutGrid,
      option: topologyOption,
    },
  ];

  const active = chartOptions.find((option) => option.key === selectedChart)!;
  const ref = useChart(active.option);

  return (
    <section className="panel chart-panel selectable-chart-panel" aria-label={active.panelLabel}>
      <div className="panel-header selectable-chart-header">
        <div>
          <h2>{active.title}</h2>
          <span>{active.description}</span>
        </div>
        <div className="chart-segmented" role="tablist" aria-label="选择图表类型">
          {chartOptions.map((option) => {
            const Icon = option.icon;
            const isActive = option.key === selectedChart;

            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`chart-segment ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedChart(option.key)}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="chart-surface" ref={ref} />
    </section>
  );
}

function getCaLevel(value: number, rowIndex: number, colIndex: number) {
  if (rowIndex === colIndex) {
    return 'diagonal';
  }
  if (value >= 0.7) {
    return 'high';
  }
  if (value >= 0.3) {
    return 'mid';
  }
  return 'low';
}

function getCaLevelLabel(level: string) {
  if (level === 'diagonal') {
    return '对角线';
  }
  if (level === 'high') {
    return '高共聚';
  }
  if (level === 'mid') {
    return '中共聚';
  }
  return '低共聚';
}

function handleCaCellPointerMove(event: PointerEvent<HTMLSpanElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
  const offsetY = (event.clientY - rect.top) / rect.height - 0.5;

  target.style.setProperty('--tilt-x', `${(-offsetY * 12).toFixed(2)}deg`);
  target.style.setProperty('--tilt-y', `${(offsetX * 12).toFixed(2)}deg`);
}

function handleCaCellPointerLeave(event: PointerEvent<HTMLSpanElement>) {
  event.currentTarget.style.setProperty('--tilt-x', '0deg');
  event.currentTarget.style.setProperty('--tilt-y', '0deg');
}

function CAMatrixPanel({ title = 'CA 协关联矩阵' }: { title?: string }) {
  return (
    <section className="panel chart-panel ca-matrix-panel" aria-label="CA 协关联矩阵">
      <div className="ca-panel-header">
        <div>
          <h2>{title}</h2>
          <span>由基础聚类标签矩阵 E 计算样本共聚频率。</span>
        </div>
        <div className="ca-formula" aria-label="CA 矩阵公式">
          CA = M @ M.T / n_base
        </div>
      </div>

      <div className="ca-panel-body">
        <div className="ca-visual-column">
          <div className="ca-matrix-scroll">
            <div className="ca-matrix-preview" role="img" aria-label="CA 协关联矩阵预览">
              <div className="ca-axis ca-axis-x" aria-hidden="true">
                <span />
                {caPreview.map((_row, index) => (
                  <span key={`x-${index}`}>S{index + 1}</span>
                ))}
              </div>
              {caPreview.map((row, rowIndex) => (
                <div className="ca-row" key={`row-${rowIndex}`}>
                  <span className="ca-axis-y">S{rowIndex + 1}</span>
                  <div className="ca-cells">
                    {row.map((value, colIndex) => {
                      const level = getCaLevel(value, rowIndex, colIndex);
                      const pairLabel = `S${rowIndex + 1} / S${colIndex + 1}`;
                      const valueLabel = `CA = ${value.toFixed(2)}`;
                      const levelLabel = getCaLevelLabel(level);
                      const ariaLabel = `${pairLabel}，${valueLabel}，${levelLabel}`;
                      return (
                        <span
                          key={`${rowIndex}-${colIndex}`}
                          className={`ca-cell ca-matrix-cell ${level}`}
                          aria-label={ariaLabel}
                          onPointerMove={handleCaCellPointerMove}
                          onPointerLeave={handleCaCellPointerLeave}
                          style={{ '--tilt-x': '0deg', '--tilt-y': '0deg' } as CSSProperties}
                        >
                          <span className="ca-tooltip" aria-hidden="true">
                            <strong>{pairLabel}</strong>
                            <small>{valueLabel}</small>
                            <em>{levelLabel}</em>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ca-legend" aria-label="CA 矩阵取值图例">
            {caLegend.map(([label, level]) => (
              <span key={level}>
                <i className={`ca-cell ${level}`} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <aside className="ca-info-panel" aria-label="CA 矩阵统计摘要">
          <div className="ca-stat-list">
            {caStats.map((item) => (
              <div className="ca-stat-item" key={item.label}>
                <div>
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="ca-pair-summary">
            <div className="ca-pair-heading">
              <span>高共聚样本对</span>
              <strong>5 组</strong>
            </div>
            <div className="ca-pair-list">
              {caHighPairs.map((item) => (
                <div className="ca-pair-row" key={item.pair}>
                  <span>{item.pair}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function PipelinePanel() {
  return (
    <section className="panel pipeline-panel" aria-label="OMELET 分析流程">
      <div className="panel-header">
        <div>
          <h2>OMELET 分析流程</h2>
          <span>从基础聚类结果到拓扑亲和矩阵与最终标签</span>
        </div>
        <GitBranch size={20} aria-hidden="true" />
      </div>

      <div className="pipeline-list">
        {pipelineSteps.map((step, index) => (
          <article className={`pipeline-step ${step.status}`} key={step.title}>
            <span className="step-index">{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </div>
            <span className="step-status">
              {step.status === 'done' ? '完成' : step.status === 'running' ? '运行中' : '等待'}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskPanel() {
  return (
    <section className="panel task-panel">
      <div className="panel-header">
        <div>
          <h2>任务参数</h2>
          <span>当前 OMELET-SV 参数与迭代进度</span>
        </div>
        <Gauge size={20} aria-hidden="true" />
      </div>

      <dl className="task-grid">
        {taskParams.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="progress-block">
        <div>
          <span>迭代进度</span>
          <strong>6 / 10</strong>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: '60%' }} />
        </div>
      </div>
    </section>
  );
}

function ExportPanel() {
  const actions = [
    ['导出标签', '表格'],
    ['导出指标', '工作簿'],
    ['导出图像', '图片'],
    ['生成报告', '文档'],
  ];

  return (
    <section className="panel export-panel">
      <div className="panel-header">
        <div>
          <h2>结果导出</h2>
          <span>保留标签、指标、图像与分析报告</span>
        </div>
        <FileText size={20} aria-hidden="true" />
      </div>

      <div className="export-actions">
        {actions.map(([label, format]) => (
          <button type="button" key={label}>
            <Download size={16} aria-hidden="true" />
            <span>{label}</span>
            <small>{format}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function FeatureListPanel({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ title: string; detail: string; status?: '完成' | '运行中' | '待配置' }>;
}) {
  return (
    <section className="panel feature-list-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <FileText size={20} aria-hidden="true" />
      </div>
      <div className="feature-list">
        {items.map((item) => (
          <article className="feature-row" key={item.title}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
            {item.status ? <small>{item.status}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function AnalysisWorkbenchPage({
  weightsOption,
  topologyOption,
  convergenceOption,
  scatterOption,
}: {
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
  convergenceOption: EChartsOption;
  scatterOption: EChartsOption;
}) {
  return (
    <>
      <section className="summary-grid" aria-label="分析概览">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} card={card} />
        ))}
      </section>

      <section className="metrics-grid" aria-label="性能指标">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="top-insight-grid" aria-label="核心图表与导出">
        <CAMatrixPanel />
        <SelectableChartPanel weightsOption={weightsOption} topologyOption={topologyOption} />
        <ExportPanel />
      </section>

      <section className="secondary-card-grid" aria-label="第二行分析卡片">
        <ChartPanel
          title="收敛曲线"
          description="目标函数随迭代轮次下降"
          label="收敛曲线"
          option={convergenceOption}
        />
        <ChartPanel
          title="聚类散点图"
          description="降维后的最终标签分布"
          label="聚类散点图"
          option={scatterOption}
        />
        <PipelinePanel />
        <TaskPanel />
      </section>

      <section className="panel config-panel" aria-label="当前配置摘要">
        <div className="config-item">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>技术路线</strong>
            <span>React + TypeScript 前端，FastAPI Python 后端，ECharts 可视化。</span>
          </div>
        </div>
        <div className="config-item">
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>算法执行</strong>
            <span>OMELET 主算法放在 Python 服务，前端负责参数、任务状态和结果展示。</span>
          </div>
        </div>
      </section>
    </>
  );
}

function CreateTaskPanel() {
  const [taskName, setTaskName] = useState('Ionosphere OMELET-SV 任务');
  const [mode, setMode] = useState<'OMELET' | 'OMELET-SV'>('OMELET-SV');
  const [nBase, setNBaseInput] = useState('20');
  const [sigma, setSigma] = useState('1');
  const [lambda, setLambda] = useState('5');
  const [gamma, setGamma] = useState('5');
  const [anchor, setAnchor] = useState('10');
  const [runs, setRuns] = useState('10');
  const [maxIter, setMaxIter] = useState('10');
  const [taskDraft, setTaskDraft] = useState<any | null>(null);

  function handleTaskCreate() {
    const createdAt = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());

    setTaskDraft({
      name: taskName.trim() || '未命名聚类任务',
      mode,
      nBase: Number(nBase),
      selectedCount: Number(nBase),
      createdAt,
    });
  }

  return (
    <section className="panel dataset-task-panel" aria-label="创建聚类任务">
      <div className="panel-header">
        <div>
          <h2>创建聚类任务</h2>
          <span>把数据集、算法模式和参数整理成任务草稿。</span>
        </div>
        <ClipboardList size={20} aria-hidden="true" />
      </div>

      <div className="task-form-grid">
        <label className="task-form-wide">
          <span>任务名称</span>
          <input
            aria-label="任务名称"
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
          />
        </label>

        <div className="task-mode-control" aria-label="算法模式">
          {(['OMELET', 'OMELET-SV'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? 'active' : ''}
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <label>
          <span>n_base</span>
          <input
            type="number"
            aria-label="n_base"
            value={nBase}
            onChange={(event) => setNBaseInput(event.target.value)}
          />
        </label>
        <label>
          <span>sigma</span>
          <input value={sigma} onChange={(event) => setSigma(event.target.value)} />
        </label>
        <label>
          <span>lambda</span>
          <input value={lambda} onChange={(event) => setLambda(event.target.value)} />
        </label>
        <label>
          <span>gamma</span>
          <input value={gamma} onChange={(event) => setGamma(event.target.value)} />
        </label>
        <label>
          <span>anchor</span>
          <input value={anchor} onChange={(event) => setAnchor(event.target.value)} />
        </label>
        <label>
          <span>runs</span>
          <input value={runs} onChange={(event) => setRuns(event.target.value)} />
        </label>
        <label>
          <span>max_iter</span>
          <input value={maxIter} onChange={(event) => setMaxIter(event.target.value)} />
        </label>
      </div>

      <button
        type="button"
        className="btn btn-primary dataset-create-task"
        onClick={handleTaskCreate}
      >
        <Play size={16} aria-hidden="true" />
        创建任务
      </button>

      <article className="task-draft-card" aria-label="任务草稿预览">
        <div>
          <span>任务草稿</span>
          <strong>{taskDraft?.name ?? '等待创建任务'}</strong>
        </div>
        <dl>
          <div>
            <dt>状态</dt>
            <dd>等待 FastAPI 接入</dd>
          </div>
          <div>
            <dt>算法</dt>
            <dd>{taskDraft?.mode ?? mode}</dd>
          </div>
          <div>
            <dt>基础聚类</dt>
            <dd>{taskDraft ? `${taskDraft.selectedCount} 个基础聚类` : `等待选择`}</dd>
          </div>
          <div>
            <dt>n_base</dt>
            <dd>{taskDraft?.nBase ?? nBase}</dd>
          </div>
          <div>
            <dt>创建时间</dt>
            <dd>{taskDraft?.createdAt ?? '未创建'}</dd>
          </div>
        </dl>
      </article>

      <div className="dataset-task-note">
        <FlaskConical size={16} aria-hidden="true" />
        <span>后续接入 Python OMELET / OMELET-SV 服务后，这里会写入真实任务队列。</span>
      </div>
    </section>
  );
}

function TaskCenterPage() {
  return (
    <>
      <section className="task-board" aria-label="任务中心列表">
        <CreateTaskPanel />
        <PipelinePanel />
        <TaskPanel />
        <FeatureListPanel
          title="任务列表"
          description="当前示例任务状态，后续接入 analysis_tasks。"
          items={[
            { title: 'Ionosphere / OMELET-SV', detail: '第 6 / 10 轮，正在更新 Z / S / alpha。', status: '运行中' },
            { title: 'Breast Cancer / OMELET', detail: '等待基础聚类结果导入。', status: '待配置' },
            { title: 'Synthetic Benchmark', detail: '指标评估与导出已完成。', status: '完成' },
          ]}
        />
      </section>
    </>
  );
}

function CAMatrixPage() {
  return (
    <>
      <section className="focused-analysis-grid" aria-label="CA 协关联矩阵分析">
        <CAMatrixPanel title="矩阵预览" />
        <FeatureListPanel
          title="构建流程"
          description="由基础聚类标签矩阵 E 生成 CA 协关联矩阵。"
          items={[
            { title: '选择基础聚类子集', detail: '从 100 个基础聚类中选择 n_base = 20。', status: '完成' },
            { title: 'GBE 编码', detail: '把基础聚类标签转换为样本共现编码。', status: '完成' },
            { title: '计算共聚频率', detail: '按样本对归一化得到 CA 矩阵。', status: '完成' },
            { title: '输出热力图预览', detail: '保留高共聚样本对和矩阵摘要。', status: '运行中' },
          ]}
        />
      </section>
    </>
  );
}

function MultiKernelPage({
  weightsOption,
  topologyOption,
}: {
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
}) {
  return (
    <>
      <section className="focused-analysis-grid" aria-label="多核相似性学习分析">
        <SelectableChartPanel weightsOption={weightsOption} topologyOption={topologyOption} />
        <TaskPanel />
        <PipelinePanel />
      </section>
    </>
  );
}

function ResultsAnalysisPage({
  convergenceOption,
  scatterOption,
  weightsOption,
  topologyOption,
}: {
  convergenceOption: EChartsOption;
  scatterOption: EChartsOption;
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
}) {
  return (
    <>
      <section className="result-analysis-layout" aria-label="结果分析内容">
        <FeatureListPanel
          title="指标评估"
          description="ACC、NMI、ARI、F1 与多次运行统计。"
          items={metrics.map((metric) => ({
            title: `${metric.label}：${metric.value}`,
            detail: metric.note,
            status: '完成',
          }))}
        />
        <section className="secondary-card-grid" aria-label="图表展示">
          <SelectableChartPanel weightsOption={weightsOption} topologyOption={topologyOption} />
          <ChartPanel
            title="收敛曲线"
            description="目标函数随迭代轮次下降"
            label="收敛曲线"
            option={convergenceOption}
          />
          <ChartPanel
            title="聚类散点图"
            description="降维后的最终标签分布"
            label="聚类散点图"
            option={scatterOption}
          />
        </section>
      </section>
    </>
  );
}

function ExportCenterPage() {
  return (
    <>
      <section className="focused-analysis-grid" aria-label="结果导出中心">
        <ExportPanel />
        <FeatureListPanel
          title="导出内容"
          description="面向任务结果的文件化交付。"
          items={[
            { title: '导出聚类标签', detail: '保存每个样本对应的最终聚类标签。', status: '完成' },
            { title: '导出指标表格', detail: '输出 ACC、NMI、ARI、F1 与运行统计。', status: '完成' },
            { title: '导出图像结果', detail: '保存矩阵、散点图和收敛曲线。', status: '待配置' },
            { title: '生成聚类分析报告', detail: '汇总数据、参数、指标和图表。', status: '待配置' },
          ]}
        />
      </section>
    </>
  );
}

function WorkbenchPageContent({
  activeSection,
  weightsOption,
  topologyOption,
  convergenceOption,
  scatterOption,
}: {
  activeSection: string;
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
  convergenceOption: EChartsOption;
  scatterOption: EChartsOption;
}) {
  if (activeSection === '数据管理') {
    return <DatasetManagementPage />;
  }

  if (activeSection === '任务中心') {
    return <TaskCenterPage />;
  }

  if (activeSection === 'CA 协关联矩阵') {
    return <CAMatrixPage />;
  }

  if (activeSection === '多核相似性学习') {
    return <MultiKernelPage weightsOption={weightsOption} topologyOption={topologyOption} />;
  }

  if (activeSection === '结果分析') {
    return (
      <ResultsAnalysisPage
        weightsOption={weightsOption}
        topologyOption={topologyOption}
        convergenceOption={convergenceOption}
        scatterOption={scatterOption}
      />
    );
  }

  if (activeSection === '结果导出') {
    return <ExportCenterPage />;
  }

  return (
    <AnalysisWorkbenchPage
      weightsOption={weightsOption}
      topologyOption={topologyOption}
      convergenceOption={convergenceOption}
      scatterOption={scatterOption}
    />
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const workbenchSection = getActiveWorkbenchSection(location.pathname);
  const activeSection = workbenchSection ?? '分析工作台';
  const showStatusHeader = location.pathname === defaultWorkbenchPath;
  const initialPathRef = useRef(location.pathname);
  const sessionCheckedRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, setCurrentUser] = useState<AuthUser | null>(null);

  const topologyOption = useMemo(() => buildHeatmapOption(), []);
  const weightsOption = useMemo(() => buildKernelWeightsOption(), []);
  const convergenceOption = useMemo(() => buildConvergenceOption(), []);
  const scatterOption = useMemo(() => buildClusterScatterOption(), []);

  const enterWorkbench = useCallback(() => {
    navigate(defaultWorkbenchPath);
    setSidebarOpen(false);
  }, [navigate]);

  useEffect(() => {
    if (sessionCheckedRef.current) {
      return;
    }

    sessionCheckedRef.current = true;

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    getCurrentUser(accessToken)
      .then((user) => {
        if (cancelled) return;
        setCurrentUser(user);
        if (['/', '/login', '/register'].includes(initialPathRef.current)) {
          navigate(defaultWorkbenchPath, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthSession();
        setCurrentUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleAuthSuccess = () => {
    const storedUser = localStorage.getItem('soft_web_user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setCurrentUser(null);
      }
    }
    enterWorkbench();
  };

  const handleLogout = async () => {
    await logoutFromApi();
    setCurrentUser(null);
    setSidebarOpen(false);
    navigate('/', { replace: true });
  };

  const dashboardShell = workbenchSection ? (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <AppBackground />
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>

      <Sidebar
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <TopHeader
        activeSection={activeSection}
        onToggleMobileNav={() => setSidebarOpen((value) => !value)}
        onLogout={handleLogout}
      />

      <button
        type="button"
        className="sidebar-toggle-floating"
        aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        onClick={() => setSidebarCollapsed((value) => !value)}
      >
        {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>

      <main className="dashboard-content" id="main-content">
        {showStatusHeader ? <StatusHeader /> : null}
        <WorkbenchPageContent
          activeSection={activeSection}
          weightsOption={weightsOption}
          topologyOption={topologyOption}
          convergenceOption={convergenceOption}
          scatterOption={scatterOption}
        />
      </main>
    </div>
  ) : (
    <Navigate to={defaultWorkbenchPath} replace />
  );

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={() => navigate('/login')}
              onRegister={() => navigate('/register')}
              onEnterWorkbench={enterWorkbench}
            />
          }
        />
        <Route path="/login" element={null} />
        <Route path="/register" element={null} />
        <Route path="/workbench" element={<Navigate to={defaultWorkbenchPath} replace />} />
        {Object.entries(legacyWorkbenchRedirects).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="/workbench/:section" element={dashboardShell} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {isAuthRoute ? (
        <AuthFlipCard
          mode={location.pathname === '/register' ? 'register' : 'login'}
          onSuccess={handleAuthSuccess}
          onShowLogin={() => navigate('/login')}
          onShowRegister={() => navigate('/register')}
          onBack={() => navigate('/')}
        />
      ) : null}
    </>
  );
}

export default App;
