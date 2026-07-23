import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDatasetCatalog,
  fetchDatasetVersions,
  type DatasetCatalogItem,
  type DatasetRevision,
} from '../../api/datasets';
import { DatasetVersionsPage } from './DatasetVersionsPage';

vi.mock('../../api/datasets', () => ({
  fetchDatasetCatalog: vi.fn(),
  fetchDatasetVersions: vi.fn(),
}));

const dataset: DatasetCatalogItem = {
  id: 11,
  name: 'Material Revision Set',
  createdAt: '2026-07-14 09:00:00',
  fileSizeBytes: 4096,
  sampleCount: 360,
  baseCount: 120,
  classCount: 3,
  hasLabels: true,
  dataType: '数值',
  taskCount: 2,
  lastAnalysisAt: null,
  version: 3,
  qualityStatus: 'warning',
  qualityIssues: ['标签数量与样本数量不一致'],
  matrixShape: 'E: 360 x 120',
  labelShape: 'y: 351',
};

const revisions: DatasetRevision[] = [
  {
    id: 103,
    version: 3,
    action: 'appended',
    name: 'Material Revision Set',
    originalFilename: 'material-v3.mat',
    createdAt: '2026-07-14 10:30:00',
    sampleCount: 360,
    baseCount: 120,
    classCount: 3,
    hasLabels: true,
    qualityStatus: 'warning',
    qualityIssues: ['标签数量与样本数量不一致'],
  },
  {
    id: 102,
    version: 2,
    action: 'renamed',
    name: 'Material Set',
    originalFilename: 'material-v2.mat',
    createdAt: '2026-07-14 10:00:00',
    sampleCount: 351,
    baseCount: 100,
    classCount: 2,
    hasLabels: true,
    qualityStatus: 'ready',
    qualityIssues: [],
  },
  {
    id: 101,
    version: 1,
    action: 'uploaded',
    name: 'Material Upload',
    originalFilename: 'material-v2.mat',
    createdAt: '2026-07-14 09:00:00',
    sampleCount: 351,
    baseCount: 100,
    classCount: 2,
    hasLabels: true,
    qualityStatus: 'ready',
    qualityIssues: [],
  },
];

function renderPage(initialEntry = '/workbench/dataset-versions') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DatasetVersionsPage />
    </MemoryRouter>,
  );
}

describe('DatasetVersionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDatasetCatalog).mockResolvedValue({
      items: [dataset],
      total: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    vi.mocked(fetchDatasetVersions).mockResolvedValue(revisions);
  });

  it('compares the latest revision with its previous version by default', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'v3 · 追加数据' });
    const inspector = screen.getByRole('region', { name: '版本差异详情' });
    expect(within(inspector).getByText(/与 v2 相比，/)).toBeInTheDocument();
    expect(within(inspector).getByRole('combobox', { name: '选择比较基准' })).toHaveTextContent('v2 · 重命名');
    expect(document.querySelectorAll('.versions-diff-row.changed').length).toBeGreaterThan(0);
  });

  it('restores the selected revision and comparison baseline from the query', async () => {
    renderPage('/workbench/dataset-versions?datasetId=11&version=2&compare=1');

    const inspector = await screen.findByRole('region', { name: '版本差异详情' });
    expect(within(inspector).getByRole('heading', { name: 'v2 · 重命名' })).toBeInTheDocument();
    expect(within(inspector).getByText(/与 v1 相比，/)).toBeInTheDocument();

    const rail = screen.getByRole('complementary', { name: '版本轨道' });
    expect(rail.querySelector('[aria-current="true"]')).toHaveTextContent('v2 · 重命名');
  });

  it('switches to snapshot mode when the first revision has no previous baseline', async () => {
    const user = userEvent.setup();
    renderPage();

    const rail = await screen.findByRole('complementary', { name: '版本轨道' });
    const firstRevision = await within(rail).findByRole('button', { name: /v1 · 初始上传/ });
    await user.click(firstRevision);

    const inspector = screen.getByRole('region', { name: '版本差异详情' });
    await waitFor(() => {
      expect(within(inspector).getByRole('heading', { name: 'v1 · 初始上传' })).toBeInTheDocument();
    });
    expect(within(inspector).getByText('当前以版本快照方式查看')).toBeInTheDocument();
    expect(within(inspector).getByRole('combobox', { name: '选择比较基准' })).toHaveTextContent('不比较（查看快照）');
  });

  it('shows a useful empty state when no datasets are available', async () => {
    vi.mocked(fetchDatasetCatalog).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: '暂无可追踪的数据集' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往数据管理' })).toBeInTheDocument();
    expect(fetchDatasetVersions).not.toHaveBeenCalled();
  });
});
