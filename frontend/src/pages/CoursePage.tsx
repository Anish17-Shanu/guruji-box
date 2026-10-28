import { ArrowLeft, Check, Circle, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { SkillCourseDetail, SkillProgress } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Alert, ErrorBox, Loader, PageHeader, ProgressBar } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';

export function CoursePage() {
  const { id } = useParams();
  const courseId = Number(id);
  const { t } = useI18n();
  const { user } = useAuth();
  const course = useAsync<SkillCourseDetail>(() => api<SkillCourseDetail>(`/skills/courses/${courseId}`), [courseId]);
  const [completed, setCompleted] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (course.data) {
      setCompleted(
        Object.fromEntries(course.data.lessons.map((lesson) => [lesson.id, lesson.completed])),
      );
    }
  }, [course.data]);

  const doneCount = useMemo(
    () => Object.values(completed).filter(Boolean).length,
    [completed],
  );

  async function toggle(lessonId: number) {
    if (!user || busy) return;
    const next = !completed[lessonId];
    setBusy(lessonId);
    setError('');
    try {
      const progress = await api<SkillProgress>('/skills/progress', {
        method: 'POST',
        body: { lesson_id: lessonId, completed: next },
      });
      setCompleted((current) => ({ ...current, [lessonId]: progress.completed }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  if (course.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (course.error || !course.data) {
    return (
      <div className="page">
        <ErrorBox message={course.error ?? t('common.error')} onRetry={course.reload} />
      </div>
    );
  }

  const detail = course.data;

  return (
    <div className="page">
      <Link className="back-link" to="/skills">
        <ArrowLeft size={15} aria-hidden="true" /> {t('skills.back')}
      </Link>
      <PageHeader
        eyebrow={t('nav.skills')}
        title={detail.title}
        subtitle={detail.description}
        actions={
          <div className="course-progress">
            <ProgressBar
              value={detail.lessons.length ? (doneCount / detail.lessons.length) * 100 : 0}
              label={detail.title}
            />
            <span className="small muted">
              {t('skills.complete', { done: doneCount, total: detail.lessons.length })}
            </span>
          </div>
        }
      />

      {!user && (
        <Alert tone="info">
          {t('lesson.guest')}{' '}
          <Link to="/login">{t('nav.signIn')}</Link>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <ol className="skill-lessons">
        {detail.lessons.map((lesson, index) => {
          const isDone = Boolean(completed[lesson.id]);
          return (
            <li key={lesson.id} className={isDone ? 'skill-lesson done' : 'skill-lesson'}>
              <div className="skill-lesson-head">
                <span className="lesson-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2>{lesson.title}</h2>
                {isDone && (
                  <span className="verdict verdict-ok">
                    <Check size={14} aria-hidden="true" /> {t('skills.done')}
                  </span>
                )}
              </div>
              <div className="skill-body">{lesson.body}</div>
              {user ? (
                <button
                  type="button"
                  className={isDone ? 'btn btn-quiet btn-small' : 'btn btn-secondary btn-small'}
                  onClick={() => toggle(lesson.id)}
                  disabled={busy === lesson.id}
                  aria-pressed={isDone}
                >
                  {isDone ? <Circle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                  {isDone ? t('skills.markUndone') : t('skills.markDone')}
                </button>
              ) : (
                <Link className="text-link small" to="/login">
                  <Sparkles size={13} aria-hidden="true" /> {t('nav.signIn')}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
