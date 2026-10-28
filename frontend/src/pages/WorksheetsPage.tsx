import { ArrowRight, FileText, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { LessonSummary, Worksheet, WorksheetSummary } from '../api/types';
import {
  Alert,
  EmptyState,
  ErrorBox,
  Loader,
  PageHeader,
} from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';

const FORMATS = [
  { value: 'short_answer', key: 'worksheets.shortAnswer' },
  { value: 'fill_blank', key: 'worksheets.fillBlank' },
  { value: 'mcq', key: 'worksheets.mcq' },
  { value: 'true_false', key: 'worksheets.trueFalse' },
] as const;

const DIFFICULTIES = [
  { value: 'easy', key: 'worksheets.easy' },
  { value: 'medium', key: 'worksheets.medium' },
  { value: 'hard', key: 'worksheets.hard' },
] as const;

export function WorksheetsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<string>(params.get('status') ?? 'all');
  const worksheets = useAsync<WorksheetSummary[]>(
    () => api<WorksheetSummary[]>(`/worksheets${status === 'all' ? '' : `?status=${status}`}`),
    [status],
  );
  const lessons = useAsync<LessonSummary[]>(() => api<LessonSummary[]>('/lessons'), []);
  const [showForm, setShowForm] = useState(false);

  const [lessonId, setLessonId] = useState('');
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('');
  const [classLevel, setClassLevel] = useState('6');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState('8');
  const [formats, setFormats] = useState<string[]>(['short_answer', 'fill_blank', 'mcq']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function pickLesson(value: string) {
    setLessonId(value);
    const lesson = (lessons.data ?? []).find((item) => String(item.id) === value);
    if (lesson) {
      setTopic(lesson.topic);
      setSubject(lesson.subject);
      setClassLevel(String(lesson.class_level));
    }
  }

  function toggleFormat(value: string) {
    setFormats((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formats.length) {
      setError(t('worksheets.needFormat'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const worksheet = await api<Worksheet>('/worksheets/generate', {
        method: 'POST',
        body: {
          lesson_id: lessonId ? Number(lessonId) : null,
          topic: topic.trim(),
          subject: subject.trim(),
          class_level: Number(classLevel),
          difficulty,
          count: Number(count),
          formats,
        },
      });
      navigate(`/worksheets/${worksheet.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove(worksheet: WorksheetSummary) {
    if (!window.confirm(t('worksheets.deleteConfirm'))) return;
    try {
      await api<void>(`/worksheets/${worksheet.id}`, { method: 'DELETE' });
      worksheets.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('nav.worksheets')}
        title={t('worksheets.title')}
        subtitle={t('worksheets.subtitle')}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((open) => !open)}>
            <Plus size={16} aria-hidden="true" /> {t('worksheets.generate')}
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      {showForm && (
        <form className="panel worksheet-form" onSubmit={generate}>
          <h2>{t('worksheets.generate')}</h2>
          <div className="form-row">
            <label className="field grow">
              <span>{t('worksheets.lesson')}</span>
              <select value={lessonId} onChange={(event) => pickLesson(event.target.value)}>
                <option value="">{t('worksheets.lessonNone')}</option>
                {(lessons.data ?? []).map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title} — {lesson.topic} ({lesson.subject})
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>{t('worksheets.topic')}</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                required
                maxLength={100}
                placeholder="Fractions"
              />
            </label>
          </div>
          <div className="form-row">
            <label className="field">
              <span>{t('worksheets.subject')}</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={80}
                placeholder="Mathematics"
              />
            </label>
            <label className="field">
              <span>{t('worksheets.difficulty')}</span>
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                {DIFFICULTIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('learn.class')}</span>
              <select value={classLevel} onChange={(event) => setClassLevel(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('worksheets.count')}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                required
              />
            </label>
          </div>
          <fieldset className="check-row">
            <legend>{t('worksheets.formats')}</legend>
            {FORMATS.map((item) => (
              <label key={item.value} className="check">
                <input
                  type="checkbox"
                  checked={formats.includes(item.value)}
                  onChange={() => toggleFormat(item.value)}
                />
                <span>{t(item.key)}</span>
              </label>
            ))}
          </fieldset>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('worksheets.creating') : t('worksheets.create')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="tab-bar" role="tablist" aria-label={t('worksheets.filter')}>
        {['all', 'DRAFT', 'APPROVED'].map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            className={status === value ? 'tab active' : 'tab'}
            onClick={() => setStatus(value)}
          >
            {value === 'all'
              ? t('worksheets.all')
              : value === 'DRAFT'
                ? t('worksheets.draft')
                : t('worksheets.approved')}
          </button>
        ))}
      </div>

      {worksheets.loading && <Loader />}
      {worksheets.error && <ErrorBox message={worksheets.error} onRetry={worksheets.reload} />}
      {!worksheets.loading && (worksheets.data ?? []).length === 0 && (
        <EmptyState
          icon={FileText}
          title={t('worksheets.empty')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} aria-hidden="true" /> {t('worksheets.generate')}
            </button>
          }
        />
      )}

      <section className="worksheet-grid" aria-label={t('worksheets.title')}>
        {(worksheets.data ?? []).map((worksheet) => (
          <article className="worksheet-card" key={worksheet.id}>
            <div className="lesson-card-top">
              <span className={worksheet.status === 'APPROVED' ? 'status approved' : 'status draft'}>
                {worksheet.status === 'APPROVED' ? t('worksheets.approved') : t('worksheets.draft')}
              </span>
              <span className="small muted">{worksheet.generated_by}</span>
            </div>
            <h2>
              <Link to={`/worksheets/${worksheet.id}`}>{worksheet.title}</Link>
            </h2>
            <p className="small muted">
              {worksheet.subject || '—'} · {worksheet.topic} · {t('learn.class')} {worksheet.class_level}
            </p>
            <p className="small muted">
              {t('worksheets.questions', { count: worksheet.question_count })} ·{' '}
              {formatDate(worksheet.updated_at, lang)}
            </p>
            <div className="worksheet-actions">
              <Link className="text-link" to={`/worksheets/${worksheet.id}`}>
                {t('common.open')} <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="icon-button small-icon"
                onClick={() => remove(worksheet)}
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
