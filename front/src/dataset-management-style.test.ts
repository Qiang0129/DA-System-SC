import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));

  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match[1];
}

function getProperty(rule: string, property: string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rule.match(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe('dataset management layout styles', () => {
  it('uses aligned data tracks in the compact catalog list', () => {
    const catalogRule = getRule('.dataset-catalog');
    const toolbarRule = getRule('.dataset-toolbar');
    const listGridRule = getRule('.dataset-list-grid');
    const listHeaderRule = getRule('.dataset-list-header');
    const listHeaderCellRule = getRule('.dataset-list-header > span');
    const itemRule = getRule('.dataset-list-item');
    const nameRule = getRule('.dataset-list-item-name strong');
    const typeTagRule = getRule('.dataset-type-tag');
    const actionsRule = getRule('.dataset-list-actions');
    const actionButtonRule = getRule('.dataset-list-action');
    const lifecycleUsageRule = getRule('.dataset-list-lifecycle .dataset-usage-status');

    expect(getProperty(catalogRule, 'flex-direction')).toBe('column');
    expect(getProperty(toolbarRule, 'display')).toBe('flex');
    expect(getProperty(toolbarRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(listGridRule, 'flex-direction')).toBe('column');
    expect(getProperty(listGridRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(listHeaderRule, 'grid-template-columns')).toBe('var(--dataset-list-columns)');
    expect(getProperty(listHeaderCellRule, 'justify-self')).toBe('start');
    expect(getProperty(listHeaderCellRule, 'text-align')).toBe('left');
    expect(getProperty(itemRule, 'grid-template-columns')).toBe('var(--dataset-list-columns)');
    expect(getProperty(itemRule, 'cursor')).toBe('default');
    expect(getProperty(nameRule, 'font-size')).toBe('15px');
    expect(getProperty(nameRule, 'font-weight')).toBe('800');
    expect(getProperty(typeTagRule, 'border-radius')).toBe('999px');
    expect(getProperty(typeTagRule, 'font-weight')).toBe('700');
    expect(getProperty(actionsRule, 'gap')).toBe('6px');
    expect(getProperty(actionButtonRule, 'width')).toBe('32px');
    expect(getProperty(actionButtonRule, 'height')).toBe('32px');
    expect(getProperty(actionButtonRule, 'border-radius')).toBe('var(--panel-radius)');
    expect(getProperty(lifecycleUsageRule, 'text-overflow')).toBe('ellipsis');
  });

  it('styles the detail overview, workspace and selection surfaces', () => {
    const shellRule = getRule('.dataset-detail-shell');
    const heroRule = getRule('.dataset-detail-hero');
    const layoutRule = getRule('.dataset-detail-layout');
    const identityRule = getRule('.dataset-detail-identity');
    const metaRule = getRule('.dataset-detail-meta');
    const dividerRule = getRule('.dataset-detail-meta > span + span::before');
    const overviewRule = getRule('.dataset-overview-grid');
    const overviewCardRule = getRule('.dataset-overview-card');
    const lowerGridRule = getRule('.dataset-detail-lower-grid');
    const sectionRule = getRule('.dataset-detail-section');
    const labelRowRule = getRule('.label-distribution-row');
    const tableWrapRule = getRule('.dataset-table-wrap');
    const tableHeadRule = getRule('.dataset-stat-table th');
    const selectionHeadingRule = getRule('.selection-control-heading');
    const selectionRule = getRule('.selection-controls');
    const selectionButtonRule = getRule('.selection-controls > .btn');
    const meterHeadingRule = getRule('.selection-meter-heading');
    const selectionPanelRule = getRule('.dataset-selection-panel');
    const selectedPanelRule = getRule('.selected-base-panel');
    const selectedPanelHeadingRule = getRule('.selected-base-panel-heading');
    const selectedGridRule = getRule('.selected-base-grid');
    const selectedChipRule = getRule('.selected-base-chip');
    const selectedRemoveRule = getRule('.selected-base-remove');
    const dangerBtnRule = getRule('.btn.btn-danger');

    expect(getProperty(shellRule, 'flex-direction')).toBe('column');
    expect(getProperty(heroRule, 'grid-template-columns')).toBe('minmax(0, 1fr) auto');
    expect(getProperty(heroRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(layoutRule, 'flex-direction')).toBe('column');
    expect(getProperty(identityRule, 'display')).toBe('flex');
    expect(getProperty(metaRule, 'border-left')).toContain('rgba(64, 158, 255');
    expect(getProperty(dividerRule, 'width')).toBe('1px');
    expect(getProperty(dividerRule, 'left')).toBe('-10px');
    expect(getProperty(overviewRule, 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
    expect(getProperty(overviewCardRule, 'background')).toBe('var(--app-surface)');
    expect(getProperty(lowerGridRule, 'grid-template-columns')).toContain('minmax(0, 1.42fr)');
    expect(getProperty(lowerGridRule, 'align-items')).toBe('stretch');
    expect(getProperty(sectionRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(labelRowRule, 'grid-template-columns')).toContain('minmax(220px, 1.8fr)');
    expect(getProperty(tableWrapRule, 'max-height')).toBe('360px');
    expect(getProperty(tableWrapRule, 'overflow')).toBe('auto');
    expect(getProperty(tableHeadRule, 'position')).toBe('sticky');
    expect(getProperty(tableHeadRule, 'top')).toBe('0');
    expect(getProperty(selectionHeadingRule, 'justify-content')).toBe('space-between');
    expect(getProperty(selectionRule, 'grid-template-columns')).toContain('minmax(132px, auto)');
    expect(getProperty(selectionButtonRule, 'min-height')).toBe('38px');
    expect(getProperty(meterHeadingRule, 'justify-content')).toBe('space-between');
    expect(getProperty(selectionPanelRule, 'display')).toBe('grid');
    expect(getProperty(selectionPanelRule, 'grid-template-rows')).toContain('minmax(0, 1fr)');
    expect(getProperty(selectionPanelRule, 'height')).toBe('100%');
    expect(getProperty(selectionPanelRule, 'overflow')).toBe('hidden');
    expect(getProperty(selectedPanelRule, 'display')).toBe('grid');
    expect(getProperty(selectedPanelRule, 'grid-template-rows')).toContain('minmax(0, 1fr)');
    expect(getProperty(selectedPanelRule, 'overflow')).toBe('hidden');
    expect(getProperty(selectedPanelHeadingRule, 'justify-content')).toBe('space-between');
    expect(getProperty(selectedGridRule, 'max-height')).toBe('240px');
    expect(getProperty(selectedGridRule, 'overflow-y')).toBe('auto');
    expect(getProperty(selectedGridRule, 'overflow-x')).toBe('hidden');
    expect(getProperty(selectedGridRule, 'flex-wrap')).toBe('wrap');
    expect(getProperty(selectedChipRule, 'display')).toBe('inline-flex');
    expect(getProperty(selectedRemoveRule, 'width')).toBe('20px');
    expect(getProperty(dangerBtnRule, 'color')).toBe('var(--error-color)');
  });

  it('styles the rename modal as a centered in-app dialog', () => {
    const overlayRule = getRule('.dataset-rename-modal');
    const dialogRule = getRule('.dataset-rename-dialog');
    const headerRule = getRule('.dataset-rename-header');
    const summaryRule = getRule('.dataset-rename-summary');
    const inputRule = getRule('.dataset-rename-input');
    const actionsRule = getRule('.dataset-rename-actions');

    expect(getProperty(overlayRule, 'position')).toBe('fixed');
    expect(getProperty(overlayRule, 'inset')).toBe('0');
    expect(getProperty(overlayRule, 'display')).toBe('grid');
    expect(getProperty(dialogRule, 'width')).toBe('min(560px, 100%)');
    expect(getProperty(dialogRule, 'border-radius')).toBe('var(--panel-radius)');
    expect(getProperty(dialogRule, 'box-shadow')).toContain('rgba(15, 23, 42, 0.12)');
    expect(getProperty(dialogRule, 'animation')).toContain('dataset-rename-enter');
    expect(getProperty(headerRule, 'display')).toBe('flex');
    expect(getProperty(summaryRule, 'display')).toBe('flex');
    expect(getProperty(inputRule, 'height')).toBe('42px');
    expect(getProperty(inputRule, 'border-radius')).toBe('var(--panel-radius)');
    expect(getProperty(actionsRule, 'justify-content')).toBe('flex-end');
  });

  it('styles the delete confirmation as an in-app danger dialog', () => {
    const overlayRule = getRule('.dataset-delete-modal');
    const dialogRule = getRule('.dataset-delete-dialog');
    const iconRule = getRule('.dataset-delete-icon');
    const targetRule = getRule('.dataset-delete-target');
    const actionsRule = getRule('.dataset-delete-actions');
    const confirmRule = getRule('.dataset-delete-confirm');

    expect(getProperty(overlayRule, 'position')).toBe('fixed');
    expect(getProperty(overlayRule, 'inset')).toBe('0');
    expect(getProperty(overlayRule, 'display')).toBe('grid');
    expect(getProperty(dialogRule, 'width')).toBe('min(480px, 100%)');
    expect(getProperty(dialogRule, 'border-radius')).toBe('var(--panel-radius)');
    expect(getProperty(iconRule, 'color')).toBe('var(--error-color)');
    expect(getProperty(targetRule, 'display')).toBe('grid');
    expect(getProperty(actionsRule, 'justify-content')).toBe('flex-end');
    expect(getProperty(confirmRule, 'background')).toBe('var(--error-color)');
  });

  it('styles the card grid and view toggle segment', () => {
    const gridRule = getRule('.dataset-card-grid');
    const cardRule = getRule('.dataset-card');
    const topRule = getRule('.dataset-card-top');
    const titleRule = getRule('.dataset-card-title-block strong');
    const typeRule = getRule('.dataset-card-type');
    const metricsRule = getRule('.dataset-card-metrics');
    const metricRule = getRule('.dataset-card-metric');
    const metricBarRule = getRule('.dataset-metric-bar');
    const metricFillRule = getRule('.dataset-metric-fill');
    const factsRule = getRule('.dataset-card-facts');
    const factRule = getRule('.dataset-card-fact');
    const footerRule = getRule('.dataset-card-footer');
    const labelTagRule = getRule('.dataset-label-tag');
    const cardActionsRule = getRule('.dataset-card-actions');
    const segmentRule = getRule('.dataset-toolbar-segment');
    const viewBtnRule = getRule('.dataset-view-btn');

    expect(getProperty(gridRule, 'display')).toBe('grid');
    expect(getProperty(gridRule, 'grid-template-columns')).toBe('repeat(4, minmax(0, 1fr))');
    expect(getProperty(cardRule, 'cursor')).toBe('default');
    expect(getProperty(cardRule, 'min-height')).toBe('248px');
    expect(getProperty(topRule, 'justify-content')).toBe('space-between');
    expect(getProperty(titleRule, 'font-size')).toBe('17px');
    expect(getProperty(titleRule, '-webkit-line-clamp')).toBe('2');
    expect(getProperty(typeRule, 'flex')).toBe('0 0 auto');
    expect(getProperty(metricsRule, 'display')).toBe('grid');
    expect(getProperty(metricsRule, 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
    expect(getProperty(metricRule, 'background')).toContain('var(--success-color)');
    expect(getProperty(metricBarRule, 'height')).toBe('5px');
    expect(getProperty(metricFillRule, 'background')).toBe('#63c354');
    expect(getProperty(factsRule, 'grid-template-columns')).toBe('repeat(3, minmax(0, 1fr))');
    expect(getProperty(factRule, 'flex-direction')).toBe('column');
    expect(getProperty(factRule, 'background')).toBe('var(--bg-tertiary)');
    expect(getProperty(footerRule, 'justify-content')).toBe('space-between');
    expect(getProperty(labelTagRule, 'border-radius')).toBe('var(--radius-full)');
    expect(getProperty(cardActionsRule, 'justify-content')).toBe('flex-end');
    expect(getProperty(cardActionsRule, 'gap')).toBe('6px');
    expect(getProperty(cardActionsRule, 'flex')).toBe('0 0 auto');
    expect(getProperty(segmentRule, 'display')).toBe('flex');
    expect(getProperty(viewBtnRule, 'display')).toBe('flex');
    expect(getProperty(viewBtnRule, 'justify-content')).toBe('center');
  });
});
