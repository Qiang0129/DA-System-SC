import { useEffect, useId, useMemo, useState } from 'react';
import {
  CalendarRange,
  ChevronDown,
  Download,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { SelectField } from '../../../components/SelectField';
import type { DatasetOption, TaskMode } from '../types';

type Props = {
  keyword: string;
  status: string;
  mode: string;
  datasetId: string;
  createdFrom: string;
  createdTo: string;
  datasets: DatasetOption[];
  total: number;
  loading: boolean;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onModeChange: (value: string) => void;
  onDatasetChange: (value: string) => void;
  onCreatedFromChange: (value: string) => void;
  onCreatedToChange: (value: string) => void;
  onClearDates: () => void;
  onRefresh: () => void;
  onReset: () => void;
  onCreate: () => void;
  onExport: () => void;
};

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '运行中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
  { value: 'running,failed', label: '运行中 + 失败' },
];

const MODE_OPTIONS: Array<{ value: '' | TaskMode; label: string }> = [
  { value: '', label: '全部模式' },
  { value: 'OMELET', label: 'OMELET' },
  { value: 'OMELET-SV', label: 'OMELET-SV' },
];

export function TaskFiltersBar({
  keyword,
  status,
  mode,
  datasetId,
  createdFrom,
  createdTo,
  datasets,
  total,
  loading,
  onKeywordChange,
  onStatusChange,
  onModeChange,
  onDatasetChange,
  onCreatedFromChange,
  onCreatedToChange,
  onClearDates,
  onRefresh,
  onReset,
  onCreate,
  onExport,
}: Props) {
  const advancedId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(createdFrom || createdTo));
  const advancedFilterCount = Number(Boolean(createdFrom)) + Number(Boolean(createdTo));

  useEffect(() => {
    if (createdFrom || createdTo) setAdvancedOpen(true);
  }, [createdFrom, createdTo]);

  // 摘要项与筛选值共用同一组回调，保证移除单项条件时仍沿用任务中心的分页重置和 URL 同步逻辑。
  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; onRemove: () => void }> = [];
    const selectedStatus = STATUS_OPTIONS.find((option) => option.value === status);
    const selectedMode = MODE_OPTIONS.find((option) => option.value === mode);
    const selectedDataset = datasets.find((dataset) => String(dataset.id) === datasetId);

    if (keyword) filters.push({ key: 'keyword', label: `关键词：${keyword}`, onRemove: () => onKeywordChange('') });
    if (selectedStatus?.value) filters.push({ key: 'status', label: selectedStatus.label, onRemove: () => onStatusChange('') });
    if (selectedMode?.value) filters.push({ key: 'mode', label: selectedMode.label, onRemove: () => onModeChange('') });
    if (selectedDataset) filters.push({ key: 'dataset', label: selectedDataset.name, onRemove: () => onDatasetChange('') });
    if (createdFrom || createdTo) {
      filters.push({
        key: 'date',
        label: `${createdFrom || '不限'} 至 ${createdTo || '不限'}`,
        onRemove: onClearDates,
      });
    }
    return filters;
  }, [
    createdFrom,
    createdTo,
    datasetId,
    datasets,
    keyword,
    mode,
    onCreatedFromChange,
    onCreatedToChange,
    onClearDates,
    onDatasetChange,
    onKeywordChange,
    onModeChange,
    onStatusChange,
    status,
  ]);

  const resetFilters = () => {
    setAdvancedOpen(false);
    onReset();
  };

  return (
    <section className="task-center-toolbar panel" aria-label="任务筛选与操作">
      <div className="task-toolbar-header">
        <div className="task-toolbar-title">
          <span className="task-toolbar-title-icon" aria-hidden="true"><Search size={17} /></span>
          <div>
            <h2>任务检索</h2>
            <span>{loading ? '正在更新任务记录…' : `已匹配 ${total} 条任务记录`}</span>
          </div>
        </div>
        <div className="task-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw className={loading ? 'is-spinning' : ''} size={15} aria-hidden="true" />
            {loading ? '更新中' : '刷新'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExport}>
            <Download size={15} aria-hidden="true" /> 导出清单
          </button>
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            <Plus size={16} aria-hidden="true" /> 新建任务
          </button>
        </div>
      </div>

      <div className="task-filter-fields">
        <label className="task-filter-keyword">
          <span>关键词</span>
          <span className={`task-filter-search${keyword ? ' has-value' : ''}`}>
            <Search size={15} aria-hidden="true" />
            <input value={keyword} placeholder="搜索任务名称、数据集或模式" onChange={(event) => onKeywordChange(event.target.value)} />
            {keyword ? (
              <button type="button" onClick={() => onKeywordChange('')} aria-label="清空关键词" title="清空关键词">
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </label>
        <SelectField
          label="状态"
          value={status}
          options={STATUS_OPTIONS}
          onChange={onStatusChange}
        />
        <SelectField
          label="算法模式"
          value={mode}
          options={MODE_OPTIONS}
          onChange={onModeChange}
        />
        <SelectField
          label="数据集"
          value={datasetId}
          options={[
            { value: '', label: '全部数据集' },
            ...datasets.map((item) => ({ value: String(item.id), label: item.name })),
          ]}
          onChange={onDatasetChange}
        />
        <button
          type="button"
          className={`task-filter-advanced-toggle${advancedOpen ? ' is-open' : ''}${advancedFilterCount ? ' has-value' : ''}`}
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span>高级筛选</span>
          {advancedFilterCount ? <strong>{advancedFilterCount}</strong> : null}
          <ChevronDown className="task-filter-advanced-chevron" size={15} aria-hidden="true" />
        </button>
      </div>

      <div
        id={advancedId}
        className={`task-filter-advanced${advancedOpen ? ' is-open' : ''}`}
        aria-hidden={!advancedOpen}
      >
        <div className="task-filter-advanced-inner">
          <div className="task-filter-advanced-heading">
            <CalendarRange size={16} aria-hidden="true" />
            <div><strong>创建日期</strong><span>限定任务记录的创建时间范围</span></div>
          </div>
          <div className="task-filter-date-range" role="group" aria-label="创建日期范围">
            <label>
              <span>开始日期</span>
              <input aria-label="创建开始日期" type="date" value={createdFrom} disabled={!advancedOpen} onChange={(event) => onCreatedFromChange(event.target.value)} />
            </label>
            <span className="task-filter-date-separator" aria-hidden="true">至</span>
            <label>
              <span>结束日期</span>
              <input aria-label="创建结束日期" type="date" value={createdTo} disabled={!advancedOpen} onChange={(event) => onCreatedToChange(event.target.value)} />
            </label>
          </div>
          <button type="button" className="task-filter-clear-dates" onClick={onClearDates} disabled={!advancedFilterCount || !advancedOpen}>
            清除日期
          </button>
        </div>
      </div>

      <div className={`task-filter-summary${activeFilters.length ? ' has-filters' : ''}`} aria-live="polite">
        <div className="task-filter-summary-inner">
          <span className="task-filter-summary-label">当前条件</span>
          <div className="task-filter-chips">
            {activeFilters.map((filter) => (
              <button type="button" key={filter.key} onClick={filter.onRemove} title={`移除${filter.label}`}>
                <span>{filter.label}</span><X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" className="task-filter-reset" onClick={resetFilters}>清除全部</button>
        </div>
      </div>
    </section>
  );
}
