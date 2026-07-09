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
  const match = rule.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+);`));
  return match?.[1]?.trim();
}

describe('dataset management layout styles', () => {
  it('uses a dense catalog table layout with row expansion', () => {
    const catalogRule = getRule('.dataset-catalog');
    const toolbarRule = getRule('.dataset-toolbar');
    const tableRule = getRule('.dataset-table');
    const rowRule = getRule('.dataset-row');

    expect(getProperty(catalogRule, 'flex-direction')).toBe('column');
    expect(getProperty(toolbarRule, 'display')).toBe('flex');
    expect(getProperty(toolbarRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(tableRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(tableRule, 'border-radius')).toBe('0 0 var(--panel-radius) var(--panel-radius)');
    expect(getProperty(rowRule, 'grid-template-columns')).toContain('minmax(160px, 2fr)');
    expect(getProperty(rowRule, 'cursor')).toBe('pointer');
  });

  it('styles the detail two-column layout and shared selection surfaces', () => {
    const shellRule = getRule('.dataset-detail-shell');
    const layoutRule = getRule('.dataset-detail-layout');
    const sidebarRule = getRule('.dataset-detail-sidebar');
    const cardRule = getRule('.dataset-detail-card');
    const dangerBtnRule = getRule('.btn.btn-danger');

    expect(getProperty(shellRule, 'flex-direction')).toBe('column');
    expect(getProperty(layoutRule, 'grid-template-columns')).toBe('320px 1fr');
    expect(getProperty(sidebarRule, 'flex-direction')).toBe('column');
    expect(getProperty(cardRule, 'border')).toContain('var(--app-border)');
    expect(getProperty(cardRule, 'background')).toBe('var(--app-surface)');
    expect(getProperty(dangerBtnRule, 'color')).toBe('var(--error-color)');
  });
});
