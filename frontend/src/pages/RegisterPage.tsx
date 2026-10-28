import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage, fieldErrors } from '../api/client';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Alert } from '../components/ui';
import { useI18n } from '../i18n';

export function RegisterPage() {
  const { t } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('LEARNER');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFields({});
    try {
      const user = await register({ display_name: name.trim(), email: email.trim(), password, role });
      navigate(user.role === 'TEACHER' ? '/teach' : '/learn', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'signup_closed') {
        setError(t('auth.teacherClosed'));
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
        <h1>{t('auth.register.title')}</h1>
        <p>{t('auth.register.subtitle')}</p>
        <ul className="auth-points">
          <li>{t('home.learn.body')}</li>
          <li>{t('home.tutor.body')}</li>
          <li>{t('home.teach.body')}</li>
        </ul>
      </aside>

      <div className="auth-panel">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>{t('auth.create')}</h2>
          {error && <Alert tone="error">{error}</Alert>}
          <fieldset className="role-choice">
            <legend>{t('auth.role')}</legend>
            <label className={role === 'LEARNER' ? 'role-option selected' : 'role-option'}>
              <input
                type="radio"
                name="role"
                value="LEARNER"
                checked={role === 'LEARNER'}
                onChange={() => setRole('LEARNER')}
              />
              <strong>{t('auth.learner')}</strong>
              <span className="muted small">{t('home.learn.body')}</span>
            </label>
            <label className={role === 'TEACHER' ? 'role-option selected' : 'role-option'}>
              <input
                type="radio"
                name="role"
                value="TEACHER"
                checked={role === 'TEACHER'}
                onChange={() => setRole('TEACHER')}
              />
              <strong>{t('auth.teacher')}</strong>
              <span className="muted small">{t('home.teach.body')}</span>
            </label>
          </fieldset>
          <label className="field">
            <span>{t('auth.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              minLength={2}
              aria-invalid={Boolean(fields.display_name)}
            />
            {fields.display_name && <span className="field-error">{fields.display_name}</span>}
          </label>
          <label className="field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              aria-invalid={Boolean(fields.email)}
            />
            {fields.email && <span className="field-error">{fields.email}</span>}
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <span className="password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={10}
                aria-invalid={Boolean(fields.password)}
                aria-describedby="password-hint"
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
            <span className="field-hint" id="password-hint">
              {t('auth.passwordHint')}
            </span>
            {fields.password && <span className="field-error">{fields.password}</span>}
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            <UserPlus size={17} aria-hidden="true" />
            {submitting ? t('auth.creating') : t('auth.create')}
          </button>
          <p className="auth-switch">
            {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
