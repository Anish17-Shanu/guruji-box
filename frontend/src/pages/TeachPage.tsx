import { ArrowRight, FileText, GraduationCap, Plus, Target, UsersRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { ClassSummary, TeacherDashboard } from '../api/types';
import {
  Alert,
  EmptyState,
  ErrorBox,
  Loader,
  PageHeader,
  StatCard,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatScore } from '../lib/format';

export function TeachPage() {
  const { t } = useI18n();
  const dashboard = useAsync<TeacherDashboard>(() => api<TeacherDashboard>('/teacher/dashboard'), []);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('6');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api<ClassSummary>('/teacher/classes', {
        method: 'POST',
        body: { name: name.trim(), class_level: Number(level) },
      });
      setName('');
      setShowCreate(false);
      setMessage(t('teach.classCreated'));
      dashboard.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (dashboard.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (dashboard.error || !dashboard.data) {
    return (
      <div className="page">
        <ErrorBox message={dashboard.error ?? t('common.error')} onRetry={dashboard.reload} />
      </div>
    );
  }

  const data = dashboard.data;

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('nav.teach')}
        title={t('teach.title')}
        subtitle={t('teach.subtitle')}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate((open) => !open)}>
              <Plus size={16} aria-hidden="true" /> {t('teach.newClass')}
            </button>
            <Link className="btn btn-ghost" to="/worksheets">
              <FileText size={16} aria-hidden="true" /> {t('teach.worksheets')}
            </Link>
          </>
        }
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {showCreate && (
        <form className="panel inline-form" onSubmit={createClass}>
          <h2>{t('teach.newClass')}</h2>
          <div className="form-row">
            <label className="field">
              <span>{t('teach.className')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Class 6 — Morning"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label className="field">
              <span>{t('teach.classLevel')}</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? t('teach.creating') : t('teach.create')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </form>
      )}

      <section className="stat-grid" aria-label={t('teach.title')}>
        <StatCard icon={UsersRound} label={t('teach.learners')} value={data.learners} />
        <StatCard icon={GraduationCap} label={t('teach.attempts')} value={data.attempts} />
        <StatCard icon={Target} label={t('teach.average')} value={formatScore(data.mean_latest_score)} />
        <StatCard
          icon={FileText}
          label={t('teach.drafts')}
          value={data.draft_worksheets}
          hint={
            <Link className="text-link small" to="/worksheets?status=DRAFT">
              {t('teach.worksheets')} <ArrowRight size={12} aria-hidden="true" />
            </Link>
          }
        />
      </section>

      {data.classes.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t('teach.empty')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} aria-hidden="true" /> {t('teach.newClass')}
            </button>
          }
        />
      ) : (
        <section className="class-grid" aria-label={t('teach.classes')}>
          {data.classes.map((classroom) => (
            <article className="class-card" key={classroom.id}>
              <div className="class-card-head">
                <span className="badge">{t('learn.class')} {classroom.class_level}</span>
                <span className="small muted">
                  {classroom.learner_count} {t('teach.learners')}
                </span>
              </div>
              <h2>
                <Link to={`/teach/classes/${classroom.id}`}>{classroom.name}</Link>
              </h2>
              {classroom.join_code && (
                <p className="join-code">
                  <span>{t('teach.joinCode')}</span>
                  <strong className="mono">{classroom.join_code}</strong>
                </p>
              )}
              <Link className="text-link" to={`/teach/classes/${classroom.id}`}>
                {t('teach.open')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
