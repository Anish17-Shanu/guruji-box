import { ArrowLeft, MessageCircleQuestion, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { TutorSessionDetail, TutorSessionSummary } from '../api/types';
import { Alert, EmptyState, ErrorBox, Loader, PageHeader } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';

export function TutorHistoryPage() {
  const { t, lang } = useI18n();
  const sessions = useAsync<TutorSessionSummary[]>(() => api<TutorSessionSummary[]>('/tutor/sessions'), []);
  const [selected, setSelected] = useState<TutorSessionDetail | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function open(sessionId: number) {
    if (selected?.id === sessionId) {
      setSelected(null);
      return;
    }
    setLoadingId(sessionId);
    setError('');
    try {
      const detail = await api<TutorSessionDetail>(`/tutor/sessions/${sessionId}`);
      setSelected(detail);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingId(null);
    }
  }

  async function remove(sessionId: number) {
    if (!window.confirm(t('common.delete') + '?')) return;
    setError('');
    try {
      await api<void>(`/tutor/sessions/${sessionId}`, { method: 'DELETE' });
      if (selected?.id === sessionId) setSelected(null);
      sessions.reload();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="page narrow-page">
      <PageHeader
        eyebrow={t('lesson.tutor')}
        title={t('lesson.history')}
        subtitle={t('lesson.noHistory')}
        actions={
          <Link className="btn btn-ghost" to="/learn">
            <ArrowLeft size={15} aria-hidden="true" /> {t('nav.learn')}
          </Link>
        }
      />

      {sessions.loading && <Loader />}
      {sessions.error && <ErrorBox message={sessions.error} onRetry={sessions.reload} />}
      {error && <Alert tone="error">{error}</Alert>}
      {!sessions.loading && (sessions.data ?? []).length === 0 && (
        <EmptyState
          icon={MessageCircleQuestion}
          title={t('lesson.noHistory')}
          action={
            <Link className="btn btn-primary" to="/learn">
              {t('nav.learn')}
            </Link>
          }
        />
      )}

      <ul className="session-list">
        {(sessions.data ?? []).map((session) => (
          <li key={session.id} className="session-item">
            <div className="session-head">
              <button type="button" className="session-open" onClick={() => open(session.id)}>
                <strong>{session.lesson_title}</strong>
                <span className="small muted">
                  {formatDate(session.created_at, lang, true)} · {session.message_count}{' '}
                  {t('lesson.history').toLowerCase()}
                </span>
              </button>
              <button
                type="button"
                className="icon-button small-icon"
                onClick={() => remove(session.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {loadingId === session.id && <Loader />}
            {selected?.id === session.id && (
              <div className="tutor-thread session-thread">
                {selected.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`bubble bubble-${message.role === 'user' ? 'user' : 'assistant'}`}
                  >
                    <p>{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
