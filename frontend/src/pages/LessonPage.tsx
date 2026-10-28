import { ArrowLeft, ArrowRight, Clock3, ListChecks } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { LessonDetail } from '../api/types';
import { TutorPanel } from '../components/TutorPanel';
import { ErrorBox, Loader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';

export function LessonPage() {
  const { id } = useParams();
  const lessonId = Number(id);
  const { t } = useI18n();
  const lesson = useAsync<LessonDetail>(() => api<LessonDetail>(`/lessons/${lessonId}`), [lessonId]);

  if (lesson.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (lesson.error || !lesson.data) {
    return (
      <div className="page">
        <ErrorBox message={lesson.error ?? t('common.error')} onRetry={lesson.reload} />
        <Link className="text-link" to="/learn">
          <ArrowLeft size={15} aria-hidden="true" /> {t('learn.title')}
        </Link>
      </div>
    );
  }

  const detail = lesson.data;

  return (
    <div className="page">
      <Link className="back-link" to="/learn">
        <ArrowLeft size={15} aria-hidden="true" /> {t('learn.title')}
      </Link>

      <header className="lesson-header">
        <div className="lesson-card-top">
          <span className="badge">{detail.subject}</span>
          <span className="badge badge-soft">
            {t('learn.class')} {detail.class_level}
          </span>
          <span className="badge badge-soft">{detail.topic}</span>
        </div>
        <h1>{detail.title}</h1>
        <p className="lede">{detail.summary}</p>
        <p className="lesson-meta-line">
          <Clock3 size={15} aria-hidden="true" /> {detail.estimated_minutes} {t('learn.minutes')} ·{' '}
          <ListChecks size={15} aria-hidden="true" /> {detail.sections.length} {t('lesson.overview')}
        </p>
      </header>

      <div className="lesson-layout">
        <article className="lesson-body">
          {detail.sections.map((section) => (
            <section key={section.id} id={`section-${section.id}`} className="lesson-section">
              <h2>{section.heading}</h2>
              <p>{section.passage}</p>
            </section>
          ))}

          {detail.quiz_id && (
            <section className="quiz-cta">
              <div>
                <h2>{t('lesson.quizCta')}</h2>
                <p className="muted">{t('lesson.quizBody')}</p>
              </div>
              <Link className="btn btn-primary" to={`/quiz/${detail.quiz_id}`}>
                {t('learn.quiz')} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          )}

          {detail.attribution && (
            <footer className="attribution">
              <strong>{t('lesson.attribution')}:</strong> {detail.attribution}
              {detail.license && <span className="badge badge-soft">{detail.license}</span>}
            </footer>
          )}
        </article>

        <div className="lesson-side">
          <nav className="toc" aria-label={t('lesson.overview')}>
            <h2>{t('lesson.overview')}</h2>
            <ol>
              {detail.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#section-${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
          <TutorPanel lessonId={detail.id} />
        </div>
      </div>
    </div>
  );
}
