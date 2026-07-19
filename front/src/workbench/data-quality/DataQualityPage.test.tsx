import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDatasetCatalog,
  recheckDatasetQuality,
  type DatasetCatalogItem,
} from '../../api/datasets';
import { DataQualityPage } from './DataQualityPage';

vi.mock('../../api/datasets', () => ({
  fetchDatasetCatalog: vi.fn(),
  recheckDatasetQuality: vi.fn(),
}));

function createDataset(overrides: Partial<DatasetCatalogItem>): DatasetCatalogItem {
  return {
    id: 1,
    name: 'Ionosphere',
    createdAt: '2026-07-14 09:00:00',
    fileSizeBytes: 1024,
    sampleCount: 351,
    baseCount: 100,
    classCount: 2,
    hasLabels: true,
    dataType: '数值',
    taskCount: 1,
    lastAnalysisAt: null,
    version: 2,
    qualityStatus: 'ready',
    qualityIssues: [],
    matrixShape: 'E: 351 x 100',
    labelShape: 'y: 351',
    ...overrides,
  };
}

const readyDataset = createDataset({
  id: 1,
  name: 'Ready Material',
});

const warningDataset = createDataset({
  id: 2,
  name: 'Warning Material',
  hasLabels: false,
  classCount: 0,
  qualityStatus: 'warning',
  qualityIssues: ['未提供真实标签'],
  labelShape: '',
});

const errorDataset = createDataset({
  id: 3,
  name: 'Blocked Material',
  sampleCount: 0,
  baseCount: 0,
  qualityStatus: 'error',
  qualityIssues: ['未检测到有效的基础聚类矩阵'],
  matrixShape: '',
});

function renderPage(initialEntry = '/workbench/data-quality') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DataQualityPage />
    </MemoryRouter>,
  );
}

describe('DataQualityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDatasetCatalog).mockResolvedValue({
      items: [readyDataset, warningDataset, errorDataset],
      total: 3,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    vi.mocked(recheckDatasetQuality).mockImplementation(async (datasetId) => {
      const source = [readyDataset, warningDataset, errorDataset].find(
        (dataset) => dataset.id === datasetId,
      );
      if (!source) throw new Error('数据集不存在');
      return { ...source, qualityStatus: 'ready', qualityIssues: [] };
    });
  });

  it('prioritizes the blocking dataset and exposes the real rule result', async () => {
    renderPage();

    const inspector = await screen.findByRole('region', { name: '质量检查详情' });
    expect(within(inspector).getByRole('heading', { name: 'Blocked Material' })).toBeInTheDocument();
    expect(within(inspector).getByText('未检测到有效矩阵')).toBeInTheDocument();
    expect(within(inspector).getByText('质量检查结论')).toBeInTheDocument();
    expect(within(inspector).getByText('需要处理')).toBeInTheDocument();
    expect(within(inspector).getByText('存在质量问题')).toBeInTheDocument();
    expect(within(inspector).queryByRole('button', { name: '创建分析任务' })).not.toBeInTheDocument();
  });

  it('filters the queue without using the task-center table pattern', async () => {
    const user = userEvent.setup();
    renderPage();

    const queue = await screen.findByRole('complementary', { name: '数据集质量队列' });
    const filters = queue.querySelector('.quality-filters');
    if (!(filters instanceof HTMLElement)) throw new Error('未找到质量状态筛选');
    await user.click(within(filters).getByRole('button', { name: /待确认/ }));

    await waitFor(() => {
      expect(within(queue).getByRole('button', { name: /Warning Material/ })).toBeInTheDocument();
    });
    await user.click(within(queue).getByRole('button', { name: /Warning Material/ }));

    const inspector = screen.getByRole('region', { name: '质量检查详情' });
    expect(within(inspector).getByText('存在待确认项')).toBeInTheDocument();
    expect(within(inspector).getByText('建议确认')).toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: /Ready Material/ })).not.toBeInTheDocument();
    expect(within(queue).queryByRole('button', { name: /Blocked Material/ })).not.toBeInTheDocument();
  });

  it('rechecks the selected dataset and refreshes its readiness state', async () => {
    const user = userEvent.setup();
    renderPage();

    const inspector = await screen.findByRole('region', { name: '质量检查详情' });
    await user.click(within(inspector).getByRole('button', { name: '复检当前' }));

    await waitFor(() => expect(recheckDatasetQuality).toHaveBeenCalledWith(3));
    expect(await screen.findByText('已完成 1 个数据集的质量复检。')).toBeInTheDocument();
    expect(within(inspector).getByText('未发现质量问题')).toBeInTheDocument();
    expect(within(inspector).getByText('质量检查通过')).toBeInTheDocument();
    expect(within(inspector).getAllByText('数据结构完整，当前未发现阻塞质量问题。').length).toBeGreaterThan(0);
    expect(within(inspector).queryByRole('button', { name: '创建分析任务' })).not.toBeInTheDocument();
  });

  it('shows ready dataset quality summary without task creation entry', async () => {
    const user = userEvent.setup();
    renderPage();

    const queue = await screen.findByRole('complementary', { name: '数据集质量队列' });
    await user.click(within(queue).getByRole('button', { name: /Ready Material/ }));

    const inspector = screen.getByRole('region', { name: '质量检查详情' });
    expect(within(inspector).getByText('质量检查通过')).toBeInTheDocument();
    expect(within(inspector).getAllByText('检查通过').length).toBeGreaterThan(0);
    expect(within(inspector).queryByRole('button', { name: '创建分析任务' })).not.toBeInTheDocument();
  });
});
