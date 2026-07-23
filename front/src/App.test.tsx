import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import type { MatrixPreview, TaskResultEnvelope } from './workbench/results/types';

const originalFetch = globalThis.fetch;

const authBody = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  user: { id: 1, username: 'alice', role: 'user', status: 'active' },
};

function createMatrixPreview(): MatrixPreview {
  return {
    shape: [2, 2],
    rowIndices: [1, 2],
    columnIndices: [1, 2],
    values: [
      [1, 0.25],
      [0.25, 1],
    ],
    stats: {
      min: 0.25,
      max: 1,
      mean: 0.625,
      std: 0.375,
      diagonalMean: 1,
      symmetryMaxError: 0,
      nonzeroRatio: 1,
    },
    topPairs: Array.from({ length: 20 }, (_, index) => ({
      row: 1,
      column: index + 2,
      value: Number((0.95 - index * 0.02).toFixed(5)),
    })),
  };
}

function createTaskResultEnvelope({ emptyDetails = false }: { emptyDetails?: boolean } = {}): TaskResultEnvelope {
  const envelope: TaskResultEnvelope = {
    state: 'ready',
    task: {
      id: 3,
      name: '结果验证任务',
      mode: 'OMELET-SV',
      status: 'succeeded',
      progress: 100,
      currentRun: 6,
      totalRuns: 6,
      currentIter: 3,
      maxIter: 3,
      currentStage: 'persist',
      datasetId: 8,
      datasetName: 'verification_dataset',
      params: { nBase: 20, sigma: 1, lambda: 5, gamma: 5, anchor: 10, runs: 6, maxIter: 3, randomSeed: 1 },
      metricsSummary: { acc: 0.7122507123, nmi: 0.1348569209, ari: 0.1776068547, f1: 0.6049131591 },
      runtimeSeconds: 0.61,
      createdAt: '2026-07-16 19:10:00',
      startedAt: '2026-07-16 19:10:01',
      finishedAt: '2026-07-16 19:10:02',
      updatedAt: '2026-07-16 19:10:02',
    },
    result: {
      schemaVersion: 1,
      parameters: { nBase: 20, sigma: 1, lambda: 5, gamma: 5, anchor: 10, runs: 6, maxIter: 3, randomSeed: 1 },
      runtimeSeconds: 0.61,
      metrics: {
        aggregate: {
          acc: { mean: 0.7122507123, std: 0.0051, min: 0.704, max: 0.719 },
          nmi: { mean: 0.1348569209, std: 0.0042, min: 0.129, max: 0.141 },
          ari: { mean: 0.1776068547, std: 0.0064, min: 0.169, max: 0.186 },
          f1: { mean: 0.6049131591, std: 0.0048, min: 0.598, max: 0.612 },
        },
        runs: [
          { run: 1, seed: 1, runtimeSeconds: 0.47, acc: 0.7122507123, nmi: 0.1348569209, ari: 0.1776068547, f1: 0.6049131591 },
          { run: 2, seed: 2, runtimeSeconds: 0.51, acc: 0.704, nmi: 0.129, ari: 0.169, f1: 0.598 },
          { run: 3, seed: 3, runtimeSeconds: 0.49, acc: 0.719, nmi: 0.141, ari: 0.186, f1: 0.612 },
          { run: 4, seed: 4, runtimeSeconds: 0.50, acc: 0.708, nmi: 0.132, ari: 0.174, f1: 0.601 },
          { run: 5, seed: 5, runtimeSeconds: 0.48, acc: 0.714, nmi: 0.137, ari: 0.181, f1: 0.607 },
          { run: 6, seed: 6, runtimeSeconds: 0.52, acc: 0.716, nmi: 0.136, ari: 0.179, f1: 0.606 },
        ],
      },
      kernelWeights: {
        items: [
          { key: 'rbf_sigma_squared', mean: 0.2, std: 0, representative: 0.2 },
          { key: 'linear', mean: 0.4, std: 0, representative: 0.4 },
          { key: 'rbf_sigma', mean: 0.2, std: 0, representative: 0.2 },
          { key: 'polynomial_2', mean: 0.2, std: 0, representative: 0.2 },
        ],
        runs: [{ run: 1, values: [0.2, 0.4, 0.2, 0.2] }],
      },
      convergence: {
        representativeRun: 6,
        runs: [
          {
            run: 1,
            converged: true,
            points: [
              { iteration: 1, objective: 10, relativeChange: null },
              { iteration: 2, objective: 5, relativeChange: 0.5 },
            ],
          },
          {
            run: 6,
            converged: true,
            points: [
              { iteration: 1, objective: 12, relativeChange: null },
              { iteration: 2, objective: 4, relativeChange: 0.6667 },
              { iteration: 3, objective: 3.5, relativeChange: 0.125 },
            ],
          },
        ],
      },
      preview: {
        schemaVersion: 1,
        summary: {
          mode: 'OMELET-SV',
          sampleCount: 351,
          baseClusterCount: 100,
          classCount: 2,
          representativeRun: 6,
          randomSeed: 1,
        },
        matrices: {
          ca: createMatrixPreview(),
          s: createMatrixPreview(),
          z: createMatrixPreview(),
        },
        scatter: {
          totalCount: 2,
          sampled: false,
          points: [
            { sampleIndex: 1, x: -1, y: 0.5, predictedLabel: '1', trueLabel: '1' },
            { sampleIndex: 2, x: 1, y: -0.5, predictedLabel: '2', trueLabel: '2' },
          ],
        },
      },
      artifacts: [{
        key: 'labels',
        name: '聚类标签',
        format: 'NPZ',
        size: 128,
        downloadUrl: '/api/tasks/3/artifacts/labels',
      }],
    },
  };

  if (emptyDetails && envelope.result) {
    envelope.result.metrics.runs = [];
    envelope.result.kernelWeights.items = [];
    envelope.result.kernelWeights.runs = [];
    envelope.result.convergence.runs = [];
    envelope.result.preview.scatter.points = [];
    envelope.result.preview.scatter.totalCount = 0;
    envelope.result.artifacts = [];
  }

  return envelope;
}

type DatasetFixture = {
  id: number;
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
  labelDistribution: Array<{ label: string; count: number; percent: number }>;
  clusterStats: Array<{ name: string; clusterCount: number; range: string }>;
};

type DatasetListFixture = DatasetFixture[] | {
  items: DatasetFixture[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

function createResponse<T>(body: T, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

function createDataset(overrides: Partial<DatasetFixture> = {}): DatasetFixture {
  const base: DatasetFixture = {
    id: 8,
    name: 'example_upload',
    createdAt: '2026-07-09 16:20:31',
    fileSizeBytes: 24576,
    sampleCount: 24,
    baseCount: 24,
    classCount: 3,
    hasLabels: true,
    dataType: '数值',
    taskCount: 0,
    lastAnalysisAt: null,
    version: 1,
    qualityStatus: 'ready',
    qualityIssues: [],
    matrixShape: 'E: 24 x 24',
    labelShape: 'y: 24',
    labelDistribution: [
      { label: '0', count: 14, percent: 58 },
      { label: '1', count: 10, percent: 42 },
    ],
    clusterStats: [
      { name: 'base_1', clusterCount: 4, range: '1-4' },
      { name: 'base_24', clusterCount: 6, range: '21-24' },
    ],
  };

  return {
    ...base,
    ...overrides,
    labelDistribution: overrides.labelDistribution ?? base.labelDistribution,
    clusterStats: overrides.clusterStats ?? base.clusterStats,
  };
}

function mockAuthApi(resultEnvelope = createTaskResultEnvelope()) {
  const fetchMock = vi.fn(async (input) => {
    const url = String(input);

    if (url.endsWith('/api/auth/login') || url.endsWith('/api/auth/register')) {
      return createResponse(authBody);
    }

    if (url.endsWith('/api/auth/me')) {
      return createResponse(authBody.user);
    }

    if (url.endsWith('/api/auth/logout')) {
      return createResponse({ message: '已退出登录' });
    }

    if (url.endsWith('/api/health')) {
      return createResponse({ status: 'ok', service: 'soft_web_backend' });
    }

    if (url.endsWith('/api/tasks/results/latest') || url.endsWith('/api/tasks/3/result')) {
      return createResponse(resultEnvelope);
    }

    if (url.endsWith('/api/tasks/3/logs')) {
      return createResponse({
        items: [{ id: 1, action: 'task_succeeded', level: 'info', message: '算法执行完成', createdAt: '2026-07-16 19:10:02' }],
        total: 1,
      });
    }

    if (url.endsWith('/api/tasks/3/exports')) {
      return createResponse({ items: [] });
    }

    if (url.includes('/api/datasets')) {
      return createResponse({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
    }

    return createResponse({ detail: 'unexpected request' }, false);
  });

  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function mockDatasetApi({
  datasets,
  patchResponse,
  deleteOk = true,
  deleteDetail = '删除失败',
}: {
  datasets: DatasetListFixture;
  patchResponse?: DatasetFixture;
  deleteOk?: boolean;
  deleteDetail?: string;
}) {
  const fetchMock = vi.fn(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.endsWith('/api/auth/me')) {
      return createResponse(authBody.user);
    }

    if (url.endsWith('/api/datasets') && method === 'GET') {
      return createResponse(datasets);
    }

    if (patchResponse && url.endsWith(`/api/datasets/${patchResponse.id}`) && method === 'PATCH') {
      return createResponse(patchResponse);
    }

    if (url.match(/\/api\/datasets\/\d+$/) && method === 'DELETE') {
      return createResponse(deleteOk ? { message: '删除成功' } : { detail: deleteDetail }, deleteOk);
    }

    return createResponse({ detail: 'unexpected request' }, false);
  });

  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

function renderApp(initialPath = '/') {
  window.history.pushState({}, '', initialPath);
  return render(
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <App />
    </BrowserRouter>,
  );
}

function getAuthCard(title: '登录' | '注册') {
  const card = screen.getByRole('heading', { name: title }).closest('.auth-card');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`未找到${title}卡片`);
  }

  return within(card);
}

async function signInFromLanding() {
  const user = userEvent.setup();
  mockAuthApi();

  await user.click(screen.getByRole('button', { name: '登录' }));
  const loginCard = getAuthCard('登录');

  await user.type(loginCard.getByLabelText('用户名'), 'alice');
  await user.type(loginCard.getByLabelText('密码'), 'secret123');
  await user.click(loginCard.getByRole('button', { name: '登录' }));

  await screen.findByRole('heading', { name: '分析工作台', level: 1 });
}

describe('dashboard homepage', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('routes the workbench entry to login when no session exists', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(screen.getByRole('button', { name: '前往分析工作台' }));

    expect(await screen.findByRole('heading', { name: '登录', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(localStorage.getItem('soft_web_access_token')).toBeNull();
  });

  it('restores a valid session and enters the default workbench', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    renderApp('/');

    expect(await screen.findByRole('heading', { name: '分析工作台', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/workbench/analysis');
  });

  it('clears an expired session and routes the workbench entry to login', async () => {
    localStorage.setItem('soft_web_access_token', 'expired-token');
    localStorage.setItem('soft_web_refresh_token', 'expired-refresh-token');
    localStorage.setItem('soft_web_user', JSON.stringify(authBody.user));
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return createResponse({ detail: '登录凭证无效或已过期' }, false);
      return createResponse({ detail: 'unexpected request' }, false);
    }) as typeof fetch;
    const user = userEvent.setup();
    renderApp('/');

    await user.click(screen.getByRole('button', { name: '前往分析工作台' }));

    expect(await screen.findByRole('heading', { name: '登录', level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(localStorage.getItem('soft_web_access_token')).toBeNull();
    expect(localStorage.getItem('soft_web_refresh_token')).toBeNull();
    expect(localStorage.getItem('soft_web_user')).toBeNull();
  });

  it('renders the dashboard shell after logging in', async () => {
    renderApp();
    await signInFromLanding();

    const topHeader = document.querySelector('.main-header');
    if (!(topHeader instanceof HTMLElement)) {
      throw new Error('未找到顶部栏');
    }
    const headerUser = topHeader.querySelector('.header-user');
    expect(topHeader.querySelector('.header-run-context')).not.toBeInTheDocument();
    expect(topHeader.querySelector('.header-service-state')).not.toBeInTheDocument();
    expect(headerUser).toHaveAttribute('aria-label', `当前用户：${authBody.user.username}`);
    expect(headerUser?.querySelectorAll('.header-user-avatar')).toHaveLength(1);
    expect(headerUser?.children).toHaveLength(1);

    const connectionStatus = screen.getByRole('region', { name: '系统连接状态' });
    expect(within(connectionStatus).queryByText('服务地址')).not.toBeInTheDocument();

    expect(screen.getByRole('region', { name: '重复实验指标' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CA 协关联矩阵' })).toBeInTheDocument();
    expect(screen.getAllByText('71.23%').length).toBeGreaterThan(0);
    expect(screen.queryByText('真实结果')).not.toBeInTheDocument();
    expect(screen.getAllByText(/verification_dataset/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '分析链路' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近五轮实验' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '最近五轮实验指标' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '后续处理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /完整可视化/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CA 协关联矩阵' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '数据质量检查' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '性能评估' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '可视化展示' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '运行日志' })).toBeInTheDocument();
  });

  it('switches convergence runs and keeps the selected task when opening a detail page', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/analysis');

    await screen.findByRole('heading', { name: '分析工作台', level: 1 });
    const runSelect = screen.getByRole('combobox', { name: '选择运行轮次' });
    expect(runSelect).toHaveTextContent('第 6 轮');

    await user.click(runSelect);
    await user.click(screen.getByRole('option', { name: '第 1 轮' }));
    expect(screen.getByText('最终目标函数 5.00000')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /查看全部/ }));
    await screen.findByRole('heading', { name: '性能评估', level: 1 });
    expect(window.location.pathname).toBe('/workbench/evaluation');
    expect(window.location.search).toBe('?taskId=3');

    await user.click(screen.getByRole('button', { name: '返回' }));
    await screen.findByRole('heading', { name: '分析工作台', level: 1 });
    expect(window.location.pathname).toBe('/workbench/analysis');
  });

  it('renders complete result detail pages from the selected task', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const routes = [
      ['/workbench/ca-matrix?taskId=3', 'CA 协关联矩阵', '矩阵诊断'],
      ['/workbench/kernel-config?taskId=3', '核函数配置', '核函数工作区'],
      ['/workbench/mkl?taskId=3', '多核相似性学习', '求解轨迹'],
      ['/workbench/visualization?taskId=3', '可视化展示', '可视化目录'],
      ['/workbench/results?taskId=3', '结果分析', '实验诊断摘要'],
      ['/workbench/export?taskId=3', '结果导出', '创建交付档案'],
      ['/workbench/reports?taskId=3', '分析报告', '报告预览'],
    ] as const;

    for (const [path, title, sectionTitle] of routes) {
      const view = renderApp(path);

      expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: sectionTitle })).toBeInTheDocument();
      expect(screen.getAllByText(/verification_dataset/).length).toBeGreaterThan(0);
      expect(window.location.search).toBe('?taskId=3');
      expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();

      if (path.startsWith('/workbench/ca-matrix')) {
        const formula = screen.getByLabelText('CA 等于 M 乘 M 转置除以基础聚类数量');
        expect(formula).toHaveClass('result-ca-formula');
        expect(formula.querySelector('.katex')).toBeInTheDocument();
      }

      if (path.startsWith('/workbench/kernel-config')) {
        expect(screen.getByLabelText(/K1 RBF 核/)).toHaveClass('result-kernel-formula');
        expect(screen.getByRole('button', { name: '相对变化' })).toHaveAttribute('aria-pressed', 'true');
      }

      if (path.startsWith('/workbench/results')) {
        const summary = screen.getByRole('region', { name: '实验诊断摘要' });
        const evidence = screen.getByRole('region', { name: '实验图表证据' });

        expect(summary.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(within(summary).getByText('最高 ACC 轮次')).toBeInTheDocument();
        expect(within(summary).getByText('代表轮次不是最优轮次')).toBeInTheDocument();
        expect(evidence.querySelector('.result-analysis-scatter')).toBeInTheDocument();
        expect(evidence.querySelector('.result-analysis-convergence')).toBeInTheDocument();
        expect(evidence.querySelector('.result-analysis-trend')).toBeInTheDocument();
      }

      if (path.startsWith('/workbench/export')) {
        expect(screen.getByRole('region', { name: '创建交付档案' })).toBeInTheDocument();
        expect(screen.getByDisplayValue('verification_dataset · OMELET-SV 交付档案')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /评审交付/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /完整归档/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '原始产物' })).toBeInTheDocument();
      }

      view.unmount();
    }
  });

  it('renders the performance review workspace and synchronizes the focused metric', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/evaluation?taskId=3');

    await screen.findByRole('heading', { name: '性能评估', level: 1 });
    expect(screen.getByRole('region', { name: '评估结论' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '指标趋势' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '稳定性诊断' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '指标分布' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '评估口径' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeEnabled();

    const table = screen.getByRole('table', { name: '重复实验明细表' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(within(table).getByText('最高 ACC')).toBeInTheDocument();
    expect(within(table).getByText('代表轮次')).toBeInTheDocument();

    const metricSelect = screen.getByRole('combobox', { name: '突出评估指标' });
    await user.click(metricSelect);
    await user.click(screen.getByRole('option', { name: 'NMI' }));

    expect(metricSelect).toHaveTextContent('NMI');
    expect(screen.getByLabelText('NMI跨轮次变化趋势')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'NMI' })).toHaveClass('is-focused');
    expect(within(table).getByText('最高 NMI')).toBeInTheDocument();

    const relativeButton = screen.getByRole('button', { name: '相对均值' });
    await user.click(relativeButton);
    expect(relativeButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('NMI相对均值变化趋势')).toBeInTheDocument();
    expect(screen.getByText(/以指标均值为 0 基线显示百分点变化/)).toBeInTheDocument();
  });

  it('keeps the evaluation context visible when repeated runs are unavailable', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi(createTaskResultEnvelope({ emptyDetails: true }));
    renderApp('/workbench/evaluation?taskId=3');

    await screen.findByRole('heading', { name: '性能评估', level: 1 });
    expect(screen.getByText('当前结果没有重复实验明细')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '评估口径' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeDisabled();
  });

  it('keeps the matrix color scale outside the chart with real bounds', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    renderApp('/workbench/ca-matrix?taskId=3');

    await screen.findByRole('heading', { name: 'CA 协关联矩阵', level: 1 });
    expect(screen.getByRole('img', { name: '矩阵色阶，最小值 0.2500，最大值 1.0000' })).toBeInTheDocument();
  });

  it('changes the visible CA ranking count without altering the persisted order', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/ca-matrix?taskId=3');

    await screen.findByRole('heading', { name: 'CA 协关联矩阵', level: 1 });
    const countSelect = screen.getByRole('combobox', { name: '选择高协关联样本对显示数量' });
    const ranking = screen.getByRole('table', { name: '高协关联样本对排名' });

    expect(countSelect).toHaveTextContent('Top 10');
    expect(within(ranking).getAllByRole('row')).toHaveLength(11);
    expect(within(ranking).getAllByRole('row')[1]).toHaveTextContent('S2');

    await user.click(countSelect);
    await user.click(screen.getByRole('option', { name: 'Top 5' }));
    expect(within(ranking).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByText('忽略对角线后按 CA 数值降序展示，当前显示 5 / 20 组')).toBeInTheDocument();
  });

  it('updates the kernel definition and weight workspace when selecting a kernel', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/kernel-config?taskId=3');

    await screen.findByRole('heading', { name: '核函数配置', level: 1 });
    const linearTab = screen.getByRole('tab', { name: /K2 · 线性核/ });
    await user.click(linearTab);

    expect(linearTab).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByLabelText('K2 线性核')).toHaveClass('result-kernel-formula');
    expect(screen.getByLabelText('当前核权重')).toHaveTextContent('0.40000');

    const relativeButton = screen.getByRole('button', { name: '相对变化' });
    const absoluteButton = screen.getByRole('button', { name: '绝对权重' });
    expect(relativeButton).toHaveAttribute('aria-pressed', 'true');
    await user.click(absoluteButton);
    expect(absoluteButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/保留原始权重尺度/)).toBeInTheDocument();
  });

  it('synchronizes the MKL chart diagnostics and iteration table by run', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/mkl?taskId=3');

    await screen.findByRole('heading', { name: '多核相似性学习', level: 1 });
    const runSelect = screen.getByRole('combobox', { name: '选择求解轮次' });
    expect(runSelect).toHaveTextContent('第 6 轮');
    expect(screen.getByLabelText('本轮求解诊断')).toHaveTextContent('3.50000');

    await user.click(runSelect);
    await user.click(screen.getByRole('option', { name: '第 1 轮' }));
    expect(screen.getByLabelText('本轮求解诊断')).toHaveTextContent('5.00000');
    expect(screen.getByRole('table', { name: '迭代目标函数明细' })).toHaveTextContent('第 2 次');
    expect(screen.getByRole('region', { name: '求解结论' })).toHaveTextContent('目标下降');
    expect(screen.getByRole('table', { name: '多轮运行对比表' })).toHaveTextContent('当前代表');

    const relativeButton = screen.getByRole('button', { name: '相对目标' });
    expect(relativeButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(relativeButton);
    expect(relativeButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches result visualizations and keeps the task context on the professional page', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/visualization?taskId=3');

    await screen.findByRole('heading', { name: '可视化展示', level: 1 });
    const toolbox = document.querySelector('.result-visual-toolbox');
    if (!(toolbox instanceof HTMLElement)) {
      throw new Error('未找到结果视图工具箱');
    }

    await user.click(within(toolbox).getByRole('button', { name: /核权重/ }));
    expect(screen.getByRole('heading', { name: '核权重' })).toBeInTheDocument();
    expect(within(toolbox).getByText('核数量')).toBeInTheDocument();

    await user.click(within(toolbox).getByRole('button', { name: /打开专业分析页/ }));
    await screen.findByRole('heading', { name: '核函数配置', level: 1 });
    expect(window.location.pathname).toBe('/workbench/kernel-config');
    expect(window.location.search).toBe('?taskId=3');
  });

  it('updates the report preview when chapters and format change', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const user = userEvent.setup();
    renderApp('/workbench/reports?taskId=3');

    await screen.findByRole('heading', { name: '分析报告', level: 1 });
    expect(screen.getByRole('heading', { name: '重复实验', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('2 / 5 展开')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '算法参数', level: 3 }).closest('details')).toHaveProperty('open', false);

    await user.click(screen.getByRole('button', { name: '全部展开报告章节' }));
    expect(screen.getByText('5 / 5 展开')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '算法参数', level: 3 }).closest('details')).toHaveProperty('open', true);

    await user.click(screen.getByRole('button', { name: '全部收起报告章节' }));
    expect(screen.getByText('0 / 5 展开')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /重复实验/ }));
    expect(screen.queryByRole('heading', { name: '重复实验', level: 3 })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByRole('button', { name: '生成 JSON 报告' })).toBeInTheDocument();
  });

  it('shows explicit overview empty states when optional result details are absent', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi(createTaskResultEnvelope({ emptyDetails: true }));
    renderApp('/workbench/analysis');

    await screen.findByRole('heading', { name: '分析工作台', level: 1 });
    expect(screen.getByText('暂无聚类分布')).toBeInTheDocument();
    expect(screen.getByText('暂无收敛轨迹')).toBeInTheDocument();
    expect(screen.getByText('暂无核权重')).toBeInTheDocument();
    expect(screen.getByText('当前结果没有重复实验明细。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /多核学习.*无轨迹/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /性能评估.*无明细/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /结果持久化.*无产物/ })).toBeInTheDocument();
  });

  it('renders the redesigned dataset detail page and random selection control', async () => {
    const dataset = createDataset();
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockDatasetApi({ datasets: [dataset] });

    const user = userEvent.setup();
    renderApp('/workbench/datasets');

    const row = (await screen.findByText(dataset.name)).closest('.dataset-list-item');
    if (!(row instanceof HTMLElement)) {
      throw new Error('未找到数据集行');
    }

    const topHeader = document.querySelector('.main-header');
    if (!(topHeader instanceof HTMLElement)) {
      throw new Error('未找到顶部栏');
    }
    const headerActions = topHeader.querySelector('.navbar-right');
    if (!(headerActions instanceof HTMLElement)) {
      throw new Error('未找到顶部栏操作区');
    }

    expect(topHeader.querySelector('.header-section-title')).toHaveTextContent('数据管理');
    expect(within(topHeader).queryByText('工作台')).not.toBeInTheDocument();
    expect(within(topHeader).queryByLabelText('搜索任务、矩阵或指标')).not.toBeInTheDocument();
    expect(within(topHeader).queryByRole('button', { name: '刷新后端连接状态' })).not.toBeInTheDocument();
    expect(within(topHeader).queryByRole('button', { name: '通知中心暂未开放' })).not.toBeInTheDocument();
    expect(within(topHeader).queryByRole('button', { name: '系统设置暂未开放' })).not.toBeInTheDocument();
    expect(within(headerActions).getByRole('button', { name: '退出登录' })).toBeInTheDocument();
    expect(headerActions.querySelectorAll('button')).toHaveLength(1);

    await user.click(within(row).getByRole('button', { name: '查看' }));

    const datasetHeading = screen.getByRole('heading', { name: dataset.name });
    expect(datasetHeading).toBeInTheDocument();
    expect(datasetHeading.closest('.dataset-detail-identity')).toHaveTextContent(dataset.createdAt);
    expect(datasetHeading.closest('.dataset-detail-identity')).toHaveTextContent('24 KB');
    expect(document.querySelector('.dataset-detail-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建任务' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重命名' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();

    const overview = screen.getByRole('region', { name: '数据集概览' });
    expect(overview.querySelectorAll('.dataset-overview-card')).toHaveLength(4);
    expect(Array.from(overview.querySelectorAll('.dataset-overview-card strong')).map((node) => node.textContent)).toEqual([
      '24',
      '24',
      '3',
      '20',
    ]);

    const labelSection = screen.getByRole('region', { name: '标签分布' });
    expect(within(labelSection).getByText('类别 0')).toBeInTheDocument();
    expect(within(labelSection).getByText('14 个')).toBeInTheDocument();
    expect(within(labelSection).getByText('58%')).toBeInTheDocument();

    const tableSection = screen.getByRole('region', { name: '基础聚类统计' });
    expect(within(tableSection).getByText('base_1')).toBeInTheDocument();
    expect(within(tableSection).getByText('base_24')).toBeInTheDocument();
    expect(within(tableSection).getByText('已选')).toBeInTheDocument();
    expect(within(tableSection).getByText('未选')).toBeInTheDocument();

    const selectionSection = screen.getByRole('region', { name: '选择基础聚类' });
    const nBaseInput = within(selectionSection).getByLabelText('n_base');
    const seedInput = within(selectionSection).getByLabelText('随机种子');
    const randomButton = within(selectionSection).getByRole('button', { name: '随机选择' });

    expect(within(selectionSection).getByText('20 / 24')).toBeInTheDocument();
    expect(within(selectionSection).getAllByText(/^base_/)).toHaveLength(20);

    await user.click(within(selectionSection).getByRole('button', { name: '移除 base_1' }));

    await waitFor(() => expect(within(selectionSection).getByText('19 / 24')).toBeInTheDocument());
    expect(nBaseInput).toHaveValue(19);
    const baseOneRow = within(tableSection).getByText('base_1').closest('tr');
    if (!(baseOneRow instanceof HTMLTableRowElement)) {
      throw new Error('未找到 base_1 统计行');
    }
    expect(within(baseOneRow).getByText('未选')).toBeInTheDocument();

    await user.clear(nBaseInput);
    await user.type(nBaseInput, '2');
    await user.clear(seedInput);
    await user.type(seedInput, '7');
    await user.click(randomButton);

    await waitFor(() => expect(within(selectionSection).getByText('2 / 24')).toBeInTheDocument());
    expect(within(selectionSection).getAllByText(/^base_/)).toHaveLength(2);
  });

  it('renders datasets returned by the paginated catalog response', async () => {
    const dataset = createDataset({ name: 'paged_upload' });
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockDatasetApi({
      datasets: {
        items: [dataset],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    });

    renderApp('/workbench/datasets');

    expect(await screen.findByText('paged_upload')).toBeInTheDocument();
  });

  it('uses compact icon actions in the dataset card view', async () => {
    const dataset = createDataset();
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockDatasetApi({ datasets: [dataset] });

    const user = userEvent.setup();
    renderApp('/workbench/datasets');

    await screen.findByText(dataset.name);
    await user.click(screen.getByRole('button', { name: '卡片视图' }));

    const card = screen.getByText(dataset.name).closest('.dataset-card');
    if (!(card instanceof HTMLElement)) {
      throw new Error('未找到数据集卡片');
    }

    expect(within(card).getByRole('button', { name: '查看' })).toHaveAttribute('title', '查看');
    expect(within(card).getByRole('button', { name: '更新' })).toHaveAttribute('title', '更新');
    expect(within(card).getByRole('button', { name: '删除' })).toHaveAttribute('title', '删除');
  });

  it('groups dataset quality and usage state in the catalog row', async () => {
    const dataset = createDataset({
      qualityStatus: 'warning',
      qualityIssues: ['标签数量与样本数量不一致'],
    });
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockDatasetApi({ datasets: [dataset] });

    renderApp('/workbench/datasets');

    const row = (await screen.findByText(dataset.name)).closest('.dataset-list-item');
    if (!(row instanceof HTMLElement)) {
      throw new Error('未找到数据集行');
    }

    expect(within(row).getByText('待确认')).toHaveAttribute('title', '标签数量与样本数量不一致');
    expect(within(row).getByText('未使用')).toBeInTheDocument();
  });

  it('opens the custom rename dialog and persists the new name', async () => {
    const dataset = createDataset();
    const renamedDataset = createDataset({ name: 'renamed_upload' });
    localStorage.setItem('soft_web_access_token', 'access-token');
    const fetchMock = mockDatasetApi({
      datasets: [dataset],
      patchResponse: renamedDataset,
    });
    const promptSpy = vi.spyOn(window, 'prompt');

    const user = userEvent.setup();
    renderApp('/workbench/datasets');

    const row = (await screen.findByText(dataset.name)).closest('.dataset-list-item');
    if (!(row instanceof HTMLElement)) {
      throw new Error('未找到数据集行');
    }

    await user.click(within(row).getByRole('button', { name: '查看' }));
    await user.click(screen.getByRole('button', { name: '重命名' }));

    const dialog = await screen.findByRole('dialog', { name: '重命名数据集' });
    expect(promptSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByText('修改后会同步更新列表、详情页和后续任务引用。')).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText('新名称');
    expect(nameInput).toHaveValue('example_upload');

    await user.clear(nameInput);
    await user.type(nameInput, 'renamed_upload');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByText('renamed_upload')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '重命名数据集' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/datasets\/8$/),
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: JSON.stringify({ name: 'renamed_upload' }),
      }),
    );
  });

  it('confirms dataset deletion in an in-app dialog before issuing DELETE', async () => {
    const dataset = createDataset();
    localStorage.setItem('soft_web_access_token', 'access-token');
    const fetchMock = mockDatasetApi({ datasets: [dataset] });
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderApp('/workbench/datasets');

    const row = (await screen.findByText(dataset.name)).closest('.dataset-list-item');
    if (!(row instanceof HTMLElement)) {
      throw new Error('未找到数据集行');
    }

    await user.click(within(row).getByRole('button', { name: '查看' }));
    await user.click(screen.getByRole('button', { name: '删除' }));

    const dialog = await screen.findByRole('dialog', { name: '删除数据集' });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(within(dialog).getByText(dataset.name)).toBeInTheDocument();
    expect(within(dialog).getByText('删除后将无法恢复，请确认目标数据集无误。')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '删除数据集' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/datasets\/8$/),
      expect.objectContaining({ method: 'DELETE' }),
    );

    await user.click(screen.getByRole('button', { name: '删除' }));
    const confirmDialog = await screen.findByRole('dialog', { name: '删除数据集' });
    await user.click(within(confirmDialog).getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '删除数据集' })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/datasets\/8$/),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
    expect(screen.queryByText(dataset.name)).not.toBeInTheDocument();
  });

  it('keeps the delete dialog open when the deletion request fails', async () => {
    const dataset = createDataset();
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockDatasetApi({ datasets: [dataset], deleteOk: false, deleteDetail: '数据集正在被任务使用' });
    const user = userEvent.setup();
    renderApp('/workbench/datasets');

    const row = (await screen.findByText(dataset.name)).closest('.dataset-list-item');
    if (!(row instanceof HTMLElement)) {
      throw new Error('未找到数据集行');
    }

    await user.click(within(row).getByRole('button', { name: '查看' }));
    await user.click(screen.getByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog', { name: '删除数据集' });
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('数据集正在被任务使用');
    expect(screen.getByRole('dialog', { name: '删除数据集' })).toBeInTheDocument();
  });

  it('renders the expanded soft copyright workbench routes', async () => {
    localStorage.setItem('soft_web_access_token', 'access-token');
    mockAuthApi();
    const routes = [
      ['/workbench/data-quality', '数据质量检查'],
      ['/workbench/dataset-versions', '数据版本记录'],
      ['/workbench/kernel-config', '核函数配置'],
      ['/workbench/evaluation', '性能评估'],
      ['/workbench/visualization', '可视化展示'],
      ['/workbench/reports', '分析报告'],
      ['/workbench/logs', '运行日志'],
    ] as const;

    for (const [path, label] of routes) {
      const view = renderApp(path);

      expect(await screen.findByRole('heading', { name: label, level: 1 })).toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
      const mainContent = document.getElementById('main-content');
      expect(mainContent).toHaveClass('dashboard-content');
      if (path === '/workbench/logs') expect(mainContent).toHaveClass('is-log-layout');
      else expect(mainContent).not.toHaveClass('is-log-layout');

      view.unmount();
    }
  });
});
