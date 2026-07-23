import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from './resultPresentation';
import { buildTaskLogsCsv, TaskLogsPage } from './TaskLogsPage';
import { TaskResultViews } from './TaskResultViews';
import type { TaskResultResource } from './types';

vi.mock('./resultPresentation', async () => {
  const actual = await vi.importActual<typeof import('./resultPresentation')>('./resultPresentation');
  return { ...actual, downloadTextFile: vi.fn() };
});

const logs = [
  { id: 5, level: 'error', action: 'task_failed', message: '参数 "gamma", 超出范围', createdAt: '2026-07-16 20:46:35' },
  { id: 3, level: 'warning', action: 'data_warning', message: '输入数据包含需要复核的记录', createdAt: '2026-07-16 20:46:32' },
  { id: 1, level: 'info', action: 'task_queued', message: '任务已进入执行队列', createdAt: '2026-07-16 20:46:30' },
  { id: 4, level: 'info', action: 'task_run_completed', message: '第 2 轮实验完成', createdAt: '2026-07-16 20:46:34' },
  { id: 2, level: 'info', action: 'task_run_completed', message: '第 1 轮实验完成', createdAt: '2026-07-16 20:46:31' },
];

function createResource(overrides: Partial<TaskResultResource> = {}): TaskResultResource {
  return {
    loading: false,
    error: null,
    envelope: {
      state: 'ready',
      task: {
        id: 5,
        name: '日志验证任务',
        mode: 'OMELET-SV',
        status: 'succeeded',
        progress: 100,
        currentRun: 3,
        totalRuns: 3,
        currentIter: 10,
        maxIter: 10,
        currentStage: 'persist',
        datasetId: 2,
        datasetName: '材料数据集',
        params: { runs: 3 },
        runtimeSeconds: 5,
        createdAt: '2026-07-16 20:46:20',
        startedAt: '2026-07-16 20:46:29',
        finishedAt: '2026-07-16 20:46:35',
        updatedAt: '2026-07-16 20:46:35',
      },
      result: null,
    },
    taskId: 5,
    refresh: vi.fn(),
    selectTask: vi.fn(),
    logs,
    logsLoading: false,
    logsError: null,
    refreshLogs: vi.fn(),
    ...overrides,
  };
}

function renderLogs(resource: TaskResultResource) {
  return render(
    <MemoryRouter initialEntries={['/workbench/logs?taskId=5']}>
      <TaskLogsPage resource={resource} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('TaskLogsPage', () => {
  it('显示日志统计，并默认按执行顺序排列轮次', () => {
    renderLogs(createResource());

    const scrollRegion = screen.getByRole('region', { name: '可滚动的任务执行日志' });
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toHaveClass('task-log-list-region');

    const totalMetric = screen.getByText('全部事件').closest('article');
    const infoMetric = screen.getByText('信息', { selector: '.workbench-metric-label span' }).closest('article');
    const warningMetric = screen.getByText('提醒', { selector: '.workbench-metric-label span' }).closest('article');
    const errorMetric = screen.getByText('异常', { selector: '.workbench-metric-label span' }).closest('article');
    expect(totalMetric && within(totalMetric).getByText('5')).toBeInTheDocument();
    expect(infoMetric && within(infoMetric).getByText('3')).toBeInTheDocument();
    expect(warningMetric && within(warningMetric).getByText('1')).toBeInTheDocument();
    expect(errorMetric && within(errorMetric).getByText('1')).toBeInTheDocument();

    const events = screen.getAllByRole('listitem');
    expect(events[0]).toHaveTextContent('进入执行队列');
    expect(events[1]).toHaveTextContent('第 1 轮实验完成');
    expect(events[3]).toHaveTextContent('第 2 轮实验完成');
    expect(events[4]).toHaveTextContent('分析任务失败');
  });

  it('支持级别筛选、搜索、清除搜索和重置无匹配筛选', async () => {
    const user = userEvent.setup();
    renderLogs(createResource());

    await user.click(screen.getByRole('button', { name: /提醒 1/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('输入数据包含需要复核的记录')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /全部 5/ }));
    const search = screen.getByRole('textbox', { name: '搜索任务日志' });
    await user.type(search, '第 2 轮');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('第 2 轮实验完成')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清除日志搜索' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    await user.type(search, '不存在的事件');
    expect(screen.getByText('没有匹配的日志')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('可切换最新优先，并导出当前顺序下经过完整转义的 CSV', async () => {
    const user = userEvent.setup();
    renderLogs(createResource());

    const scrollRegion = screen.getByRole('region', { name: '可滚动的任务执行日志' });
    scrollRegion.scrollTop = 120;
    await user.click(screen.getByRole('button', { name: /最新优先/ }));
    expect(scrollRegion.scrollTop).toBe(0);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('分析任务失败');

    await user.click(screen.getByRole('button', { name: '导出日志' }));
    expect(downloadTextFile).toHaveBeenCalledOnce();
    const [filename, content, mime] = vi.mocked(downloadTextFile).mock.calls[0];
    expect(filename).toBe('task-5-logs.csv');
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(content).toContain('"参数 ""gamma"", 超出范围"');
    expect(content.indexOf('task_failed')).toBeLessThan(content.indexOf('task_queued'));
  });

  it('日志失败时保留重试入口，失败任务也能直接打开日志页', async () => {
    const user = userEvent.setup();
    const refreshLogs = vi.fn();
    const failedResource = createResource({
      logs: [],
      logsError: '日志服务暂时不可用',
      refreshLogs,
      envelope: {
        ...createResource().envelope!,
        state: 'failed',
        task: { ...createResource().envelope!.task!, status: 'failed' },
      },
    });

    const view = renderLogs(failedResource);
    expect(screen.getByRole('alert')).toHaveTextContent('日志服务暂时不可用');
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refreshLogs).toHaveBeenCalledOnce();

    view.unmount();
    render(
      <MemoryRouter initialEntries={['/workbench/logs?taskId=5']}>
        <TaskResultViews section="logs" resource={{ ...failedResource, loading: true }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: '运行日志', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('失败')).toHaveLength(2);
  });

  it('CSV 构建器始终添加 UTF-8 BOM 并转义每一个字段', () => {
    const content = buildTaskLogsCsv(logs);
    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain('"级别","事件","内容","时间"');
  });
});
