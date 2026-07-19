import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from './SelectField';

const OPTIONS = [
  { value: 'ready', label: '检查通过' },
  { value: 'warning', label: '待确认' },
  { value: 'error', label: '需处理' },
];

describe('SelectField', () => {
  it('selects an option from the floating menu', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SelectField
        label="质量状态"
        value="ready"
        options={OPTIONS}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '质量状态' }));
    await user.click(within(screen.getByRole('listbox', { name: '质量状态' })).getByRole('option', { name: '待确认' }));

    expect(handleChange).toHaveBeenCalledWith('warning');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation and selection', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SelectField
        ariaLabel="数据类型筛选"
        value="ready"
        options={OPTIONS}
        onChange={handleChange}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: '数据类型筛选' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(handleChange).toHaveBeenCalledWith('warning');
  });

  it('does not open while disabled', async () => {
    const user = userEvent.setup();

    render(
      <SelectField
        label="选择数据集"
        value=""
        options={[{ value: '', label: '暂无数据集' }]}
        onChange={vi.fn()}
        disabled
      />,
    );

    await user.click(screen.getByRole('combobox', { name: '选择数据集' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
