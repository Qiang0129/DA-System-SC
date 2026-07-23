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
});
