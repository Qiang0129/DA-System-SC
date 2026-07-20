import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  Info,
  LayoutGrid,
  LogOut,
  Menu,
  Network,
  Pause,
  Play,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Target,
  TrendingDown,
  Upload,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './landing.css';
import sidebarBrandLogo from './images/Logo.svg';
import { LandingPage } from './LandingPage';
import { AuthFlipCard } from './AuthPages';
import { AppBackground } from './AppBackground';
import { DatasetManagementPage } from './DatasetManagementPage';
import { DataQualityPage } from './workbench/data-quality/DataQualityPage';
import { DatasetVersionsPage } from './workbench/dataset-versions/DatasetVersionsPage';
import { TaskCenterPage } from './workbench/tasks/TaskCenterPage';
import {
  WorkbenchMetricStrip,
  WorkbenchNotice,
  WorkbenchPageHeader,
  WorkbenchProgress,
  WorkbenchSectionHeader,
  WorkbenchStatus,
} from './workbench/WorkbenchUi';
import {
  KernelConfigPage,
  OperationLogsPage,
  PerformanceEvaluationPage,
  ReportCenterPage,
  VisualizationShowcasePage,
} from './workbench/SoftCopyrightPages';
import { TaskResultViews } from './workbench/results/TaskResultViews';
import { useTaskResult } from './workbench/results/useTaskResult';
import {
  clearAuthSession,
  getCurrentUser,
  getStoredAccessToken,
  logout as logoutFromApi,
  type AuthUser,
} from './api/auth';
import { API_BASE_URL } from './api/config';
import {
  dashboardGroups,
  dashboardNavItems,
  defaultWorkbenchPath,
  getActiveWorkbenchSection,
  legacyWorkbenchRedirects,
  type DashboardGroupKey,
} from './dashboard/navigation';

const API = API_BASE_URL;

function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
type BackendStatus = 'checking' | 'online' | 'offline';
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
  const location = useLocation();
  const taskId = new URLSearchParams(location.search).get('taskId');
  const resultPaths = new Set([
    '/workbench/analysis',
    '/workbench/ca-matrix',
    '/workbench/kernel-config',
    '/workbench/mkl',
    '/workbench/evaluation',
    '/workbench/visualization',
    '/workbench/results',
    '/workbench/export',
    '/workbench/reports',
    '/workbench/logs',
  ]);
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
            <img
              className="sidebar-brand-logo-image"
              src={sidebarBrandLogo}
              width={30}
              height={30}
              alt=""
              aria-hidden="true"
            />
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
                      to={resultPaths.has(item.path) && taskId ? `${item.path}?taskId=${encodeURIComponent(taskId)}` : item.path}
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
  currentUser,
  onToggleMobileNav,
  onLogout,
}: {
  activeSection: string;
  currentUser: AuthUser | null;
  onToggleMobileNav: () => void;
  onLogout: () => void;
}) {
  const username = currentUser?.username || '研究用户';

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
        <div className="header-context">
          <span>OMELET 工作台</span>
          <ChevronRight size={14} aria-hidden="true" />
          <div className="header-section-title" aria-label="当前模块">
            {activeSection}
          </div>
        </div>
      </div>

      <div className="navbar-right">
        <div className="header-user" title={`当前用户：${username}`} aria-label={`当前用户：${username}`}>
          <span className="header-user-avatar" aria-hidden="true">
            {username.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          className="header-icon-button"
          aria-label="退出登录"
          title="退出登录"
          onClick={onLogout}
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function StatusHeader({
  status,
  onImportData,
  onCreateTask,
}: {
  status: BackendStatus;
  onImportData: () => void;
  onCreateTask: () => void;
}) {
  const statusText =
    status === 'online' ? 'FastAPI 已连接' : status === 'offline' ? 'FastAPI 连接异常' : '正在检查 FastAPI…';
  const statusClass = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'warning';

  return (
    <section className="status-header" aria-label="系统连接状态">
      <div className="status-left">
        <span className={`status-dot ${statusClass}`} aria-hidden="true" />
        <div>
          <span className="status-label">Python 服务</span>
          <strong>{statusText}</strong>
        </div>
      </div>
      <div className="status-actions">
        <button type="button" className="btn btn-secondary" onClick={onImportData}>
          <Upload size={16} aria-hidden="true" />
          导入数据
        </button>
        <button type="button" className="btn btn-primary" onClick={onCreateTask}>
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
    ['导出标签', 'CSV', 'omelet-labels.csv', 'sample_id,cluster\nS1,1\nS2,1\nS3,2'],
    ['导出指标', 'CSV', 'omelet-metrics.csv', 'metric,value\nACC,91.2%\nNMI,86.4%\nARI,82.7%\nF1,88.0%'],
    ['导出参数', 'JSON', 'omelet-config.json', JSON.stringify(Object.fromEntries(taskParams), null, 2)],
    ['生成摘要', 'TXT', 'omelet-summary.txt', 'Ionosphere / OMELET-SV\nACC 91.2%\nNMI 86.4%\n运行耗时 18.4s'],
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
        {actions.map(([label, format, filename, content]) => (
          <button type="button" key={label} onClick={() => downloadTextFile(filename, content)}>
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
      <section className="demo-data-notice" aria-label="示例数据提示">
        当前工作台展示的是示例分析数据；真实上传的数据集请在“数据管理”中查看。
      </section>
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

function CAMatrixPage() {
  const [threshold, setThreshold] = useState(70);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const flaggedPairs = caPreview.reduce(
    (count, row, rowIndex) =>
      count + row.filter((value, colIndex) => colIndex > rowIndex && value * 100 >= threshold).length,
    0,
  );

  function recalculateMatrix() {
    setIsRecalculating(true);
    window.setTimeout(() => setIsRecalculating(false), 900);
  }

  function exportMatrix() {
    const content = [
      ['sample', ...caPreview.map((_row, index) => `S${index + 1}`)].join(','),
      ...caPreview.map((row, index) => [`S${index + 1}`, ...row].join(',')),
    ].join('\n');
    downloadTextFile('ionosphere-ca-matrix.csv', content, 'text/csv;charset=utf-8');
  }

  return (
    <section className="workbench-page ca-analysis-page" aria-label="CA 协关联矩阵">
      <WorkbenchPageHeader
        icon={Boxes}
        title="CA 协关联矩阵"
        context="Ionosphere · 351 个样本 · 20 个基础聚类 · 更新于 10:32"
        status={
          <WorkbenchStatus tone={isRecalculating ? 'warning' : 'success'} pulse={isRecalculating}>
            {isRecalculating ? '正在重算' : '矩阵就绪'}
          </WorkbenchStatus>
        }
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportMatrix}>
              <Download size={15} aria-hidden="true" />
              导出矩阵
            </button>
            <button type="button" className="btn btn-primary" disabled={isRecalculating} onClick={recalculateMatrix}>
              <RefreshCw size={15} aria-hidden="true" />
              {isRecalculating ? '计算中' : '重新计算'}
            </button>
          </>
        }
      />

      <WorkbenchMetricStrip
        label="矩阵摘要"
        metrics={[
          { label: '矩阵规模', value: '351 × 351', note: '123,201 个单元', icon: LayoutGrid, tone: 'blue' },
          { label: '参与构建', value: '20 / 100', note: '基础聚类子集', icon: Boxes, tone: 'teal' },
          { label: '非对角均值', value: '0.34', note: '当前预览窗口', icon: Target, tone: 'neutral' },
          { label: '高共聚样本对', value: `${flaggedPairs} 组`, note: `阈值 ≥ ${(threshold / 100).toFixed(2)}`, icon: Activity, tone: 'amber' },
        ]}
      />

      <div className="ca-primary-grid">
        <CAMatrixPanel title="样本共聚结构" />
        <FeatureListPanel
          title="构建流程"
          description="当前任务已完成 3 个阶段，热力图摘要正在同步。"
          items={[
            { title: '选择基础聚类子集', detail: '从 100 个基础聚类中选择 n_base = 20。', status: '完成' },
            { title: 'GBE 编码', detail: '把基础聚类标签转换为样本共现编码。', status: '完成' },
            { title: '计算共聚频率', detail: '按样本对归一化得到 CA 矩阵。', status: '完成' },
            {
              title: '同步矩阵摘要',
              detail: isRecalculating ? '正在更新阈值分布与高共聚样本对。' : '热力图、分布统计和样本对已就绪。',
              status: isRecalculating ? '运行中' : '完成',
            },
          ]}
        />
      </div>

      <section className="panel ca-diagnostics-panel" aria-label="矩阵诊断">
        <WorkbenchSectionHeader
          title="矩阵诊断"
          meta="阈值变化只影响诊断列表，不修改原始 CA 数值。"
          actions={<WorkbenchStatus tone="info">结构清晰</WorkbenchStatus>}
        />
        <div className="ca-diagnostics-grid">
          <div className="ca-threshold-control">
            <div>
              <label htmlFor="ca-threshold">高共聚阈值</label>
              <strong>{(threshold / 100).toFixed(2)}</strong>
            </div>
            <input
              id="ca-threshold"
              type="range"
              min="50"
              max="90"
              step="5"
              value={threshold}
              onChange={(event) => setThreshold(Number(event.target.value))}
            />
            <div className="ca-threshold-scale" aria-hidden="true">
              <span>0.50</span>
              <span>0.70</span>
              <span>0.90</span>
            </div>
          </div>

          <div className="ca-distribution" aria-label="矩阵值分布">
            {([
              ['0.00 - 0.25', 42, 'low'],
              ['0.25 - 0.50', 28, 'mid'],
              ['0.50 - 0.75', 19, 'high'],
              ['0.75 - 1.00', 11, 'peak'],
            ] as const).map(([label, value, tone]) => (
              <div className="ca-distribution-row" key={label}>
                <span>{label}</span>
                <div><i className={tone} style={{ width: `${value}%` }} /></div>
                <strong>{value}%</strong>
              </div>
            ))}
          </div>

          <div className="ca-diagnostic-summary">
            <div>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span><strong>对称性通过</strong><small>最大误差 2.1e-8</small></span>
            </div>
            <div>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span><strong>对角线通过</strong><small>351 / 351 均为 1.00</small></span>
            </div>
            <div>
              <Info size={16} aria-hidden="true" />
              <span><strong>{flaggedPairs} 组重点样本对</strong><small>可进入结果分析继续核对</small></span>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}

function MultiKernelPage({
  weightsOption,
  topologyOption,
  convergenceOption,
}: {
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
  convergenceOption: EChartsOption;
}) {
  const [isRunning, setIsRunning] = useState(true);

  return (
    <section className="workbench-page mkl-analysis-page" aria-label="多核相似性学习">
      <WorkbenchPageHeader
        icon={Network}
        title="多核相似性学习"
        context="任务 #OMELET-072 · Ionosphere · OMELET-SV · 第 6 / 10 轮"
        status={
          <WorkbenchStatus tone={isRunning ? 'warning' : 'neutral'} pulse={isRunning}>
            {isRunning ? '联合优化中' : '已暂停'}
          </WorkbenchStatus>
        }
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setIsRunning((value) => !value)}>
              {isRunning ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {isRunning ? '暂停任务' : '继续任务'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => downloadTextFile('omelet-sv-parameters.json', JSON.stringify(Object.fromEntries(taskParams), null, 2), 'application/json')}
            >
              <Save size={15} aria-hidden="true" />
              保存参数
            </button>
          </>
        }
      />

      <WorkbenchMetricStrip
        label="学习状态摘要"
        metrics={[
          { label: '参与学习的核', value: '4 组', note: '2 RBF · Linear · Poly', icon: Boxes, tone: 'blue' },
          { label: '当前迭代', value: '6 / 10', note: isRunning ? '正在更新 Z / S / alpha' : '任务已暂停', icon: RefreshCw, tone: 'amber' },
          { label: '目标函数', value: '113.9', note: '较初始值下降 53.6%', icon: TrendingDown, tone: 'green' },
          { label: '主导核权重', value: '0.31', note: 'RBF 核 · sigma = 1', icon: Target, tone: 'teal' },
        ]}
      />

      <div className="mkl-primary-grid">
        <SelectableChartPanel weightsOption={weightsOption} topologyOption={topologyOption} />
        <TaskPanel />
      </div>

      <div className="mkl-secondary-grid">
        <PipelinePanel />
        <ChartPanel
          className="mkl-convergence-panel"
          title="优化收敛"
          description="目标函数在第 6 轮后进入稳定区间"
          label="多核学习收敛曲线"
          option={convergenceOption}
        />
      </div>

      <section className="panel mkl-diagnostics-panel" aria-label="核权重诊断">
        <WorkbenchSectionHeader
          title="核权重诊断"
          meta="alpha 权重和为 1.00，当前没有异常塌缩。"
          actions={<WorkbenchStatus tone="success">约束通过</WorkbenchStatus>}
        />
        <div className="mkl-kernel-rows">
          {[
            ['K1 · RBF σ=1', 31, '对局部结构最敏感', 'blue'],
            ['K2 · Linear', 22, '保留全局线性关系', 'teal'],
            ['K3 · RBF σ=2', 29, '补充平滑邻域结构', 'green'],
            ['K4 · Polynomial d=3', 18, '提供非线性交互项', 'amber'],
          ].map(([label, value, note, tone]) => (
            <div className="mkl-kernel-row" key={label}>
              <div><strong>{label}</strong><span>{note}</span></div>
              <WorkbenchProgress value={Number(value)} label={`权重 ${Number(value) / 100}`} tone={tone as 'blue' | 'teal' | 'green' | 'amber'} animated={isRunning} />
            </div>
          ))}
        </div>
      </section>
    </section>
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
  const navigate = useNavigate();

  return (
    <section className="workbench-page results-analysis-page" aria-label="结果分析">
      <WorkbenchPageHeader
        icon={BarChart3}
        title="结果分析"
        context="任务 #OMELET-072 · Ionosphere · 10 次重复实验 · 完成于 10:31"
        status={<WorkbenchStatus tone="success">结果已验证</WorkbenchStatus>}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/workbench/reports')}>
              <FileText size={15} aria-hidden="true" />
              生成报告
            </button>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/workbench/export')}>
              <Download size={15} aria-hidden="true" />
              导出结果
            </button>
          </>
        }
      />

      <WorkbenchMetricStrip
        label="核心性能指标"
        metrics={metrics.slice(0, 4).map((metric, index) => ({
          label: metric.label,
          value: metric.value,
          note: index === 0 ? '较基线提升 3.8%' : metric.note,
          icon: [Target, Network, Boxes, CheckCircle2][index],
          tone: (['green', 'blue', 'teal', 'neutral'] as const)[index],
        }))}
      />

      <div className="result-primary-grid">
        <ChartPanel
          className="result-featured-chart"
          title="聚类分布"
          description="降维空间中的最终标签分布，当前分为 2 个稳定簇"
          label="结果聚类散点图"
          option={scatterOption}
        />

        <section className="panel result-quality-panel" aria-label="结果质量摘要">
          <WorkbenchSectionHeader title="结果质量" meta="10 次运行波动保持在 2.1% 以内。" />
          <div className="result-quality-score">
            <div>
              <span>综合可信度</span>
              <strong>89.7</strong>
              <small>/ 100</small>
            </div>
            <WorkbenchStatus tone="success">稳定</WorkbenchStatus>
          </div>
          <div className="result-quality-bars">
            <WorkbenchProgress value={91} label="标签一致性" tone="green" />
            <WorkbenchProgress value={86} label="信息一致性" tone="blue" />
            <WorkbenchProgress value={83} label="随机修正指数" tone="teal" />
            <WorkbenchProgress value={88} label="类别均衡度" tone="amber" />
          </div>
          <WorkbenchNotice
            tone="success"
            icon={CheckCircle2}
            title="质量门槛已通过"
            detail="指标、标签数量和收敛状态均满足导出条件。"
          />
        </section>
      </div>

      <div className="result-support-grid">
        <SelectableChartPanel weightsOption={weightsOption} topologyOption={topologyOption} />
        <ChartPanel
          title="收敛曲线"
          description="第 6 轮后目标函数变化小于 1%"
          label="结果收敛曲线"
          option={convergenceOption}
        />
      </div>

      <section className="panel result-runs-panel" aria-label="重复实验摘要">
        <WorkbenchSectionHeader title="重复实验摘要" meta="最近 4 次运行 · 按 ACC 从高到低查看" />
        <div className="result-runs-table" role="table" aria-label="重复实验结果">
          <div className="result-runs-row header" role="row">
            <span role="columnheader">运行</span><span role="columnheader">ACC</span><span role="columnheader">NMI</span><span role="columnheader">ARI</span><span role="columnheader">F1</span><span role="columnheader">耗时</span><span role="columnheader">状态</span>
          </div>
          {[
            ['#03', '92.1%', '87.1%', '83.9%', '89.0%', '17.9s'],
            ['#01', '91.8%', '86.7%', '83.1%', '88.5%', '18.2s'],
            ['#04', '90.9%', '86.2%', '82.4%', '87.8%', '18.5s'],
            ['#02', '90.4%', '85.9%', '81.6%', '87.2%', '18.7s'],
          ].map((row) => (
            <div className="result-runs-row" role="row" key={row[0]}>
              {row.map((cell) => <span role="cell" key={cell}>{cell}</span>)}
              <span role="cell"><WorkbenchStatus tone="success">通过</WorkbenchStatus></span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function ExportCenterPage() {
  const exportItems = [
    { key: 'labels', label: '聚类标签', note: '351 个样本 · CSV', size: '18 KB', icon: FileSpreadsheet },
    { key: 'metrics', label: '性能指标', note: 'ACC / NMI / ARI / F1', size: '12 KB', icon: BarChart3 },
    { key: 'charts', label: '图像结果', note: '5 张 PNG · 1600 × 900', size: '6.8 MB', icon: LayoutGrid },
    { key: 'config', label: '任务参数', note: '核配置与迭代参数 · JSON', size: '4 KB', icon: FileJson },
    { key: 'report', label: '分析摘要', note: '实验信息与主要结论 · TXT', size: '26 KB', icon: FileText },
  ] as const;
  const [selectedItems, setSelectedItems] = useState<string[]>(exportItems.map((item) => item.key));
  const [format, setFormat] = useState<'zip' | 'json' | 'csv'>('zip');
  const [filename, setFilename] = useState('Ionosphere_OMELET-SV_20260716');
  const [exportState, setExportState] = useState<'idle' | 'preparing' | 'done'>('idle');

  function toggleExportItem(key: string) {
    setSelectedItems((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
    setExportState('idle');
  }

  function createExport() {
    if (selectedItems.length === 0 || exportState === 'preparing') return;
    setExportState('preparing');
    window.setTimeout(() => {
      const payload = {
        dataset: 'Ionosphere',
        mode: 'OMELET-SV',
        generatedAt: new Date().toISOString(),
        files: selectedItems,
        metrics: { ACC: '91.2%', NMI: '86.4%', ARI: '82.7%', F1: '88.0%' },
      };
      downloadTextFile(`${filename}.${format === 'zip' ? 'json' : format}`, JSON.stringify(payload, null, 2), 'application/json');
      setExportState('done');
    }, 850);
  }

  return (
    <section className="workbench-page export-center-page" aria-label="结果导出">
      <WorkbenchPageHeader
        icon={Archive}
        title="结果导出"
        context="任务 #OMELET-072 · Ionosphere · 所有质量检查已通过"
        status={<WorkbenchStatus tone="success">可导出</WorkbenchStatus>}
        actions={
          <button type="button" className="btn btn-primary" disabled={selectedItems.length === 0 || exportState === 'preparing'} onClick={createExport}>
            <FileArchive size={15} aria-hidden="true" />
            {exportState === 'preparing' ? '正在打包' : '生成导出包'}
          </button>
        }
      />

      <WorkbenchMetricStrip
        label="导出摘要"
        metrics={[
          { label: '可用内容', value: '5 项', note: '标签、指标、图像、参数、摘要', icon: Archive, tone: 'blue' },
          { label: '当前选择', value: `${selectedItems.length} 项`, note: '可随时调整', icon: CheckCircle2, tone: 'teal' },
          { label: '预计大小', value: selectedItems.includes('charts') ? '6.9 MB' : '60 KB', note: '按当前选择估算', icon: FileArchive, tone: 'neutral' },
          { label: '最近导出', value: '10:12', note: 'Ionosphere_results.zip', icon: Clock3, tone: 'green' },
        ]}
      />

      <div className="export-builder-grid">
        <section className="panel export-selection-panel" aria-label="选择导出内容">
          <WorkbenchSectionHeader
            title="导出内容"
            meta={`${selectedItems.length} / ${exportItems.length} 项已选择`}
            actions={
              <button
                type="button"
                className="text-action"
                onClick={() => setSelectedItems(selectedItems.length === exportItems.length ? [] : exportItems.map((item) => item.key))}
              >
                {selectedItems.length === exportItems.length ? '清除选择' : '全部选择'}
              </button>
            }
          />
          <div className="export-item-list">
            {exportItems.map((item) => {
              const Icon = item.icon;
              const selected = selectedItems.includes(item.key);
              return (
                <label className={`export-item-row${selected ? ' selected' : ''}`} key={item.key}>
                  <input type="checkbox" checked={selected} onChange={() => toggleExportItem(item.key)} />
                  <span className="export-item-icon" aria-hidden="true"><Icon size={17} /></span>
                  <span className="export-item-copy"><strong>{item.label}</strong><small>{item.note}</small></span>
                  <span className="export-item-size">{item.size}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="panel export-settings-panel" aria-label="导出设置">
          <WorkbenchSectionHeader title="导出设置" meta="文件名与交付格式" />
          <label className="export-field">
            <span>文件名</span>
            <input value={filename} onChange={(event) => setFilename(event.target.value)} />
          </label>
          <fieldset className="export-format-field">
            <legend>交付格式</legend>
            <div className="export-format-options">
              {[
                ['zip', '完整包', FileArchive],
                ['json', 'JSON', FileJson],
                ['csv', 'CSV 清单', FileSpreadsheet],
              ].map(([value, label, Icon]) => (
                <button
                  type="button"
                  className={format === value ? 'active' : ''}
                  aria-pressed={format === value}
                  key={value as string}
                  onClick={() => setFormat(value as 'zip' | 'json' | 'csv')}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label as string}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="export-manifest">
            <div><span>数据集</span><strong>Ionosphere</strong></div>
            <div><span>任务模式</span><strong>OMELET-SV</strong></div>
            <div><span>指标精度</span><strong>保留 4 位</strong></div>
            <div><span>图像规格</span><strong>PNG · 1600 × 900</strong></div>
          </div>
          {exportState === 'preparing' ? <WorkbenchProgress value={72} label="正在整理文件" animated /> : null}
          {exportState === 'done' ? (
            <WorkbenchNotice tone="success" icon={CheckCircle2} title="导出包已生成" detail="文件已保存到浏览器下载目录。" />
          ) : null}
          <button type="button" className="btn btn-primary export-submit" disabled={selectedItems.length === 0 || exportState === 'preparing'} onClick={createExport}>
            <Download size={15} aria-hidden="true" />
            {exportState === 'preparing' ? '正在生成…' : `生成 ${format.toUpperCase()}`}
          </button>
        </section>
      </div>

      <section className="panel recent-exports-panel" aria-label="最近导出">
        <WorkbenchSectionHeader title="最近导出" meta="当前任务的最近 3 条交付记录" />
        <div className="recent-export-table" role="table" aria-label="最近导出记录">
          {[
            ['Ionosphere_results_1012.zip', '完整包 · 5 项', '6.9 MB', '今天 10:12'],
            ['Ionosphere_metrics_0948.csv', '指标清单 · 1 项', '12 KB', '今天 09:48'],
            ['Ionosphere_review_0715.json', '复核数据 · 3 项', '42 KB', '昨天 18:26'],
          ].map((row) => (
            <div className="recent-export-row" role="row" key={row[0]}>
              <FileArchive size={16} aria-hidden="true" />
              <strong role="cell">{row[0]}</strong>
              <span role="cell">{row[1]}</span>
              <span role="cell">{row[2]}</span>
              <time role="cell">{row[3]}</time>
              <button type="button" className="icon-action" title="重新生成" aria-label={`重新生成 ${row[0]}`} onClick={createExport}>
                <RefreshCw size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function WorkbenchPageContent({
  activeSection,
  sectionKey,
  resultResource,
  weightsOption,
  topologyOption,
  convergenceOption,
  scatterOption,
}: {
  activeSection: string;
  sectionKey: string;
  resultResource: ReturnType<typeof useTaskResult>;
  weightsOption: EChartsOption;
  topologyOption: EChartsOption;
  convergenceOption: EChartsOption;
  scatterOption: EChartsOption;
}) {
  if (['analysis', 'ca-matrix', 'kernel-config', 'mkl', 'evaluation', 'visualization', 'results', 'export', 'reports', 'logs'].includes(sectionKey)) {
    return <TaskResultViews section={sectionKey} resource={resultResource} />;
  }

  if (activeSection === '数据管理') {
    return <DatasetManagementPage />;
  }

  if (activeSection === '数据质量检查') {
    return <DataQualityPage />;
  }

  if (activeSection === '数据版本记录') {
    return <DatasetVersionsPage />;
  }

  if (activeSection === '任务中心') {
    return <TaskCenterPage />;
  }

  if (activeSection === 'CA 协关联矩阵') {
    return <CAMatrixPage />;
  }

  if (activeSection === '核函数配置') {
    return <KernelConfigPage />;
  }

  if (activeSection === '多核相似性学习') {
    return (
      <MultiKernelPage
        weightsOption={weightsOption}
        topologyOption={topologyOption}
        convergenceOption={convergenceOption}
      />
    );
  }

  if (activeSection === '性能评估') {
    return <PerformanceEvaluationPage metrics={metrics} />;
  }

  if (activeSection === '可视化展示') {
    return (
      <VisualizationShowcasePage
        weightsOption={weightsOption}
        topologyOption={topologyOption}
        convergenceOption={convergenceOption}
        scatterOption={scatterOption}
      />
    );
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

  if (activeSection === '分析报告') {
    return <ReportCenterPage />;
  }

  if (activeSection === '运行日志') {
    return <OperationLogsPage />;
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
  const workbenchKey = location.pathname.split('/')[2] || 'analysis';
  const resultResource = useTaskResult(Boolean(workbenchSection));
  const activeSection = workbenchSection ?? '分析工作台';
  const showStatusHeader = location.pathname === defaultWorkbenchPath;
  const initialPathRef = useRef(location.pathname);
  const sessionCheckedRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workbenchEntryPending, setWorkbenchEntryPending] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    const storedUser = localStorage.getItem('soft_web_user');
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      return null;
    }
  });
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');

  const topologyOption = useMemo(() => buildHeatmapOption(), []);
  const weightsOption = useMemo(() => buildKernelWeightsOption(), []);
  const convergenceOption = useMemo(() => buildConvergenceOption(), []);
  const scatterOption = useMemo(() => buildClusterScatterOption(), []);

  const openWorkbench = useCallback(() => {
    navigate(defaultWorkbenchPath);
    setSidebarOpen(false);
  }, [navigate]);

  const enterWorkbench = useCallback(async () => {
    if (workbenchEntryPending) return;

    setWorkbenchEntryPending(true);
    const accessToken = getStoredAccessToken();

    try {
      if (!accessToken) {
        clearAuthSession();
        setCurrentUser(null);
        navigate('/login');
        return;
      }

      const user = await getCurrentUser(accessToken);
      setCurrentUser(user);
      openWorkbench();
    } catch {
      clearAuthSession();
      setCurrentUser(null);
      setSidebarOpen(false);
      navigate('/login');
    } finally {
      setWorkbenchEntryPending(false);
    }
  }, [navigate, openWorkbench, workbenchEntryPending]);

  const refreshBackendStatus = useCallback(async () => {
    setBackendStatus('checking');
    if (typeof fetch === 'undefined') {
      setBackendStatus('offline');
      return;
    }
    try {
      const response = await fetch(`${API}/health`);
      if (!response.ok) {
        throw new Error('health check failed');
      }
      setBackendStatus('online');
    } catch {
      setBackendStatus('offline');
    }
  }, []);

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

  useEffect(() => {
    if (!workbenchSection) return;
    void refreshBackendStatus();
  }, [refreshBackendStatus, workbenchSection]);

  const handleAuthSuccess = () => {
    const storedUser = localStorage.getItem('soft_web_user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setCurrentUser(null);
      }
    }
    openWorkbench();
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
        currentUser={currentUser}
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

      <main className={`dashboard-content${workbenchKey === 'logs' ? ' is-log-layout' : ''}`} id="main-content">
        {showStatusHeader ? (
          <StatusHeader
            status={backendStatus}
            onImportData={() => navigate('/workbench/datasets')}
            onCreateTask={() => navigate('/workbench/tasks')}
          />
        ) : null}
        <WorkbenchPageContent
          activeSection={activeSection}
          sectionKey={workbenchKey}
          resultResource={resultResource}
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
              isEnteringWorkbench={workbenchEntryPending}
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
