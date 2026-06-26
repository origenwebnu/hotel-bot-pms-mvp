import type { ReactNode } from 'react';

interface IntegrationViewShellProps {
  title: string;
  description: string;
  statusLabel?: string;
  statusOk?: boolean;
  children: ReactNode;
}

export function IntegrationViewShell({
  title,
  description,
  statusLabel,
  statusOk,
  children,
}: IntegrationViewShellProps) {
  return (
    <div className="integration-view">
      <header className="integration-view-header glass-panel">
        <div className="integration-view-intro">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {statusLabel && (
          <span className={`integration-status ${statusOk ? 'ok' : 'pending'}`}>
            {statusLabel}
          </span>
        )}
      </header>
      <div className="integration-view-body">{children}</div>
    </div>
  );
}
