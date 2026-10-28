import { ArrowRight, BookOpen, Clock3, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { LessonSummary, ProgressRow, Subject } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorBox, Loader, PageHeader, ProgressBar } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';

export function LearnPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [subject, setSubject] = useState<string>('all');
  const [classLevel, setClassLevel] = useState<string>('all');
  const [query, setQuery] = useState('');

  const subjects = useAsync<Subject[]>(() => api<Subject[]>('/subjects'), []);
  const lessons = useAsync<LessonSummary[]>(() => {
    const params = new URLSearchParams();
    if (subject !== 'all') params.set('subject', subject);
    if (classLevel !== 'all') params.set('class_level', classLevel);
    const suffix = params.toString();
    return api<LessonSummary[]>(`/lessons${suffix ? `?${suffix}` : ''}`);
  }, [subject, classLevel]);
  const progress = useAsync<ProgressRow[]>(
    () => api<ProgressRow[]>('/learners/me/progress'),
    [user?.id],
    Boolean(user),
  );

  const progressByLesson = useMemo(() => {
    const map = new Map<number, ProgressRow>();
    for (const row of progress.data ?? []) map.set(row.lesson_id, row);
    return map;
  }, [progress.data]);

  const levels = useMemo(() => {
    const values = new Set<number>((subjects.data ?? []).map((item) => item.class_level));
    return [...values].sort((a, b) => a - b);
  }, [subjects.data]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return lessons.data ?? [];
    return (lessons.data ?? []).filter((lesson) =>
      [lesson.title, lesson.topic, lesson.summary, lesson.subject].some((field) =>
        field.toLowerCase().includes(needle),
      ),
    );
  }, [lessons.data, query]);

  return (
    <div className="page">
      <PageHeader eyebrow={t('home.eyebrow')} title={t('learn.title')} subtitle={t('learn.subtitle')} />

      <div className="filter-bar">
        <div className="chips" role="group" aria-label={t('learn.subject')}>
          <button
            type="button"
            className={subject === 'all' ? 'chip active' : 'chip'}
            onClick={() => setSubject('all')}
          >
            {t('common.all')}
          </button>
          {(subjects.data ?? []).map((item) => (
            <button
              key={item.id}
              type="button"
              className={subject === item.name ? 'chip active' : 'chip'}
              onClick={() => setSubject(item.name)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="filter-tools">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{t('learn.search')}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('learn.search')}
            />
          </label>
          <label className="inline-field">
            <span>{t('learn.class')}</span>
            <select value={classLevel} onChange={(event) => setClassLevel(event.target.value)}>
              <option value="all">{t('common.all')}</option>
              {levels.map((level) => (
                <option key={level} value={String(level)}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {lessons.loading && <Loader />}
      {lessons.error && <ErrorBox message={lessons.error} onRetry={lessons.reload} />}

      {!lessons.loading && !lessons.error && visible.length === 0 && (
        <EmptyState title={t('learn.empty')} icon={BookOpen} />
      )}

      <section className="lesson-grid" aria-label={t('learn.title')}>
        {visible.map((lesson) => {
          const mastery = progressByLesson.get(lesson.id);
          return (
            <article className="lesson-card" key={lesson.id}>
              <div className="lesson-card-top">
                <span className="badge">{lesson.subject}</span>
                <span className="badge badge-soft">
                  {t('learn.class')} {lesson.class_level}
                </span>
              </div>
              <h2>
                <Link to={`/learn/${lesson.id}`}>{lesson.title}</Link>
              </h2>
              <p className="muted">{lesson.summary}</p>
              <div className="lesson-meta">
                <span>
                  <Clock3 size={14} aria-hidden="true" /> {lesson.estimated_minutes} {t('learn.minutes')}
                </span>
                <span className="badge badge-soft">{lesson.topic}</span>
              </div>
              {mastery ? (
                <div className="lesson-progress">
                  <ProgressBar value={mastery.mastery} label={t('learn.yourProgress')} />
                </div>
              ) : (
                <p className="small muted">{user ? t('learn.yourProgress') + ': —' : t('learn.new')}</p>
              )}
              <Link className="text-link" to={`/learn/${lesson.id}`}>
                {t('learn.open')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
