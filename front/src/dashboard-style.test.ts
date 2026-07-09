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
    const panelTitleRule = getRule('.panel-header h2');
    const metricValueRule = getRule('.metric-card strong');

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
});
