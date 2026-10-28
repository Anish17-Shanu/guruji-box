import { KeyRound, LogOut, Save, ShieldAlert, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, fieldErrors } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Alert, Avatar, Loader, PageHeader } from '../components/ui';
import { useI18n } from '../i18n';
import { formatDate } from '../lib/format';

export function ProfilePage() {
  const { t, lang } = useI18n();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.display_name ?? '');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState('');
  const [nameError, setNameError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!user) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameBusy(true);
    setNameError('');
    setNameMessage('');
    try {
      const updated = await api<User>('/auth/me', {
        method: 'PATCH',
        body: { display_name: name.trim() },
      });
      setUser(updated);
      setNameMessage(t('profile.nameUpdated'));
    } catch (caught) {
      const fields = fieldErrors(caught);
      setNameError(fields.display_name ?? errorMessage(caught));
    } finally {
      setNameBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      await api<void>('/auth/change-password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage(t('profile.passwordChanged'));
    } catch (caught) {
      const fields = fieldErrors(caught);
      setPasswordError(fields.new_password ?? fields.current_password ?? errorMessage(caught));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleteConfirm !== 'DELETE') return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await api<void>('/auth/me', { method: 'DELETE', body: { password: deletePassword } });
      await logout();
      navigate('/', { replace: true });
    } catch (caught) {
      setDeleteError(errorMessage(caught));
      setDeleteBusy(false);
    }
  }

  const roleLabel =
    user.role === 'LEARNER' ? t('auth.learner') : user.role === 'TEACHER' ? t('auth.teacher') : t('admin.title');

  return (
    <div className="page narrow-page">
      <PageHeader eyebrow={t('nav.profile')} title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <section className="panel profile-card" aria-labelledby="profile-account">
        <div className="profile-identity">
          <Avatar name={user.display_name} size={64} />
          <div>
            <h2 id="profile-account">{user.display_name}</h2>
            <p className="muted">{user.email}</p>
            <span className="badge">{roleLabel}</span>
          </div>
        </div>
        <dl className="profile-facts">
          <div>
            <dt>{t('profile.joined')}</dt>
            <dd>{formatDate(user.created_at, lang)}</dd>
          </div>
          <div>
            <dt>{t('profile.lastLogin')}</dt>
            <dd>{user.last_login_at ? formatDate(user.last_login_at, lang, true) : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="profile-name">
        <h2 id="profile-name">
          <UserRound size={18} aria-hidden="true" /> {t('profile.updateName')}
        </h2>
        <form onSubmit={saveName} className="stack-form">
          <label className="field">
            <span>{t('profile.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          {nameMessage && <Alert tone="success">{nameMessage}</Alert>}
          {nameError && <Alert tone="error">{nameError}</Alert>}
          <div>
            <button type="submit" className="btn btn-primary" disabled={nameBusy}>
              <Save size={15} aria-hidden="true" /> {nameBusy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="profile-password">
        <h2 id="profile-password">
          <KeyRound size={18} aria-hidden="true" /> {t('profile.changePassword')}
        </h2>
        <form onSubmit={changePassword} className="stack-form">
          <label className="field">
            <span>{t('profile.current')}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            <span>{t('profile.new')}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
            <span className="field-hint">{t('auth.passwordHint')}</span>
          </label>
          {passwordMessage && <Alert tone="success">{passwordMessage}</Alert>}
          {passwordError && <Alert tone="error">{passwordError}</Alert>}
          <div>
            <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
              {passwordBusy ? t('common.saving') : t('profile.updatePassword')}
            </button>
          </div>
        </form>
      </section>

      <section className="panel danger-panel" aria-labelledby="profile-danger">
        <h2 id="profile-danger">
          <ShieldAlert size={18} aria-hidden="true" /> {t('profile.danger')}
        </h2>
        <p className="muted">{t('profile.deleteWarning')}</p>
        {deleteError && <Alert tone="error">{deleteError}</Alert>}
        <form onSubmit={deleteAccount} className="stack-form">
          <label className="field">
            <span>{t('profile.deleteConfirm')}</span>
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <div>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={deleteBusy || deleteConfirm !== 'DELETE' || !deletePassword}
            >
              <LogOut size={15} aria-hidden="true" /> {t('profile.deleteButton')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
