import { ArrowLeft, Check, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { AttemptDetail } from '../api/types';
import { ErrorBox, Loader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate, formatScore } from '../lib/format';

export function AttemptDetailPage() {
  const { id } = useParams();
  const attemptId = Number(id);
  const { t, lang } = useI18n();
  const attempt = useAsync<AttemptDetail>(() => api<AttemptDetail>(`/assessments/${attemptId}`), [attemptId]);

  if (attempt.loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }
  if (attempt.error || !attempt.data) {
    return (
      <div className="page">
        <ErrorBox message={attempt.error ?? t('common.error')} onRetry={attempt.reload} />
      </div>
    );
  }

  const detail = attempt.data;

  return (
    <div className="page narrow-page">
      <Link className="back-link" to="/progress">
        <ArrowLeft size={15} aria-hidden="true" /> {t('nav.progress')}
      </Link>
      <header className="attempt-header">
        <div>
          <p className="eyebrow">{detail.quiz_title}</p>
          <h1>{detail.lesson_title}</h1>
          <p className="muted">{formatDate(detail.created_at, lang, true)}</p>
        </div>
        <div className="attempt-score">
          <strong>{formatScore(detail.percent)}</strong>
          <span className="small muted">
            {detail.score}/{detail.total}
          </span>
        </div>
      </header>

      <ol className="review-list">
        {detail.review.map((item, position) => (
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
    </div>
  );
}
