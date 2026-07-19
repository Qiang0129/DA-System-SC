import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTasks } from '../../api/tasks';
import { TaskCenterPage } from './TaskCenterPage';

const stats = {
  total: 1,
  draft: 0,
  queued: 0,
  running: 1,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  todayCompleted: 0,
  averageRuntimeSeconds: 12,
  failureRate: 0,
};

const task = {
  id: 7,
  name: 'Ionosphere OMELET-SV Task',
  mode: 'OMELET-SV',
  status: 'running',
  progress: 42,
  currentRun: 4,
  totalRuns: 10,
  currentIter: 4,
  maxIter: 10,
  currentStage: 'multi_kernel',
  datasetId: 3,
  datasetName: 'Ionosphere',
  params: { nBase: 20, sigma: 1, lambda: 5, gamma: 5, anchor: 10, runs: 10, maxIter: 10 },
  errorMessage: null,
  failureReason: null,
  metricsSummary: null,
  runtimeSeconds: 8.5,
  createdAt: '2026-07-13 10:00:00',
  startedAt: '2026-07-13 10:01:00',
  finishedAt: null,
  updatedAt: '2026-07-13 10:01:30',
};

vi.mock('../../api/tasks', () => ({
  fetchTaskStats: vi.fn(async () => stats),
  fetchTasks: vi.fn(async () => ({
    items: [task],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  })),
  fetchDatasetOptions: vi.fn(async () => [
    {
      id: 3,
      name: 'Ionosphere',
      baseCount: 100,
      sampleCount: 351,
      qualityStatus: 'ready',
      qualityIssues: [],
    },
  ]),
  fetchTaskTemplates: vi.fn(async () => ({ items: [] })),
  fetchTaskDetail: vi.fn(async () => task),
  fetchTaskLogs: vi.fn(async () => ({ items: [], total: 0 })),
  createTask: vi.fn(),
  createTaskTemplate: vi.fn(),
  startTask: vi.fn(),
  cancelTask: vi.fn(),
  retryTask: vi.fn(),
  cloneTask: vi.fn(),
  deleteTask: vi.fn(),
  deleteTaskTemplate: vi.fn(),
  bulkTasks: vi.fn(),
}));

describe('TaskCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stats and task rows from API data', async () => {
    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ionosphere OMELET-SV Task').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('heading', { name: '任务列表' })).toBeInTheDocument();
    expect(screen.getAllByText('OMELET-SV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ionosphere').length).toBeGreaterThan(0);
    expect(screen.getByText(/第 4\/10 轮 · 迭代 4\/10/)).toBeInTheDocument();
    expect(screen.getByLabelText('任务筛选与操作')).toBeInTheDocument();
    expect(screen.getByLabelText('任务统计')).toBeInTheDocument();
  });

  it('guides a first-time user through creating their first analysis task', async () => {
    vi.mocked(fetchTasks).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });

    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '从第一个分析任务开始' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '新建分析任务' })).toBeInTheDocument();
    expect(screen.getByText('选择数据集并确认质量状态')).toBeInTheDocument();
  });

  it('adds a task to the comparison tray from the task table', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ionosphere OMELET-SV Task').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: '将任务 7 加入比较' }));

    expect(screen.getByLabelText('任务对比栏')).toBeInTheDocument();
    expect(screen.getByText('已选 1 / 3 个任务')).toBeInTheDocument();
  });

  it('keeps a local research note and priority in task details', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '详情', exact: true })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '详情', exact: true }));
    await user.click(screen.getByRole('tab', { name: '研究备注' }));
    await user.click(screen.getByRole('combobox', { name: '本地优先级' }));
    await user.click(screen.getByRole('option', { name: '高优先级' }));
    await user.type(screen.getByLabelText('研究备注内容'), '优先复核本轮收敛情况');

    expect(screen.getByText('本地管理信息')).toBeInTheDocument();
    expect(screen.getByDisplayValue('优先复核本轮收敛情况')).toBeInTheDocument();
  });

  it('opens a guided task creation flow from the task center', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '新建任务', exact: true }));

    expect(screen.getByRole('heading', { name: '新建分析任务' })).toBeInTheDocument();
    expect(screen.getByText('1 选择数据')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步' })).toBeInTheDocument();
  });

  it('exposes a date range and a reset action in task filters', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '高级筛选' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '高级筛选' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('创建开始日期')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '高级筛选' }));

    const dateRange = screen.getByRole('group', { name: '创建日期范围' });
    expect(within(dateRange).getByLabelText('创建开始日期')).toBeEnabled();
    expect(within(dateRange).getByLabelText('创建结束日期')).toBeEnabled();
    expect(screen.getByRole('button', { name: '高级筛选' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens advanced filters when the URL already contains a date range', async () => {
    render(
      <MemoryRouter initialEntries={['/workbench/tasks?createdFrom=2026-07-01&createdTo=2026-07-18']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /高级筛选/ })).toHaveAttribute('aria-expanded', 'true');
    });
    expect(screen.getByLabelText('创建开始日期')).toHaveValue('2026-07-01');
    expect(screen.getByText('2026-07-01 至 2026-07-18')).toBeInTheDocument();
  });

  it('clears the keyword from the search control and switches table density', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workbench/tasks?q=Ionosphere']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '清空关键词' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: '清空关键词' }));
    expect(screen.getByPlaceholderText('搜索任务名称、数据集或模式')).toHaveValue('');

    const density = screen.getByRole('group', { name: '列表密度' });
    expect(within(density).getByRole('button', { name: '舒适' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(density).getByRole('button', { name: '紧凑' }));
    expect(within(density).getByRole('button', { name: '紧凑' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('exposes a busy refresh state while tasks are loading', async () => {
    render(
      <MemoryRouter initialEntries={['/workbench/tasks']}>
        <TaskCenterPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '更新中' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '更新中' })).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled();
    });
  });
});
