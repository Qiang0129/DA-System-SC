import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/workbench/workbench-polish.css'), 'utf8');

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
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

describe('workbench result detail styles', () => {
  it('keeps the kernel definition status anchored while formulas change', () => {
    const definitionRule = getRule('.result-kernel-definition');
    const formulaRule = getRule('.result-kernel-definition .result-kernel-formula');

    expect(getProperty(definitionRule, 'display')).toBe('grid');
    expect(getProperty(definitionRule, 'grid-template-rows')).toBe('auto minmax(120px, 1fr) auto');
    expect(getProperty(definitionRule, 'align-content')).toBe('stretch');
    expect(definitionRule).not.toContain('align-content: center');
    expect(getProperty(formulaRule, 'min-height')).toBe('120px');
    expect(getProperty(formulaRule, 'align-self')).toBe('center');
    expect(getProperty(formulaRule, 'justify-self')).toBe('stretch');
  });

  it('uses transform-based progress motion to avoid layout thrashing', () => {
    const progressRule = getRule('.workbench-progress-track > span');
    const dashboardRule = getRule('.dashboard-content');

    expect(getProperty(progressRule, 'width')).toBe('100%');
    expect(getProperty(progressRule, 'transform-origin')).toBe('left center');
    expect(getProperty(progressRule, 'transition')).toBe('transform 420ms var(--ease-out-quart)');
    expect(dashboardRule).not.toContain(`transition: ${'margin-left'}`);
    expect(css).not.toContain(`transition: ${'width'} var(--motion-normal)`);
  });

  it('keeps diagnostic facts bounded and export library panels equal height', () => {
    const factsRule = getRule('.result-analysis-facts');
    const libraryRule = getRule('.result-export-library');

    expect(getProperty(factsRule, 'overflow')).toBe('hidden');
    expect(getProperty(factsRule, 'border')).toBe('1px solid #e2e8ee');
    expect(getProperty(factsRule, 'border-radius')).toBe('10px');
    expect(getProperty(libraryRule, 'align-items')).toBe('stretch');
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr);');
  });
});
