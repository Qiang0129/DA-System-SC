import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type WorkbenchMetricTone = 'blue' | 'teal' | 'green' | 'amber' | 'red' | 'neutral';

export type WorkbenchMetric = {
  label: string;
  value: string;
  note: string;
  tone?: WorkbenchMetricTone;
  icon?: LucideIcon;
};

type WorkbenchPageHeaderProps = {
  icon: LucideIcon;
  title: string;
  context: string;
  status?: ReactNode;
  actions?: ReactNode;
};

type WorkbenchSectionHeaderProps = {
  title: string;
  meta?: string;
  actions?: ReactNode;
};

type WorkbenchStatusProps = {
  tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
  pulse?: boolean;
};

export function WorkbenchPageHeader({
  icon: Icon,
  title,
  context,
  status,
  actions,
}: WorkbenchPageHeaderProps) {
  return (
    <header className="workbench-page-header">
      <div className="workbench-page-title-block">
        <span className="workbench-page-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <div className="workbench-page-title-line">
            <h1>{title}</h1>
            {status}
          </div>
          <p>{context}</p>
        </div>
      </div>
      {actions ? <div className="workbench-page-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkbenchMetricStrip({
  label,
  metrics,
}: {
  label: string;
  metrics: WorkbenchMetric[];
}) {
  return (
    <section className="workbench-metric-strip" aria-label={label}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className={`workbench-metric tone-${metric.tone ?? 'neutral'}`} key={metric.label}>
            <div className="workbench-metric-label">
              {Icon ? <Icon size={15} aria-hidden="true" /> : null}
              <span>{metric.label}</span>
            </div>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        );
      })}
    </section>
  );
}

export function WorkbenchSectionHeader({ title, meta, actions }: WorkbenchSectionHeaderProps) {
  return (
    <header className="workbench-section-header">
      <div>
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {actions ? <div className="workbench-section-actions">{actions}</div> : null}
    </header>
  );
}

export function WorkbenchStatus({ tone, children, pulse = false }: WorkbenchStatusProps) {
  return (
    <span className={`workbench-status ${tone}${pulse ? ' is-pulsing' : ''}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function WorkbenchProgress({
  value,
  label,
  tone = 'blue',
  animated = false,
}: {
  value: number;
  label: string;
  tone?: 'blue' | 'teal' | 'green' | 'amber';
  animated?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`workbench-progress tone-${tone}${animated ? ' is-animated' : ''}`}>
      <div>
        <span>{label}</span>
        <strong>{safeValue}%</strong>
      </div>
      <div
        className="workbench-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
      >
        <span style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export function WorkbenchNotice({
  tone,
  icon: Icon,
  title,
  detail,
  action,
}: {
  tone: 'info' | 'success' | 'warning' | 'error';
  icon: LucideIcon;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className={`workbench-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={17} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {action ? <div className="workbench-notice-action">{action}</div> : null}
    </div>
  );
}
