import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders the document-based workflow content in the screenshot area', () => {
    render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    for (const title of ['数据管理', '协关联矩阵分析', '多核相似性学习', '性能评估', '可视化展示', '结果导出']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
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

  it('shows a non-interactive glass version pill in the topbar', () => {
    const { container } = render(
      <LandingPage
        onLogin={() => undefined}
        onRegister={() => undefined}
        onEnterWorkbench={() => undefined}
      />,
    );

    expect(screen.getByLabelText('当前版本 v1.0.0')).toHaveTextContent('v1.0.0');
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

  it('shows login and register auth suffixes in the base URL row', () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    try {
      render(
        <LandingPage
          onLogin={() => undefined}
          onRegister={() => undefined}
          onEnterWorkbench={() => undefined}
        />,
      );

      expect(screen.getByText('/api/auth/login')).toBeInTheDocument();
      expect(screen.queryByText('/api/datasets/import')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText('/api/auth/register')).toBeInTheDocument();
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
});
