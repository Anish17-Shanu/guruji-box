import { ArrowRight, Circle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { SkillCourseSummary } from '../api/types';
import { EmptyState, ErrorBox, Loader, PageHeader, ProgressBar } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';

export function SkillsPage() {
  const { t } = useI18n();
  const courses = useAsync<SkillCourseSummary[]>(() => api<SkillCourseSummary[]>('/skills/courses'), []);

  return (
    <div className="page">
      <PageHeader eyebrow={t('home.eyebrow')} title={t('skills.title')} subtitle={t('skills.subtitle')} />

      {courses.loading && <Loader />}
      {courses.error && <ErrorBox message={courses.error} onRetry={courses.reload} />}
      {!courses.loading && (courses.data ?? []).length === 0 && (
        <EmptyState icon={Sparkles} title={t('skills.empty')} />
      )}

      <section className="course-grid" aria-label={t('skills.title')}>
        {(courses.data ?? []).map((course, index) => {
          const percent = course.lesson_count ? (course.completed_count / course.lesson_count) * 100 : 0;
          return (
            <article className="course-card" key={course.id}>
              <span className="course-number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h2>{course.title}</h2>
              <p className="muted">{course.description}</p>
              <p className="small muted">{t('skills.lessons', { count: course.lesson_count })}</p>
              {course.completed_count > 0 ? (
                <>
                  <ProgressBar
                    value={percent}
                    label={t('skills.complete', {
                      done: course.completed_count,
                      total: course.lesson_count,
                    })}
                  />
                  <p className="small muted">
                    {t('skills.complete', { done: course.completed_count, total: course.lesson_count })}
                  </p>
                </>
              ) : (
                <p className="course-state">
                  <Circle size={16} aria-hidden="true" />
                  {t('skills.complete', { done: course.completed_count, total: course.lesson_count })}
                </p>
              )}
              <Link className="text-link" to={`/skills/${course.id}`}>
                {t('skills.resume')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
