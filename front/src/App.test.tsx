import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const originalFetch = globalThis.fetch;

const authBody = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  user: { id: 1, username: 'alice', role: 'user', status: 'active' },
};

function mockAuthApi() {
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input);

    if (url.endsWith('/api/auth/login') || url.endsWith('/api/auth/register')) {
      return {
        ok: true,
        json: async () => authBody,
      } as Response;
    }

    if (url.endsWith('/api/auth/me')) {
      return {
        ok: true,
        json: async () => authBody.user,
      } as Response;
    }

    if (url.endsWith('/api/auth/logout')) {
      return {
        ok: true,
        json: async () => ({ message: '已退出登录' }),
      } as Response;
    }

    return {
      ok: false,
      json: async () => ({ detail: 'unexpected request' }),
    } as Response;
  });
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

function expectGlobalStatusHeaderHidden() {
  expect(screen.queryByLabelText('系统连接状态')).not.toBeInTheDocument();
}

async function signInFromLanding() {
  mockAuthApi();
  await userEvent.click(screen.getByRole('button', { name: '登录' }));
  const loginCard = getAuthCard('登录');

  await userEvent.type(loginCard.getByLabelText('用户名'), 'alice');
  await userEvent.type(loginCard.getByLabelText('密码'), 'secret123');
  await userEvent.click(loginCard.getByRole('button', { name: '登录' }));
  await screen.findByRole('region', { name: '分析概览' });
}

describe('dashboard homepage', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('renders the CPA-style scientific dashboard shell', async () => {
    const { container } = renderApp();
    await signInFromLanding();

    expect(screen.getByRole('region', { name: '分析概览' })).toBeInTheDocument();
    const sidebarLogo = container.querySelector('.sidebar-brand .brand-logo');
    const logoImage = sidebarLogo?.querySelector<HTMLImageElement>('img.sidebar-brand-logo-image');

    expect(sidebarLogo?.querySelector('svg')).not.toBeInTheDocument();
    expect(logoImage).not.toBeNull();
    expect(decodeURI(logoImage?.getAttribute('src') ?? '')).toContain('Logo.svg');

    const mainNav = screen.getByRole('navigation', { name: '主导航' });
    expect(mainNav).toBeInTheDocument();
    expect(
      within(mainNav)
        .getAllByRole('link')
        .map((link) => link.textContent?.trim()),
    ).toEqual([
      '分析工作台',
      '数据管理',
      '任务中心',
      'CA 协关联矩阵',
      '多核相似性学习',
      '结果分析',
      '结果导出',
    ]);
    expect(within(mainNav).queryByRole('button', { name: '首页' })).not.toBeInTheDocument();
    expect(within(mainNav).queryByRole('link', { name: '性能评估' })).not.toBeInTheDocument();
    expect(within(mainNav).queryByRole('link', { name: '可视化展示' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('系统连接状态')).toHaveTextContent('等待 FastAPI 接入');
    expect(screen.getByRole('button', { name: '导入数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建任务' })).toBeInTheDocument();
    expect(screen.getAllByText('OMELET-SV').length).toBeGreaterThan(0);
    expect(screen.getByText('351')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Ionosphere 示例数据')).toBeInTheDocument();
  });

  it('shows metrics, chart panels, pipeline and export shortcuts', async () => {
    renderApp();
    await signInFromLanding();

    expect(screen.getByText('ACC')).toBeInTheDocument();
    expect(screen.getByText('NMI')).toBeInTheDocument();
    expect(screen.getByText('ARI')).toBeInTheDocument();
    expect(screen.getByText('F1 分数')).toBeInTheDocument();
    expect(screen.getByText('91.2 ± 1.8%')).toBeInTheDocument();
    expect(screen.queryByText(/较 KMeans/)).not.toBeInTheDocument();

    const topInsightGrid = screen.getByLabelText('核心图表与导出');
    expect(within(topInsightGrid).getByLabelText('CA 协关联矩阵')).toBeInTheDocument();
    expect(within(topInsightGrid).getByLabelText('核权重分布图')).toBeInTheDocument();
    expect(within(topInsightGrid).getByRole('heading', { name: '结果导出' })).toBeInTheDocument();

    expect(screen.getByText('CA = M @ M.T / n_base')).toBeInTheDocument();
    expect(screen.getByLabelText('CA 矩阵取值图例')).toHaveTextContent('高共聚');
    const caPanel = within(topInsightGrid).getByLabelText('CA 协关联矩阵');
    const caCells = caPanel.querySelectorAll('.ca-matrix-cell[aria-label]');
    expect(caCells.length).toBe(64);
    expect(caPanel.querySelector('.ca-matrix-cell[title]')).not.toBeInTheDocument();
    expect(caPanel.querySelector('.ca-cell-tilt')).not.toBeInTheDocument();
    expect(within(caPanel).getAllByText('CA = 0.82').length).toBeGreaterThan(0);
    expect(within(caPanel).getAllByText('高共聚').length).toBeGreaterThan(1);
    expect(within(caPanel).getByText('矩阵规模')).toBeInTheDocument();
    expect(within(caPanel).getByText('351 × 351')).toBeInTheDocument();
    expect(within(caPanel).getByText('高共聚样本对')).toBeInTheDocument();
    expect(within(caPanel).getByText('CA 均值')).toBeInTheDocument();
    expect(within(caPanel).getAllByText('S1 / S2').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: '核权重 alpha' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: '拓扑亲和矩阵 S' }));
    expect(within(topInsightGrid).getByLabelText('拓扑亲和矩阵图')).toBeInTheDocument();
    const secondaryCardGrid = screen.getByLabelText('第二行分析卡片');
    expect(within(secondaryCardGrid).getByLabelText('收敛曲线')).toBeInTheDocument();
    expect(within(secondaryCardGrid).getByLabelText('聚类散点图')).toBeInTheDocument();
    expect(within(secondaryCardGrid).getByLabelText('OMELET 分析流程')).toHaveTextContent(
      '更新 Z / S / alpha',
    );
    expect(
      within(secondaryCardGrid).getByRole('heading', { name: '任务参数' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成报告/ })).toBeInTheDocument();
  });

  it('activates sidebar sections without leaving the dashboard context', async () => {
    renderApp();
    await signInFromLanding();

    await userEvent.click(screen.getByRole('link', { name: 'CA 协关联矩阵' }));
    await waitFor(() => expect(window.location.pathname).toBe('/workbench/ca-matrix'));
    expectGlobalStatusHeaderHidden();

    expect(screen.getByRole('link', { name: 'CA 协关联矩阵' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const breadcrumb = screen.getByRole('navigation', { name: '当前位置' });
    expect(within(breadcrumb).getByText('CA 协关联矩阵')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'CA 协关联矩阵分析' })).toBeInTheDocument();
  });

  it('keeps the global status header scoped to the analysis dashboard route', () => {
    const { unmount } = renderApp('/workbench/analysis');

    expect(screen.getByLabelText('系统连接状态')).toBeInTheDocument();
    unmount();

    for (const route of [
      '/workbench/datasets',
      '/workbench/tasks',
      '/workbench/ca-matrix',
      '/workbench/mkl',
      '/workbench/results',
      '/workbench/export',
    ]) {
      const result = renderApp(route);
      expectGlobalStatusHeaderHidden();
      result.unmount();
    }
  });

  it('lands on the landing page and signs in through the login page', async () => {
    const { container } = renderApp();

    expect(screen.getByRole('heading', { name: /新材料\s+数据分析统一平台/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '首页导航' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '首页' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '分析工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '数据集' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关于' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '通知' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换主题' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '切换语言' })).not.toBeInTheDocument();
    expect(container.querySelector('.landing-topbar button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '技术路线' })).not.toBeInTheDocument();
    expect(screen.getByText('覆盖完整的分析链路')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '从数据管理到分析报告的完整流程' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '多核相似性学习' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '结果导出' })).toBeInTheDocument();
    const heroActions = screen.getByLabelText('首页账号操作');
    expect(within(heroActions).getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(within(heroActions).getByRole('button', { name: '注册' })).toBeInTheDocument();

    await userEvent.click(within(heroActions).getByRole('button', { name: '登录' }));
    const loginCard = getAuthCard('登录');
    expect(loginCard.getByRole('heading', { name: '登录' })).toBeInTheDocument();

    mockAuthApi();
    await userEvent.type(loginCard.getByLabelText('用户名'), 'alice');
    await userEvent.type(loginCard.getByLabelText('密码'), 'secret123');
    await userEvent.click(loginCard.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('region', { name: '分析概览' })).toBeInTheDocument();
  });

  it('registers through the register page', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: '注册' }));
    const registerCard = getAuthCard('注册');
    expect(registerCard.getByRole('heading', { name: '注册' })).toBeInTheDocument();

    mockAuthApi();
    await userEvent.type(registerCard.getByLabelText('用户名'), 'alice');
    await userEvent.type(registerCard.getByLabelText('密码'), 'secret123');
    await userEvent.type(registerCard.getByLabelText('确认密码'), 'secret123');
    await userEvent.click(registerCard.getByRole('button', { name: '注册' }));
    expect(await screen.findByRole('region', { name: '分析概览' })).toBeInTheDocument();
  });

  it('enters the dashboard directly from the landing hero', async () => {
    renderApp();

    const heroActions = screen.getByLabelText('首页账号操作');
    expect(within(heroActions).getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(within(heroActions).getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '进入工作台' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '技术路线' })).not.toBeInTheDocument();
  });

  it('updates the browser path when moving between landing, auth and workbench pages', async () => {
    renderApp();

    const heroActions = screen.getByLabelText('首页账号操作');
    await userEvent.click(within(heroActions).getByRole('button', { name: '登录' }));
    expect(window.location.pathname).toBe('/login');

    mockAuthApi();
    const loginCard = getAuthCard('登录');
    await userEvent.type(loginCard.getByLabelText('用户名'), 'alice');
    await userEvent.type(loginCard.getByLabelText('密码'), 'secret123');
    await userEvent.click(loginCard.getByRole('button', { name: '登录' }));
    await screen.findByRole('region', { name: '分析概览' });
    expect(window.location.pathname).toBe('/workbench/analysis');

    await userEvent.click(screen.getByRole('link', { name: 'CA 协关联矩阵' }));
    await waitFor(() => expect(window.location.pathname).toBe('/workbench/ca-matrix'));
  });

  it('routes the added task center and merged results pages from direct URLs', async () => {
    const { unmount } = renderApp('/workbench/tasks');

    expect(screen.getByRole('region', { name: '任务中心列表' })).toBeInTheDocument();
    expectGlobalStatusHeaderHidden();
    expect(screen.getByRole('link', { name: '任务中心' })).toHaveAttribute('aria-current', 'page');
    let breadcrumb = screen.getByRole('navigation', { name: '当前位置' });
    expect(within(breadcrumb).getByText('任务中心')).toBeInTheDocument();

    unmount();
    renderApp('/workbench/results');

    expect(screen.getByRole('region', { name: '结果分析内容' })).toBeInTheDocument();
    expectGlobalStatusHeaderHidden();
    expect(screen.getByRole('link', { name: '结果分析' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: '指标评估' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '图表展示' })).toBeInTheDocument();
    breadcrumb = screen.getByRole('navigation', { name: '当前位置' });
    expect(within(breadcrumb).getByText('结果分析')).toBeInTheDocument();
  });

  it('renders an interactive dataset management workflow prototype', async () => {
    renderApp('/workbench/datasets');

    expectGlobalStatusHeaderHidden();

    const importPanel = screen.getByLabelText('导入基础聚类结果');
    expect(importPanel).toHaveTextContent('CSV');
    expect(importPanel).toHaveTextContent('JSON');
    expect(importPanel).toHaveTextContent('Excel');
    expect(importPanel).toHaveTextContent('MAT');
    expect(importPanel).toHaveTextContent('NPZ');
    expect(within(importPanel).getByText('E: 351 x 100')).toBeInTheDocument();
    expect(within(importPanel).getByText('y: 351')).toBeInTheDocument();

    const statisticsPanel = screen.getByLabelText('查看基础聚类统计');
    expect(within(statisticsPanel).getByText('base_1')).toBeInTheDocument();
    expect(within(statisticsPanel).getAllByText('11').length).toBeGreaterThan(0);
    expect(within(statisticsPanel).getByText('标签分布')).toBeInTheDocument();

    const selectionPanel = screen.getByLabelText('基础聚类随机选择');
    await userEvent.clear(within(selectionPanel).getByLabelText('n_base'));
    await userEvent.type(within(selectionPanel).getByLabelText('n_base'), '12');
    await userEvent.click(within(selectionPanel).getByRole('button', { name: '随机选择' }));
    expect(within(selectionPanel).getByText('12 / 100')).toBeInTheDocument();
    expect(within(selectionPanel).getAllByText(/^base_/).length).toBe(12);
  });

  it('redirects legacy evaluation and visualization routes into results analysis', async () => {
    const { unmount } = renderApp('/workbench/evaluation');

    await waitFor(() => expect(window.location.pathname).toBe('/workbench/results'));
    expect(screen.getByRole('region', { name: '结果分析内容' })).toBeInTheDocument();

    unmount();
    renderApp('/workbench/visualization');

    await waitFor(() => expect(window.location.pathname).toBe('/workbench/results'));
    expect(screen.getByRole('region', { name: '结果分析内容' })).toBeInTheDocument();
  });
});
