import { Download, MonitorDown } from 'lucide-react';
import { useI18n } from '../i18n';

const configuredUrl = (import.meta.env.VITE_DESKTOP_DOWNLOAD_URL as string | undefined)?.trim();
const DOWNLOAD_URL =
  configuredUrl ||
  'https://github.com/Anish17-Shanu/guruji-box/releases/download/v2.0.0/Guruji-Box-Setup-2.0.0.exe';

export function DesktopDownloadCard() {
  const { t } = useI18n();

  return (
    <section className="install-card desktop-card" aria-labelledby="desktop-title">
      <span className="install-icon" aria-hidden="true">
        <MonitorDown size={24} />
      </span>
      <div>
        <h2 id="desktop-title">{t('home.desktop.title')}</h2>
        <p className="muted">{t('home.desktop.body')}</p>
        <p className="small muted">{t('home.desktop.note')}</p>
      </div>
      <a className="btn btn-secondary" href={DOWNLOAD_URL} target="_blank" rel="noreferrer" download="Guruji-Box-Setup-2.0.0.exe">
        <Download size={16} aria-hidden="true" /> {t('home.desktop.button')}
      </a>
    </section>
  );
}
