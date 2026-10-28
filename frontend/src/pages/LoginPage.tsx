import { Eye, EyeOff, LogIn } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorMessage, fieldErrors } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui';
import { useI18n } from '../i18n';
import { demoAccounts, demoEnabled } from '../lib/demo';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const demo = useMemo(
    () => demoAccounts.find((account) => account.key === params.get('demo')),
    [params],
  );

  const [email, setEmail] = useState(demo?.email ?? '');
  const [password, setPassword] = useState(demo?.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as LocationState | null)?.from;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFields({});
    try {
      const user = await login(email.trim(), password);
      if (from) navigate(from, { replace: true });
      else if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'TEACHER') navigate('/teach', { replace: true });
      else navigate('/learn', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'account_inactive') {
        setError(caught.message);
      } else if (caught instanceof ApiError && caught.status === 401) {
        setError(caught.message);
      } else {
        setError(errorMessage(caught));
      }
      setFields(fieldErrors(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <p className="eyebrow">{t('home.eyebrow')}</p>
        <h1>{t('auth.login.title')}</h1>
        <p>{t('auth.login.subtitle')}</p>
        <ul className="auth-points">
          <li>{t('home.learn.body')}</li>
          <li>{t('home.tutor.body')}</li>
          <li>{t('home.skills.body')}</li>
        </ul>
        {demoEnabled && (
          <div className="auth-demo">
            <strong>{t('auth.demoTitle')}</strong>
            <div className="auth-demo-buttons">
              {demoAccounts.map((account) => (
                <button
                  key={account.key}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError('');
                  }}
                >
                  {t(
                    account.key === 'learner'
                      ? 'home.demo.learner'
                      : account.key === 'teacher'
                        ? 'home.demo.teacher'
                        : 'home.demo.admin',
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="auth-panel">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>{t('auth.signIn')}</h2>
          {error && <Alert tone="error">{error}</Alert>}
          <label className="field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              aria-invalid={Boolean(fields.email)}
              aria-describedby={fields.email ? 'email-error' : undefined}
            />
            {fields.email && (
              <span className="field-error" id="email-error">
                {fields.email}
              </span>
            )}
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <span className="password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                aria-invalid={Boolean(fields.password)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
            {fields.password && <span className="field-error">{fields.password}</span>}
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            <LogIn size={17} aria-hidden="true" />
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
          <p className="auth-switch">
            {t('auth.noAccount')} <Link to="/register">{t('auth.create')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
