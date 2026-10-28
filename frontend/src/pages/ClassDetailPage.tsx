import { ArrowLeft, KeyRound, Plus, Trash2, UserMinus, UsersRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type {
  ClassDetail,
  ClassMember,
  ClassPerformance,
  LearningGaps,
} from '../api/types';
import {
  Alert,
  ErrorBox,
  Loader,
  PageHeader,
  StatCard,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate, formatScore } from '../lib/format';

export function ClassDetailPage() {
  const { id } = useParams();
  const classId = Number(id);
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const classroom = useAsync<ClassDetail>(() => api<ClassDetail>(`/teacher/classes/${classId}`), [classId]);
  const performance = useAsync<ClassPerformance>(
    () => api<ClassPerformance>(`/teacher/classes/${classId}/performance`),
    [classId],
  );
  const gaps = useAsync<LearningGaps>(
    () => api<LearningGaps>(`/teacher/classes/${classId}/learning-gaps`),
    [classId],
  );

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  function reloadAll() {
    classroom.reload();
    performance.reload();
    gaps.reload();
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api<ClassMember>(`/teacher/classes/${classId}/members`, {
        method: 'POST',
        body: { email: email.trim() },
      });
      setEmail('');
      setMessage(t('teach.memberAdded'));
      reloadAll();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member: ClassMember) {
    if (!window.confirm(t('teach.removeConfirm', { name: member.display_name }))) return;
    setError('');
    try {
      await api<void>(`/teacher/classes/${classId}/members/${member.learner_id}`, { method: 'DELETE' });
      reloadAll();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function rotate() {
    if (!window.confirm(t('teach.rotateConfirm'))) return;
    setError('');
    try {
      await api<ClassDetail>(`/teacher/classes/${classId}/rotate-code`, { method: 'POST' });
      setMessage(t('teach.rotation'));
      classroom.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function removeClass() {
    if (!classroom.data) return;
    if (!window.confirm(t('teach.deleteConfirm', { name: classroom.data.name }))) return;
    setError('');
    try {
      await api<void>(`/teacher/classes/${classId}`, { method: 'DELETE' });
      navigate('/teach', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function copyCode() {
    if (!classroom.data?.join_code) return;
    try {
      await navigator.clipboard.writeText(classroom.data.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (classroom.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (classroom.error || !classroom.data) {
    return (
      <div className="page">
        <ErrorBox message={classroom.error ?? t('common.error')} onRetry={classroom.reload} />
        <Link className="text-link" to="/teach">
          <ArrowLeft size={15} /> {t('nav.teach')}
        </Link>
      </div>
    );
  }

  const detail = classroom.data;
  const perf = performance.data;
  const gapData = gaps.data;

  return (
    <div className="page">
      <Link className="back-link" to="/teach">
        <ArrowLeft size={15} aria-hidden="true" /> {t('nav.teach')}
      </Link>
      <PageHeader
        eyebrow={`${t('learn.class')} ${detail.class_level}`}
        title={detail.name}
        subtitle={`${detail.learner_count} ${t('teach.learners')}`}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={rotate} disabled={busy}>
              <KeyRound size={16} aria-hidden="true" /> {t('teach.rotate')}
            </button>
            <button type="button" className="btn btn-danger" onClick={removeClass}>
              <Trash2 size={16} aria-hidden="true" /> {t('teach.deleteClass')}
            </button>
          </>
        }
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {detail.join_code && (
        <div className="join-banner">
          <div>
            <p className="eyebrow">{t('teach.joinCode')}</p>
            <p className="join-code-big mono">{detail.join_code}</p>
            <p className="small muted">{t('teach.shareCode')}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={copyCode}>
            {copied ? t('teach.copied') : t('teach.copy')}
          </button>
        </div>
      )}

      <section className="stat-grid" aria-label={t('teach.performance')}>
        <StatCard icon={UsersRound} label={t('teach.learners')} value={detail.learner_count} />
        <StatCard label={t('teach.attempts')} value={perf?.attempts ?? 0} />
        <StatCard label={t('teach.average')} value={formatScore(perf?.mean_latest_score ?? null)} />
        <StatCard
          label={t('teach.performance')}
          value={perf ? `${perf.learners_with_attempts}/${perf.learner_count}` : '—'}
          hint={t('teach.attemptsShort')}
        />
      </section>

      <div className="two-column">
        <section className="panel" aria-labelledby="class-members">
          <h2 id="class-members">{t('teach.members')}</h2>
          <form className="inline-form-inline" onSubmit={addMember}>
            <label className="field grow">
              <span className="sr-only">{t('teach.addMember')}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('teach.addMember')}
                required
              />
            </label>
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              <Plus size={15} aria-hidden="true" /> {t('teach.add')}
            </button>
          </form>
          {detail.members.length === 0 ? (
            <p className="muted">{t('teach.noMembers')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('teach.learner')}</th>
                    <th>{t('teach.attemptsShort')}</th>
                    <th>{t('teach.meanScore')}</th>
                    <th aria-label={t('common.delete')} />
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((member) => (
                    <tr key={member.learner_id}>
                      <td>
                        <strong>{member.display_name}</strong>
                        <span className="cell-sub">{member.email}</span>
                      </td>
                      <td>{member.attempts}</td>
                      <td>{formatScore(member.mean_score)}</td>
                      <td>
                        <button
                          type="button"
                          className="icon-button small-icon"
                          onClick={() => removeMember(member)}
                          aria-label={`${t('teach.remove')} ${member.display_name}`}
                          title={t('teach.remove')}
                        >
                          <UserMinus size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="class-gaps">
          <h2 id="class-gaps">{t('teach.gaps')}</h2>
          {gaps.loading && <Loader />}
          {gaps.error && <ErrorBox message={gaps.error} onRetry={gaps.reload} />}
          {!gaps.loading && (gapData?.most_missed_questions ?? []).length === 0 && (
            <p className="muted">{t('teach.noGaps')}</p>
          )}
          <ol className="gap-list">
            {(gapData?.most_missed_questions ?? []).map((gap, index) => (
              <li key={gap.question_id}>
                <span className="gap-rank">{index + 1}</span>
                <div>
                  <p className="gap-prompt">{gap.prompt}</p>
                  <p className="small muted">
                    {gap.lesson_title} · {gap.topic}
                  </p>
                </div>
                <div className="gap-numbers">
                  <strong>{gap.misses}</strong>
                  <span className="small muted">{gap.affected_learners}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="panel" aria-labelledby="class-performance">
        <h2 id="class-performance">{t('teach.performance')}</h2>
        {performance.loading && <Loader />}
        {performance.error && <ErrorBox message={performance.error} onRetry={performance.reload} />}
        {!performance.loading && (perf?.learners ?? []).length === 0 && (
          <p className="muted">{t('teach.noMembers')}</p>
        )}
        {(perf?.learners ?? []).length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('teach.learner')}</th>
                  <th>{t('teach.attemptsShort')}</th>
                  <th>{t('teach.meanScore')}</th>
                  <th>{t('teach.latest')}</th>
                  <th>{t('teach.lastSeen')}</th>
                </tr>
              </thead>
              <tbody>
                {(perf?.learners ?? []).map((learner) => (
                  <tr key={learner.learner_id}>
                    <td>{learner.display_name}</td>
                    <td>{learner.attempts}</td>
                    <td>{formatScore(learner.mean_score)}</td>
                    <td>
                      {learner.latest_score === null ? (
                        <span className="muted">{t('teach.noAttempts')}</span>
                      ) : (
                        formatScore(learner.latest_score)
                      )}
                    </td>
                    <td>{learner.last_attempt_at ? formatDate(learner.last_attempt_at, lang) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
