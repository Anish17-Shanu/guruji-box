import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Quiz, SubmitResult } from '../api/types';
import { Alert, ErrorBox, Loader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';

export function QuizPage() {
  const { id } = useParams();
  const quizId = Number(id);
  const { t } = useI18n();
  const quiz = useAsync<Quiz>(() => api<Quiz>(`/quizzes/${quizId}`), [quizId]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const questions = quiz.data?.questions ?? [];
  const current = questions[index];
  const answeredCount = useMemo(
    () => questions.filter((question) => (answers[question.id] ?? '').trim() !== '').length,
    [questions, answers],
  );

  function choose(value: string) {
    if (!current) return;
    setAnswers((existing) => ({ ...existing, [current.id]: value }));
  }

  async function submit() {
    if (!quiz.data || submitting) return;
    const unanswered = questions.length - answeredCount;
    if (unanswered > 0 && !window.confirm(t('quiz.confirmUnanswered'))) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = questions.map((question) => ({
        question_id: question.id,
        selected: answers[question.id] ?? '',
      }));
      const submission = await api<SubmitResult>('/assessments/submit', {
        method: 'POST',
        body: { quiz_id: quiz.data.id, answers: payload },
      });
      setResult(submission);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setAnswers({});
    setIndex(0);
    setResult(null);
    setError('');
  }

  if (quiz.loading) {
    return (
      <div className="page">
        <Loader label={t('quiz.loading')} />
      </div>
    );
  }
  if (quiz.error || !quiz.data) {
    return (
      <div className="page">
        <ErrorBox message={quiz.error ?? t('common.error')} onRetry={quiz.reload} />
      </div>
    );
  }

  if (result) {
    return (
      <div className="page narrow-page">
        <section className="result-hero">
          <p className="eyebrow">{quiz.data.title}</p>
          <h1>{t('quiz.result.title')}</h1>
          <div className="score-ring" style={{ '--score': `${result.percent}%` } as CSSProperties}>
            <span>
              {result.score}
              <small>/{result.total}</small>
            </span>
          </div>
          <p className="result-mastery">{t('quiz.result.mastery', { mastery: result.mastery })}</p>
          <p className="lede">{result.recommendation}</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to={`/learn/${quiz.data.lesson_id}`}>
              <ArrowLeft size={16} aria-hidden="true" /> {t('quiz.back')}
            </Link>
            <Link className="btn btn-ghost" to="/progress">
              {t('quiz.progress')}
            </Link>
            <button type="button" className="btn btn-quiet" onClick={restart}>
              <RotateCcw size={15} aria-hidden="true" /> {t('quiz.retry')}
            </button>
          </div>
        </section>

        <section aria-labelledby="review-title">
          <h2 id="review-title">{t('quiz.result.review')}</h2>
          <ol className="review-list">
            {result.review.map((item, position) => (
              <li key={item.question_id} className={item.correct ? 'review-item correct' : 'review-item wrong'}>
                <div className="review-head">
                  <span className="badge badge-soft">
                    {position + 1}. {item.topic}
                  </span>
                  <span className={item.correct ? 'verdict verdict-ok' : 'verdict verdict-no'}>
                    {item.correct ? <Check size={14} /> : <X size={14} />}
                    {item.correct ? t('quiz.result.correct') : t('quiz.result.incorrect')}
                  </span>
                </div>
                <p className="review-prompt">{item.prompt}</p>
                <p className="review-line">
                  <span>{t('quiz.result.yourAnswer')}:</span> {item.selected || t('quiz.result.empty')}
                </p>
                {!item.correct && (
                  <p className="review-line">
                    <span>{t('quiz.result.answer')}:</span> {item.answer}
                  </p>
                )}
                {item.explanation && <p className="review-explain">{item.explanation}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow-page">
      <Link className="back-link" to={`/learn/${quiz.data.lesson_id}`}>
        <ArrowLeft size={15} aria-hidden="true" /> {t('quiz.back')}
      </Link>
      <header className="quiz-header">
        <p className="eyebrow">{quiz.data.title}</p>
        <p className="quiz-count">
          {t('quiz.question', { current: index + 1, total: questions.length })}
        </p>
        <div className="quiz-dots" aria-hidden="true">
          {questions.map((question, position) => (
            <span
              key={question.id}
              className={[
                'dot',
                position === index ? 'current' : '',
                (answers[question.id] ?? '').trim() ? 'answered' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      {current && (
        <section className="quiz-card" key={current.id}>
          <h1>{current.prompt}</h1>
          {current.choices.length > 0 ? (
            <fieldset className="choice-list">
              <legend className="sr-only">{t('quiz.choose')}</legend>
              {current.choices.map((choice, choiceIndex) => {
                const selected = answers[current.id] === choice;
                return (
                  <label key={choice} className={selected ? 'choice selected' : 'choice'}>
                    <input
                      type="radio"
                      name={`question-${current.id}`}
                      value={choice}
                      checked={selected}
                      onChange={() => choose(choice)}
                    />
                    <span className="choice-key">{String.fromCharCode(65 + choiceIndex)}</span>
                    <span>{choice}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <label className="field">
              <span>{t('quiz.type')}</span>
              <textarea
                rows={4}
                value={answers[current.id] ?? ''}
                onChange={(event) => choose(event.target.value)}
                maxLength={300}
              />
            </label>
          )}

          <div className="quiz-nav">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              <ArrowLeft size={15} aria-hidden="true" /> {t('quiz.prev')}
            </button>
            {index < questions.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
              >
                {t('quiz.next')} <ArrowRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
                {submitting ? t('quiz.submitting') : t('quiz.submit')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
