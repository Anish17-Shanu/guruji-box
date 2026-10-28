import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export function Loader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loader" role="status" aria-live="polite">
      <Loader2 className="spin" aria-hidden="true" size={22} />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="alert alert-error" role="alert">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-quiet btn-small" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'error';
  children: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  body?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" size={30} />
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="lede">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-label={label}
      >
        <span style={{ width: `${safe}%` }} />
      </div>
      <span className="progress-value">{safe}%</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <article className="stat">
      {Icon && (
        <span className="stat-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </article>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {letters || 'G'}
    </span>
  );
}

export function Section({ title, children, id }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="panel" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
      {children}
    </section>
  );
}
