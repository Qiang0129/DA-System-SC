import { describe, expect, it } from 'vitest';
import {
  buildClusterScatterOption,
  buildConvergenceOption,
  buildHeatmapOption,
  buildKernelWeightsOption,
} from './App';

function getAxisLabelFontWeights(option: ReturnType<typeof buildKernelWeightsOption>) {
  const xAxis = option.xAxis as { axisLabel?: { fontWeight?: number } };
  const yAxis = option.yAxis as { axisLabel?: { fontWeight?: number } };

  return [xAxis.axisLabel?.fontWeight, yAxis.axisLabel?.fontWeight];
}

describe('dashboard chart typography', () => {
  it('uses bold text for generated ECharts labels and tooltips', () => {
    const options = [
      buildHeatmapOption(),
      buildKernelWeightsOption(),
      buildConvergenceOption(),
      buildClusterScatterOption(),
    ];

    for (const option of options) {
      expect(option.textStyle).toMatchObject({ fontWeight: 600 });
      expect(option.tooltip).toMatchObject({ textStyle: { fontWeight: 600 } });
      expect(getAxisLabelFontWeights(option)).toEqual([600, 600]);
    }
  });
});
