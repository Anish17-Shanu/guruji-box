import { ArrowRight, BookOpen, GraduationCap, Sparkles, Target, UsersRound } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type {
  Attempt,
  LearnerClass,
  ProgressRow,
  SkillCourseProgress,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import {
  Alert,
  EmptyState,
  ErrorBox,
  Loader,
  PageHeader,
  ProgressBar,
  StatCard,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate, formatScore } from '../lib/format';

export function ProgressPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isLearner = user?.role === 'LEARNER';

  const progress = useAsync<ProgressRow[]>(() => api<ProgressRow[]>('/learners/me/progress'), []);
  const history = useAsync<Attempt[]>(() => api<Attempt[]>('/assessments/history'), []);
  const classes = useAsync<LearnerClass[]>(
    () => api<LearnerClass[]>('/learners/me/classes'),
    [isLearner],
    isLearner,
  );
  const skills = useAsync<SkillCourseProgress[]>(() => api<SkillCourseProgress[]>('/skills/progress/me'), []);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');
  const [joinError, setJoinError] = useState('');

  const rows = progress.data ?? [];
  const lessonsStarted = rows.length;
  const average = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((total, row) => total + row.mastery, 0) / rows.length);
  }, [rows]);
  const attemptCount = useMemo(() => rows.reduce((total, row) => total + row.attempts, 0), [rows]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    setJoinMessage('');
    setJoinError('');
    try {
      const joined = await api<LearnerClass>('/learners/me/classes/join', {
        method: 'POST',
        body: { code: code.trim().toUpperCase() },
      });
      setJoinMessage(t('progress.joined', { name: joined.name }));
      setCode('');
      classes.reload();
    } catch (caught) {
      setJoinError(errorMessage(caught));
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow={t('nav.progress')} title={t('progress.title')} subtitle={t('progress.subtitle')} />

      {progress.error && <ErrorBox message={progress.error} onRetry={progress.reload} />}

      <section className="stat-grid" aria-label={t('progress.title')}>
        <StatCard icon={BookOpen} label={t('progress.lessons')} value={lessonsStarted} />
        <StatCard icon={Target} label={t('progress.average')} value={`${average}%`} />
        <StatCard icon={GraduationCap} label={t('progress.attempts')} value={attemptCount} />
      </section>

      {progress.loading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('progress.empty')}
          action={
            <Link className="btn btn-primary" to="/learn">
              {t('nav.learn')}
            </Link>
          }
        />
      ) : (
        <section className="panel" aria-labelledby="progress-lessons">
          <h2 id="progress-lessons">{t('progress.lessonsTitle')}</h2>
          <ul className="progress-list">
            {rows.map((row) => (
              <li key={row.lesson_id} className="progress-row">
                <div className="progress-row-head">
                  <div>
                    <Link to={`/learn/${row.lesson_id}`} className="progress-title">
                      {row.title}
                    </Link>
                    <p className="small muted">
                      {row.subject} · {row.topic} · {row.attempts} {t('teach.attemptsShort')}
                    </p>
                  </div>
                  <span className="small muted">
                    {row.last_attempt_at ? formatDate(row.last_attempt_at, lang) : '—'}
                  </span>
                </div>
                <ProgressBar value={row.mastery} label={row.title} />
                <p className="recommendation">
                  <strong>{t('progress.recommendation')}:</strong> {row.recommendation}
                </p>
                <Link className="text-link small" to={`/learn/${row.lesson_id}`}>
                  {t('learn.open')} <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="two-column">
        <section className="panel" aria-labelledby="recent-attempts">
          <h2 id="recent-attempts">{t('progress.recent')}</h2>
          {history.loading && <Loader />}
          {history.error && <ErrorBox message={history.error} onRetry={history.reload} />}
          {!history.loading && (history.data ?? []).length === 0 && (
            <p className="muted">{t('progress.noRecent')}</p>
          )}
          <ul className="attempt-list">
            {(history.data ?? []).slice(0, 6).map((attempt) => (
              <li key={attempt.id}>
                <div>
                  <strong>{attempt.lesson_title}</strong>
                  <p className="small muted">{formatDate(attempt.created_at, lang, true)}</p>
                </div>
                <span className="score-pill">{formatScore(attempt.percent)}</span>
                <Link className="text-link small" to={`/history/${attempt.id}`}>
                  {t('progress.review')} <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {isLearner && (
          <section className="panel" aria-labelledby="my-classes">
            <h2 id="my-classes">{t('progress.classes')}</h2>
            {classes.loading && <Loader />}
            {classes.error && <ErrorBox message={classes.error} onRetry={classes.reload} />}
            {!classes.loading && (classes.data ?? []).length === 0 && (
              <p className="muted">{t('progress.noClasses')}</p>
            )}
            <ul className="class-list compact">
              {(classes.data ?? []).map((classroom) => (
                <li key={classroom.id}>
                  <span className="class-icon">
                    <UsersRound size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{classroom.name}</strong>
                    <p className="small muted">
                      {classroom.teacher_name} · {t('learn.class')} {classroom.class_level}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <form className="join-form" onSubmit={join}>
              <label className="field">
                <span>{t('progress.joinCode')}</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="DEMO01"
                  maxLength={12}
                  autoComplete="off"
                  required
                />
              </label>
              <button type="submit" className="btn btn-secondary" disabled={joining}>
                {t('progress.join')}
              </button>
            </form>
            {joinMessage && <Alert tone="success">{joinMessage}</Alert>}
            {joinError && <Alert tone="error">{joinError}</Alert>}
          </section>
        )}
      </div>

      <section className="panel" aria-labelledby="progress-skills">
        <h2 id="progress-skills">
          <Sparkles size={18} aria-hidden="true" /> {t('progress.skills')}
        </h2>
        {skills.loading && <Loader />}
        {!skills.loading && (skills.data ?? []).length === 0 && (
          <p className="muted">{t('progress.skillsEmpty')}</p>
        )}
        <ul className="skill-progress-list">
          {(skills.data ?? []).map((course) => (
            <li key={course.id}>
              <div className="progress-row-head">
                <Link to={`/skills/${course.id}`} className="progress-title">
                  {course.title}
                </Link>
                <span className="small muted">
                  {t('skills.complete', { done: course.completed, total: course.total })}
                </span>
              </div>
              <ProgressBar
                value={course.total ? (course.completed / course.total) * 100 : 0}
                label={course.title}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
