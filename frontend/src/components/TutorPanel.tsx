import { MessageCircleQuestion, Send, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { TutorAnswer, TutorSessionDetail, TutorSessionSummary, TutorSource } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { Alert, Loader } from './ui';

interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: TutorSource[];
}

export function TutorPanel({ lessonId }: { lessonId: number }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(user));
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setThread([]);
      return;
    }
    let active = true;
    setLoadingHistory(true);
    (async () => {
      try {
        const sessions = await api<TutorSessionSummary[]>('/tutor/sessions');
        const latest = sessions.find((session) => session.lesson_id === lessonId);
        if (!latest) return;
        const detail = await api<TutorSessionDetail>(`/tutor/sessions/${latest.id}`);
        if (!active) return;
        setThread(
          detail.messages.map((message) => ({
            role: message.role === 'user' ? 'user' : 'assistant',
            content: message.content,
          })),
        );
      } catch {
        // History is a convenience; asking still works without it.
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [lessonId, user]);

  useEffect(() => {
    if (thread.length) bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [thread.length, asking]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (text.length < 2 || asking) return;
    setAsking(true);
    setError('');
    setThread((current) => [...current, { role: 'user', content: text }]);
    setQuestion('');
    try {
      const answer = await api<TutorAnswer>('/tutor/chat', {
        method: 'POST',
        body: { lesson_id: lessonId, question: text },
      });
      setThread((current) => [
        ...current,
        { role: 'assistant', content: answer.answer, sources: answer.sources },
      ]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAsking(false);
    }
  }

  return (
    <aside className="tutor" aria-labelledby="tutor-title">
      <div className="tutor-head">
        <span className="feature-icon feature-icon-small">
          <MessageCircleQuestion size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 id="tutor-title">{t('lesson.tutor')}</h2>
          <p className="small muted">{t('lesson.tutorHint')}</p>
        </div>
      </div>

      {!user ? (
        <div className="tutor-guest">
          <p>{t('lesson.guest')}</p>
          <Link className="btn btn-primary btn-small" to="/login" state={{ from: location.pathname }}>
            {t('nav.signIn')}
          </Link>
        </div>
      ) : loadingHistory ? (
        <Loader />
      ) : (
        <>
          <div className="tutor-thread" aria-live="polite">
            {thread.length === 0 && <p className="small muted">{t('lesson.aiNote')}</p>}
            {thread.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`bubble bubble-${message.role}`}>
                <p>{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <p className="bubble-sources">
                    <Sparkles size={12} aria-hidden="true" /> {t('lesson.sources')}{' '}
                    {message.sources.map((source) => source.heading).join(' · ')}
                  </p>
                )}
              </div>
            ))}
            {asking && (
              <div className="bubble bubble-assistant bubble-pending">
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="small muted">{t('lesson.thinking')}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <form className="tutor-form" onSubmit={ask}>
            <label className="sr-only" htmlFor="tutor-question">
              {t('lesson.tutor')}
            </label>
            <input
              id="tutor-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('lesson.placeholder')}
              maxLength={800}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={asking || question.trim().length < 2}>
              <Send size={15} aria-hidden="true" /> {t('lesson.ask')}
            </button>
          </form>
          <p className="small muted tutor-note">{t('lesson.aiNote')}</p>
          <Link className="text-link small" to="/tutor">
            {t('lesson.history')}
          </Link>
        </>
      )}
    </aside>
  );
}
