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
  it('uses a dense workflow layout for the four dataset actions', () => {
    const workflowRule = getRule('.dataset-workflow-grid');
    const importPanelRule = getRule('.dataset-import-panel');
    const statisticsRule = getRule('.dataset-statistics-panel');
    const selectionRule = getRule('.dataset-selection-panel');

    expect(getProperty(workflowRule, 'display')).toBe('grid');
    expect(getProperty(workflowRule, 'grid-template-columns')).toBe(
      'minmax(360px, 1fr) minmax(440px, 1fr)',
    );
    expect(getProperty(workflowRule, 'gap')).toBe('12px');
    expect(getProperty(importPanelRule, 'min-height')).toBe('100%');
    expect(getProperty(statisticsRule, 'min-height')).toBe('100%');
    expect(getProperty(selectionRule, 'min-height')).toBe('100%');
  });

  it('styles upload, selection chips and task draft as tool surfaces', () => {
    const dropzoneRule = getRule('.dataset-dropzone');
    const chipGridRule = getRule('.selected-base-grid');
    const taskDraftRule = getRule('.task-draft-card');

    expect(getProperty(dropzoneRule, 'border')).toBe('1px dashed var(--primary-30)');
    expect(getProperty(dropzoneRule, 'background')).toBe('var(--primary-8)');
    expect(getProperty(chipGridRule, 'grid-template-columns')).toBe(
      'repeat(auto-fill, minmax(74px, 1fr))',
    );
    expect(getProperty(taskDraftRule, 'border')).toBe('1px solid var(--primary-30)');
  });
});
