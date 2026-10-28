import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { Loader } from './ui';

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="page">
        <Loader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    const label = roles.includes('ADMIN') ? t('guard.admin') : t('guard.teacher');
    return (
      <div className="page narrow-page">
        <div className="empty">
          <h1>{t('guard.roleTitle', { role: label })}</h1>
          <p className="muted">{t('guard.roleBody')}</p>
          <Link className="btn btn-primary" to="/learn">
            {t('nav.learn')}
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
