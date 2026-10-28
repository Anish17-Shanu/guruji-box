import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="page narrow-page">
      <div className="empty">
        <Compass size={34} aria-hidden="true" />
        <h1>{t('notFound.title')}</h1>
        <p className="muted">{t('notFound.body')}</p>
        <Link className="btn btn-primary" to="/">
          {t('notFound.home')}
        </Link>
      </div>
    </div>
  );
}
