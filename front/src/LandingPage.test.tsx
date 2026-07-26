import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders the document-based workflow content in the screenshot area', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const capabilityGrid = container.querySelector<HTMLElement>('.capability-grid');

    expect(capabilityGrid).not.toBeNull();

    for (const title of ['数据管理', '协关联矩阵分析', '多核相似性学习', '性能评估', '可视化展示', '结果导出']) {
      expect(within(capabilityGrid!).getByRole('heading', { name: title })).toBeInTheDocument();
    }

    expect(screen.getByRole('heading', { name: '拓扑感知多核集成聚类分析系统' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '从算法到服务的落地闭环' })).not.toBeInTheDocument();
  });

  it('uses decorative glowing dot markers instead of SVG icons in the workflow cards', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const markers = container.querySelectorAll('.capability-card .capability-icon');

    expect(markers).toHaveLength(6);
    for (const marker of markers) {
      expect(marker.querySelector('svg')).not.toBeInTheDocument();
    }
  });

  it('renders the static five-stage analysis execution timeline in order', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const timelineSection = screen.getByRole('region', { name: '分析执行脉络' });
    const timeline = within(timelineSection).getByRole('list', { name: '五阶段分析执行流程' });
    const stages = within(timeline).getAllByRole('listitem');

    expect(stages).toHaveLength(5);
    expect(stages.map((stage) => stage.textContent)).toEqual([
      expect.stringContaining('选择基础聚类结果'),
      expect.stringContaining('GBE 编码与 CA 构建'),
      expect.stringContaining('多核相似性学习'),
      expect.stringContaining('谱聚类与指标评估'),
      expect.stringContaining('结果落盘'),
    ]);
    expect(stages.map((stage) => stage.className)).toEqual([
      expect.stringContaining('is-upper'),
      expect.stringContaining('is-lower'),
      expect.stringContaining('is-upper'),
      expect.stringContaining('is-lower'),
      expect.stringContaining('is-upper'),
    ]);
    expect(stages.map((stage) => stage.getAttribute('style'))).toEqual([
      '--workflow-stage-x: 9%; --workflow-node-y: 90px;',
      '--workflow-stage-x: 29.5%; --workflow-node-y: 244px;',
      '--workflow-stage-x: 50%; --workflow-node-y: 90px;',
      '--workflow-stage-x: 70.5%; --workflow-node-y: 244px;',
      '--workflow-stage-x: 91%; --workflow-node-y: 90px;',
    ]);
    expect(within(timeline).queryByRole('button')).not.toBeInTheDocument();
    expect(within(timeline).queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a decorative S-shaped connector behind the five workflow stages', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const route = container.querySelector<SVGSVGElement>('.workflow-route[aria-hidden="true"]');
    const routePath = route?.querySelector<SVGPathElement>('.workflow-route-path');

    expect(route).not.toBeNull();
    expect(route).toHaveAttribute('focusable', 'false');
    expect(routePath).not.toBeNull();
    expect(routePath).toHaveAttribute('d', expect.stringContaining('C'));
    expect(routePath).toHaveAttribute('d', expect.stringContaining('S'));
  });

  it('keeps each capability label inside the matching icon item', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    for (const label of ['OMELET', 'CA Matrix', 'OMELET-SV', 'Python', 'FastAPI', 'NumPy', 'SciPy', 'ECharts']) {
      expect(screen.getByText(label).closest('.capability-mark')).not.toBeNull();
    }

    expect(container.querySelector('.stack-cloud')).not.toBeInTheDocument();
  });

  it('uses local SVG assets for every capability mark', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const expectedAssets = [
      ['OMELET', 'capability-omelet.svg'],
      ['CA Matrix', 'capability-ca-matrix.svg'],
      ['OMELET-SV', 'capability-omelet-sv.svg'],
      ['Python', 'capability-python.svg'],
      ['FastAPI', 'capability-fastapi.svg'],
      ['NumPy', 'capability-numpy.svg'],
      ['SciPy', 'capability-scipy.svg'],
      ['ECharts', 'capability-echarts.svg'],
    ] as const;

    for (const [label, asset] of expectedAssets) {
      const mark = screen.getByText(label).closest('.capability-mark');
      const image = mark?.querySelector<HTMLImageElement>('img.capability-mark-icon');

      expect(mark).not.toBeNull();
      expect(mark?.querySelector('svg')).not.toBeInTheDocument();
      expect(image).not.toBeNull();
      expect(decodeURI(image?.getAttribute('src') ?? '')).toContain(asset);
    }
  });

  it('shows a non-interactive version badge in the topbar', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    expect(screen.getByLabelText('当前版本 v1.0.0')).toHaveTextContent('v1.0.0');
    expect(screen.queryByText('新材料聚类分析')).not.toBeInTheDocument();
    expect(container.querySelector('.landing-topbar button')).not.toBeInTheDocument();
  });

  it('uses the local logo image in the topbar brand mark', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const brandLogo = container.querySelector('.landing-brand .brand-logo');
    const logoImage = brandLogo?.querySelector<HTMLImageElement>('img.brand-logo-image');

    expect(brandLogo?.querySelector('svg')).not.toBeInTheDocument();
    expect(logoImage).not.toBeNull();
    expect(decodeURI(logoImage?.getAttribute('src') ?? '')).toContain('Logo.svg');
  });

  it('shows and copies the complete frontend access URL for the active endpoint', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      const { container } = render(
        <LandingPage
          onLogin={() => undefined}
          onRegister={() => undefined}
          onEnterWorkbench={() => undefined}
        />,
      );
      const address = container.querySelector('.base-url-address');
      const endpoint = container.querySelector('.base-url-endpoint');
      const copyButton = screen.getByRole('button', { name: '复制地址' });
      const loginUrl = `${window.location.origin}/login`;

      expect(address).toHaveTextContent(window.location.origin);
      expect(address).toHaveAttribute('title', window.location.origin);
      expect(endpoint).toHaveTextContent('/login');
      expect(endpoint).toHaveAttribute('title', '/login');
      expect(`${address?.textContent}${endpoint?.textContent}`).toBe(loginUrl);
      expect(address).not.toHaveTextContent('127.0.0.1:8000');
      expect(screen.queryByText('/api/auth/login')).not.toBeInTheDocument();
      expect(screen.queryByText('/api/auth/register')).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(copyButton);
      });
      expect(writeText).toHaveBeenCalledWith(loginUrl);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      const registerUrl = `${window.location.origin}/register`;
      const registerEndpoint = container.querySelector('.base-url-endpoint');
      expect(registerEndpoint).toHaveTextContent('/register');
      expect(`${address?.textContent}${registerEndpoint?.textContent}`).toBe(registerUrl);

      await act(async () => {
        fireEvent.click(copyButton);
      });
      expect(writeText).toHaveBeenLastCalledWith(registerUrl);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the local copy SVG asset in the base URL row', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const copyButton = screen.getByRole('button', { name: '复制地址' });
    const icon = copyButton.querySelector<HTMLImageElement>('img.base-url-copy-icon');

    expect(icon).not.toBeNull();
    expect(decodeURI(icon?.getAttribute('src') ?? '')).toContain('复制.svg');
  });

  it('uses the local workbench SVG in the analysis workbench action', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    const button = screen.getByRole('button', { name: '前往分析工作台' });
    const icon = button.querySelector<HTMLImageElement>('img.landing-link-button-icon');

    expect(icon).not.toBeNull();
    expect(decodeURI(icon?.getAttribute('src') ?? '')).toContain('工作台.svg');
    expect(button.querySelector('svg')).not.toBeInTheDocument();
  });

  it('disables the workbench button while the login state is being verified', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
        isEnteringWorkbench
      />,
    );

    const button = screen.getByRole('button', { name: '正在验证登录状态' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
