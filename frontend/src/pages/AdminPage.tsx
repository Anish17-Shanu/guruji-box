import {
  Ban,
  CheckCircle2,
  FileText,
  GraduationCap,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AdminStats, AdminUser, AuditEvent, PaginatedUsers, Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  Alert,
  ErrorBox,
  Loader,
  PageHeader,
  StatCard,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';

const ROLES: Role[] = ['LEARNER', 'TEACHER', 'ADMIN'];

export function AdminPage() {
  const { t, lang } = useI18n();
  const { user: current } = useAuth();
  const [tab, setTab] = useState<'users' | 'audit'>('users');

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [limit, setLimit] = useState(50);

  const stats = useAsync<AdminStats>(() => api<AdminStats>('/admin/stats'), []);
  const users = useAsync<PaginatedUsers>(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (query) params.set('q', query);
    if (role) params.set('role', role);
    if (active) params.set('active', active);
    return api<PaginatedUsers>(`/admin/users?${params.toString()}`);
  }, [query, role, active, limit]);
  const audit = useAsync<AuditEvent[]>(() => api<AuditEvent[]>('/admin/audit?limit=50'), []);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchInput.trim());
    setLimit(50);
  }

  async function patchUser(
    target: AdminUser,
    body: { role?: Role; is_active?: boolean; password?: string },
  ) {
    setBusyId(target.id);
    setError('');
    setMessage('');
    try {
      await api<AdminUser>(`/admin/users/${target.id}`, { method: 'PATCH', body });
      users.reload();
      stats.reload();
      setMessage(`${target.display_name}: ${t('common.saved')}`);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function closeReset() {
    setResetTarget(null);
    setResetPassword('');
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    const ok = await patchUser(resetTarget, { password: resetPassword });
    setResetting(false);
    if (ok) {
      setMessage(`${resetTarget.display_name}: ${t('admin.passwordReset')}`);
      closeReset();
    }
  }

  const statCards = stats.data
    ? [
        { label: t('admin.totalUsers'), value: stats.data.users, icon: Users },
        { label: t('admin.learners'), value: stats.data.learners, icon: GraduationCap },
        { label: t('admin.teachers'), value: stats.data.teachers, icon: Users },
        { label: t('admin.active'), value: stats.data.active_users_7d, icon: CheckCircle2 },
        { label: t('admin.classes'), value: stats.data.classes, icon: Users },
        { label: t('admin.lessons'), value: stats.data.lessons, icon: FileText },
        { label: t('admin.attempts'), value: stats.data.attempts, icon: CheckCircle2 },
        { label: t('admin.worksheets'), value: stats.data.worksheets, icon: FileText },
      ]
    : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('nav.admin')}
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              stats.reload();
              users.reload();
              audit.reload();
            }}
          >
            <RefreshCw size={15} aria-hidden="true" /> {t('common.retry')}
          </button>
        }
      />

      {stats.loading && <Loader />}
      {stats.error && <ErrorBox message={stats.error} onRetry={stats.reload} />}
      {statCards.length > 0 && (
        <section className="stat-grid wide" aria-label={t('admin.title')}>
          {statCards.map(({ label, value, icon: Icon }) => (
            <StatCard key={label} icon={Icon} label={label} value={value} />
          ))}
        </section>
      )}

      <div className="tab-bar" role="tablist" aria-label={t('admin.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'users'}
          className={tab === 'users' ? 'tab active' : 'tab'}
          onClick={() => setTab('users')}
        >
          <ShieldCheck size={15} aria-hidden="true" /> {t('admin.users')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audit'}
          className={tab === 'audit' ? 'tab active' : 'tab'}
          onClick={() => setTab('audit')}
        >
          <FileText size={15} aria-hidden="true" /> {t('admin.audit')}
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      {tab === 'users' && (
        <section className="panel" aria-labelledby="admin-users">
          <h2 id="admin-users">{t('admin.users')}</h2>
          <form className="filter-bar" onSubmit={applySearch}>
            <label className="search-field grow">
              <Users size={16} aria-hidden="true" />
              <span className="sr-only">{t('admin.search')}</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={t('admin.search')}
              />
            </label>
            <label className="inline-field">
              <span>{t('admin.role')}</span>
              <select
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                  setLimit(50);
                }}
              >
                <option value="">{t('common.all')}</option>
                {ROLES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'LEARNER'
                      ? t('auth.learner')
                      : value === 'TEACHER'
                        ? t('auth.teacher')
                        : t('admin.title')}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-field">
              <span>{t('admin.status')}</span>
              <select
                value={active}
                onChange={(event) => {
                  setActive(event.target.value);
                  setLimit(50);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="true">{t('admin.enabled')}</option>
                <option value="false">{t('admin.disabled')}</option>
              </select>
            </label>
            <button type="submit" className="btn btn-secondary">
              {t('common.search')}
            </button>
          </form>

          {users.loading && <Loader />}
          {users.error && <ErrorBox message={users.error} onRetry={users.reload} />}
          {!users.loading && (users.data?.users ?? []).length === 0 && (
            <p className="muted">{t('admin.noUsers')}</p>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('profile.name')}</th>
                  <th>{t('admin.role')}</th>
                  <th>{t('admin.status')}</th>
                  <th>{t('profile.lastLogin')}</th>
                  <th>{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.users ?? []).map((account) => {
                  const isSelf = current?.id === account.id;
                  return (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.display_name}</strong>
                        {isSelf && <span className="badge badge-soft">{t('admin.you')}</span>}
                        <span className="cell-sub">{account.email}</span>
                      </td>
                      <td>
                        <select
                          value={account.role}
                          disabled={isSelf || busyId === account.id}
                          aria-label={`${t('admin.role')}: ${account.display_name}`}
                          onChange={(event) =>
                            patchUser(account, { role: event.target.value as Role })
                          }
                        >
                          {ROLES.map((value) => (
                            <option key={value} value={value}>
                              {value === 'LEARNER'
                                ? t('auth.learner')
                                : value === 'TEACHER'
                                  ? t('auth.teacher')
                                  : 'Admin'}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={account.is_active ? 'status approved' : 'status draft'}>
                          {account.is_active ? t('admin.enabled') : t('admin.disabled')}
                        </span>
                      </td>
                      <td>{account.last_login_at ? formatDate(account.last_login_at, lang, true) : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={isSelf || busyId === account.id}
                            title={isSelf ? t('admin.selfReset') : undefined}
                            onClick={() => {
                              setResetPassword('');
                              setResetTarget(account);
                            }}
                          >
                            <KeyRound size={14} aria-hidden="true" /> {t('admin.resetPassword')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-quiet btn-small"
                            disabled={isSelf || busyId === account.id}
                            title={isSelf ? t('admin.selfDemote') : undefined}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  account.is_active ? t('admin.confirmDisable') : t('admin.confirmEnable'),
                                )
                              ) {
                                return;
                              }
                              patchUser(account, { is_active: !account.is_active });
                            }}
                          >
                            {account.is_active ? (
                              <>
                                <Ban size={14} aria-hidden="true" /> {t('admin.disable')}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={14} aria-hidden="true" /> {t('admin.enable')}
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {users.data && users.data.users.length < users.data.total && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setLimit((value) => Math.min(200, value + 50))}
              disabled={users.data.users.length >= 200}
            >
              {t('admin.loadMore')}
            </button>
          )}
        </section>
      )}

      {tab === 'audit' && (
        <section className="panel" aria-labelledby="admin-audit">
          <h2 id="admin-audit">{t('admin.audit')}</h2>
          {audit.loading && <Loader />}
          {audit.error && <ErrorBox message={audit.error} onRetry={audit.reload} />}
          {!audit.loading && (audit.data ?? []).length === 0 && (
            <p className="muted">{t('admin.noAudit')}</p>
          )}
          {(audit.data ?? []).length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.action')}</th>
                    <th>{t('admin.entity')}</th>
                    <th>{t('admin.ip')}</th>
                    <th>{t('admin.when')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.data ?? []).map((event) => (
                    <tr key={event.id}>
                      <td>
                        <strong className="mono small">{event.action}</strong>
                        {event.user_id && <span className="cell-sub">user #{event.user_id}</span>}
                      </td>
                      <td>
                        {event.entity_type ? `${event.entity_type} #${event.entity_id ?? '—'}` : '—'}
                      </td>
                      <td className="mono small">{event.ip ?? '—'}</td>
                      <td>{formatDate(event.created_at, lang, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {resetTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReset();
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-password-title"
          >
            <h2 id="reset-password-title">{t('admin.resetTitle')}</h2>
            <p className="muted">
              {t('admin.resetBody', { name: resetTarget.display_name })}
            </p>
            <form onSubmit={submitReset}>
              <label className="field">
                <span>{t('admin.newPassword')}</span>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                  autoFocus
                />
                <span className="field-hint">{t('admin.passwordHint')}</span>
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={resetting}>
                  {resetting ? t('common.saving') : t('admin.resetSubmit')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeReset}>
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
