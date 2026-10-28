import { ArrowLeft, CheckCircle2, Pencil, Plus, Printer, RotateCcw, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type {
  QuestionKind,
  Worksheet,
  WorksheetContent,
  WorksheetQuestion,
} from '../api/types';
import { Alert, ErrorBox, Loader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';

const KINDS: Array<{ value: QuestionKind; key: 'worksheets.shortAnswer' | 'worksheets.fillBlank' | 'worksheets.mcq' | 'worksheets.trueFalse' }> = [
  { value: 'short_answer', key: 'worksheets.shortAnswer' },
  { value: 'fill_blank', key: 'worksheets.fillBlank' },
  { value: 'mcq', key: 'worksheets.mcq' },
  { value: 'true_false', key: 'worksheets.trueFalse' },
];

function kindLabel(kind: QuestionKind, t: ReturnType<typeof useI18n>['t']) {
  return t(KINDS.find((item) => item.value === kind)?.key ?? 'worksheets.shortAnswer');
}

function blankQuestion(): WorksheetQuestion {
  return {
    kind: 'short_answer',
    prompt: '',
    choices: null,
    answer_key: '',
    explanation: '',
    source_section: '',
  };
}

export function WorksheetDetailPage() {
  const { id } = useParams();
  const worksheetId = Number(id);
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const worksheet = useAsync<Worksheet>(() => api<Worksheet>(`/worksheets/${worksheetId}`), [worksheetId]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorksheetContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (worksheet.data) {
      setDraft({
        ...worksheet.data.content,
        questions: worksheet.data.content.questions.map((question) => ({ ...question })),
      });
    }
  }, [worksheet.data]);

  if (worksheet.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (worksheet.error || !worksheet.data) {
    return (
      <div className="page">
        <ErrorBox message={worksheet.error ?? t('common.error')} onRetry={worksheet.reload} />
        <Link className="text-link" to="/worksheets">
          <ArrowLeft size={15} /> {t('nav.worksheets')}
        </Link>
      </div>
    );
  }

  const data = worksheet.data;
  const approved = data.status === 'APPROVED';

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!draft) return;
    if (!draft.title.trim()) {
      setError(t('worksheets.titleField'));
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Worksheet>(`/worksheets/${worksheetId}`, {
        method: 'PATCH',
        body: { content: draft },
      });
      worksheet.setData(updated);
      setEditing(false);
      setMessage(t('worksheets.saved'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'APPROVED' | 'DRAFT') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await api<Worksheet>(`/worksheets/${worksheetId}`, {
        method: 'PATCH',
        body: { status },
      });
      worksheet.setData(updated);
      setMessage(status === 'APPROVED' ? t('worksheets.approvedNotice') : t('worksheets.reopened'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t('worksheets.deleteConfirm'))) return;
    try {
      await api<void>(`/worksheets/${worksheetId}`, { method: 'DELETE' });
      navigate('/worksheets', { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function patchQuestion(index: number, changes: Partial<WorksheetQuestion>) {
    setDraft((current) => {
      if (!current) return current;
      const questions = current.questions.map((question, position) =>
        position === index ? { ...question, ...changes } : question,
      );
      return { ...current, questions };
    });
  }

  return (
    <div className="page worksheet-detail">
      <Link className="back-link no-print" to="/worksheets">
        <ArrowLeft size={15} aria-hidden="true" /> {t('worksheets.title')}
      </Link>

      <div className="worksheet-toolbar no-print">
        <div>
          <span className={approved ? 'status approved' : 'status draft'}>
            {approved ? t('worksheets.approved') : t('worksheets.draft')}
          </span>
          <span className="small muted">
            {data.subject} · {data.topic} · {t('learn.class')} {data.class_level} ·{' '}
            {formatDate(data.updated_at, lang)}
          </span>
        </div>
        <div className="page-actions">
          {approved ? (
            <button type="button" className="btn btn-quiet" onClick={() => setStatus('DRAFT')} disabled={busy}>
              <RotateCcw size={15} aria-hidden="true" /> {t('worksheets.reopen')}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setStatus('APPROVED')} disabled={busy}>
              <CheckCircle2 size={15} aria-hidden="true" /> {t('worksheets.approve')}
            </button>
          )}
          {!editing ? (
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
              <Pencil size={15} aria-hidden="true" /> {t('common.edit')}
            </button>
          ) : (
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
              <X size={15} aria-hidden="true" /> {t('common.cancel')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
            disabled={editing}
          >
            <Printer size={15} aria-hidden="true" /> {t('common.print')}
          </button>
          <button type="button" className="btn btn-danger" onClick={remove}>
            <Trash2 size={15} aria-hidden="true" /> {t('common.delete')}
          </button>
        </div>
      </div>

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {approved && <p className="small muted no-print">{t('worksheets.printHint')}</p>}

      {editing && draft ? (
        <form className="worksheet-editor" onSubmit={save}>
          <label className="field">
            <span>{t('worksheets.titleField')}</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              maxLength={200}
              required
            />
          </label>
          <label className="field">
            <span>{t('worksheets.instructions')}</span>
            <textarea
              rows={3}
              value={draft.instructions}
              onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            />
          </label>

          <ol className="editor-questions">
            {draft.questions.map((question, index) => (
              <li key={index} className="editor-question">
                <div className="editor-question-head">
                  <h2>{t('worksheets.question', { n: index + 1 })}</h2>
                  <button
                    type="button"
                    className="icon-button small-icon"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        questions: draft.questions.filter((_, position) => position !== index),
                      })
                    }
                    aria-label={t('worksheets.removeQuestion')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="form-row">
                  <label className="field">
                    <span>{t('worksheets.formats')}</span>
                    <select
                      value={question.kind}
                      onChange={(event) => {
                        const kind = event.target.value as QuestionKind;
                        patchQuestion(index, {
                          kind,
                          choices: kind === 'mcq' ? question.choices ?? [] : null,
                        });
                      }}
                    >
                      {KINDS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {t(item.key)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t('worksheets.source')}</span>
                    <input
                      value={question.source_section}
                      onChange={(event) => patchQuestion(index, { source_section: event.target.value })}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>{t('worksheets.question', { n: index + 1 })}</span>
                  <textarea
                    rows={2}
                    value={question.prompt}
                    onChange={(event) => patchQuestion(index, { prompt: event.target.value })}
                    required
                  />
                </label>
                {question.kind === 'mcq' && (
                  <label className="field">
                    <span>{t('worksheets.choices')}</span>
                    <textarea
                      rows={4}
                      value={(question.choices ?? []).join('\n')}
                      onChange={(event) =>
                        patchQuestion(index, {
                          choices: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                        })
                      }
                    />
                  </label>
                )}
                <div className="form-row">
                  <label className="field grow">
                    <span>{t('worksheets.answerKey')}</span>
                    <input
                      value={question.answer_key}
                      onChange={(event) => patchQuestion(index, { answer_key: event.target.value })}
                    />
                  </label>
                  <label className="field grow">
                    <span>{t('worksheets.explanation')}</span>
                    <input
                      value={question.explanation}
                      onChange={(event) => patchQuestion(index, { explanation: event.target.value })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}
            >
              <Plus size={15} aria-hidden="true" /> {t('worksheets.addQuestion')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('common.saving') : t('worksheets.save')}
            </button>
          </div>
          <p className="small muted">{t('worksheets.editing')}</p>
        </form>
      ) : (
        <article className="print-sheet">
          <header className="sheet-head">
            <p className="sheet-kicker">
              Guruji Box · {data.subject} · {t('learn.class')} {data.class_level}
            </p>
            <h1>{data.title}</h1>
            <p className="small muted">
              {t('worksheets.difficulty')}: {data.difficulty} · {t('worksheets.questions', { count: data.content.questions.length })}
            </p>
          </header>
          {data.content.instructions && <p className="sheet-instructions">{data.content.instructions}</p>}
          <ol className="sheet-questions">
            {data.content.questions.map((question, index) => (
              <li key={index}>
                <div className="sheet-question-head">
                  <span className="sheet-number">{index + 1}</span>
                  <div>
                    <p className="sheet-prompt">{question.prompt}</p>
                    <p className="small muted">{kindLabel(question.kind, t)}</p>
                  </div>
                </div>
                {question.kind === 'mcq' && question.choices && (
                  <ol className="sheet-choices" type="A">
                    {question.choices.map((choice) => (
                      <li key={choice}>{choice}</li>
                    ))}
                  </ol>
                )}
                {question.kind === 'short_answer' && <div className="answer-lines" aria-hidden="true" />}
                <div className="answer-key">
                  <span>{t('worksheets.answerKey')}:</span> {question.answer_key}
                  {question.explanation && <em> — {question.explanation}</em>}
                </div>
              </li>
            ))}
          </ol>
          <footer className="sheet-footer">
            <span>{data.sources.map((source) => source.lesson_title).join(' · ')}</span>
            <span>{t('worksheets.answerNote')}</span>
          </footer>
        </article>
      )}

      {data.sources.length > 0 && (
        <section className="attribution no-print" aria-labelledby="worksheet-sources">
          <h2 id="worksheet-sources">{t('lesson.attribution')}</h2>
          <ul>
            {data.sources.map((source) => (
              <li key={source.lesson_id}>
                <strong>{source.lesson_title}</strong>
                {source.attribution && <span> — {source.attribution}</span>}
                {source.license && <span className="badge badge-soft">{source.license}</span>}
              </li>
            ))}
          </ul>
          <p className="small muted">
            {t('worksheets.generatedBy')}: {data.generated_by}
            {data.model_name ? ` (${data.model_name})` : ''}
          </p>
        </section>
      )}
    </div>
  );
}
