import type { ReactNode } from 'react';
import { Boxes, ClipboardCheck, Network, RefreshCw, Target, type LucideIcon } from 'lucide-react';
import {
  WorkbenchMetricStrip,
  WorkbenchPageHeader,
  WorkbenchStatus,
} from '../WorkbenchUi';
import { formatPercent, metricLabels, type MetricKey } from './resultPresentation';
import type { AnalysisResult, TaskResultResource } from './types';

export function ReadyHeader({
  title,
  icon,
  resource,
  actions,
}: {
  title: string;
  icon: LucideIcon;
  resource: TaskResultResource;
  actions?: ReactNode;
}) {
  const task = resource.envelope!.task!;
  const result = resource.envelope!.result!;

  return (
    <WorkbenchPageHeader
      icon={icon}
      title={title}
      context={`任务 #${task.id} · ${task.datasetName} · ${task.mode} · 第 ${result.preview.summary.representativeRun} 轮代表结果`}
      status={<WorkbenchStatus tone="success">真实结果</WorkbenchStatus>}
      actions={
        actions ?? (
          <button type="button" className="btn btn-secondary" onClick={resource.refresh}>
            <RefreshCw size={15} aria-hidden="true" />
            刷新
          </button>
        )
      }
    />
  );
}

export function MetricStrip({ result }: { result: AnalysisResult }) {
  const icons = [Target, Network, Boxes, ClipboardCheck];
  const tones = ['green', 'blue', 'teal', 'neutral'] as const;

  return (
    <WorkbenchMetricStrip
      label="重复实验指标"
      metrics={(Object.keys(metricLabels) as MetricKey[]).map((key, index) => ({
        label: metricLabels[key],
        value: formatPercent(result.metrics.aggregate[key].mean),
        note: `标准差 ${formatPercent(result.metrics.aggregate[key].std)}`,
        icon: icons[index],
        tone: tones[index],
      }))}
    />
  );
}
