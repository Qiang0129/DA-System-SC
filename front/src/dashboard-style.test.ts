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

  return match?.[1].trim();
}

function normalizeCssValue(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim();
}

describe('dashboard shell styles', () => {
  it('uses the system UI font stack in the logged-in dashboard shell', () => {
    const appShellRule = getRule('.app-shell');
    const navLabelRule = getRule('.nav-label');

    expect(normalizeCssValue(getProperty(appShellRule, 'font-family'))).toBe(
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif",
    );
    expect(getProperty(appShellRule, 'font-family') ?? '').not.toContain('Lato');
    expect(getProperty(appShellRule, 'font-weight')).toBe('600');
    expect(getProperty(navLabelRule, 'font-size')).toBe('15px');
  });

  it('keeps key dashboard text levels visibly bold', () => {
    const headerTitleRule = getRule('.header-section-title');
    const panelTitleRule = getRule('.panel-header h2');
    const metricValueRule = getRule('.metric-card strong');

    expect(getProperty(headerTitleRule, 'font-weight')).toBe('800');
    expect(getProperty(panelTitleRule, 'font-weight')).toBe('700');
    expect(getProperty(metricValueRule, 'font-weight')).toBe('800');
  });

  it('clips the sidebar brand logo image to the rounded container', () => {
    const brandLogoRule = getRule('.brand-logo');
    const logoImageRule = getRule('.sidebar-brand-logo-image');

    expect(getProperty(brandLogoRule, 'border-radius')).toBe('10px');
    expect(getProperty(brandLogoRule, 'overflow')).toBe('hidden');
    expect(getProperty(logoImageRule, 'width')).toBe('100%');
    expect(getProperty(logoImageRule, 'height')).toBe('100%');
    expect(getProperty(logoImageRule, 'display')).toBe('block');
    expect(getProperty(logoImageRule, 'object-fit')).toBe('cover');
    expect(getProperty(logoImageRule, 'object-position')).toBe('center');
  });

  it('reserves independent rows for drawer tabs, scrolling content, and footer actions', () => {
    const drawerRule = getRule('.task-drawer-panel');
    const bodyRule = getRule('.task-drawer-body');

    expect(normalizeCssValue(getProperty(drawerRule, 'grid-template-rows'))).toBe(
      'auto auto minmax(0, 1fr) auto',
    );
    expect(getProperty(drawerRule, 'height')).toBe('100dvh');
    expect(getProperty(bodyRule, 'min-height')).toBe('0');
    expect(getProperty(bodyRule, 'overflow-y')).toBe('auto');
  });

  it('keeps the task date range balanced and all statistic cards visually responsive', () => {
    const dateRangeRule = getRule('.task-filter-date-range');
    const statCardRule = getRule('.task-stat-card');
    const actionableCardRule = getRule('.task-stat-card.is-actionable');

    expect(normalizeCssValue(getProperty(dateRangeRule, 'grid-template-columns'))).toBe(
      'repeat(2, minmax(0, 210px))',
    );
    expect(getProperty(dateRangeRule, 'width')).toBe('min(100%, 448px)');
    expect(getProperty(statCardRule, 'cursor')).toBe('default');
    expect(getProperty(actionableCardRule, 'cursor')).toBe('pointer');
    expect(css).toContain('.task-stat-card:hover,');
  });

  it('uses a stable filter grid and state-driven advanced filter motion', () => {
    const fieldsRule = getRule('.task-filter-fields');
    const advancedRule = getRule('.task-filter-advanced');
    const advancedOpenRule = getRule('.task-filter-advanced.is-open');
    const densityRule = getRule('.task-density-control');

    expect(normalizeCssValue(getProperty(fieldsRule, 'grid-template-columns'))).toBe(
      'minmax(300px, 1.8fr) repeat(3, minmax(150px, 0.8fr)) minmax(132px, auto)',
    );
    expect(getProperty(advancedRule, 'grid-template-rows')).toBe('0fr');
    expect(getProperty(advancedOpenRule, 'grid-template-rows')).toBe('1fr');
    expect(getProperty(densityRule, 'display')).toBe('inline-flex');
    expect(css).toContain('@keyframes task-toolbar-spin');
  });
});
