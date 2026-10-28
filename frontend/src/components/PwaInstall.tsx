import { CheckCircle2, Download, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true),
  );
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return { installed, deferred, isIos, install };
}

export function InstallCard() {
  const { t } = useI18n();
  const { installed, deferred, isIos, install } = useInstallPrompt();

  return (
    <section className="install-card" aria-labelledby="install-title">
      <span className="install-icon" aria-hidden="true">
        {installed ? <CheckCircle2 size={24} /> : <Smartphone size={24} />}
      </span>
      <div>
        <h2 id="install-title">{t('home.install.title')}</h2>
        <p className="muted">
          {installed
            ? t('home.install.installed')
            : isIos
              ? t('home.install.ios')
              : deferred
                ? t('home.install.body')
                : t('home.install.hint')}
        </p>
      </div>
      {!installed && deferred && (
        <button type="button" className="btn btn-secondary" onClick={install}>
          <Download size={16} aria-hidden="true" /> {t('home.install.button')}
        </button>
      )}
    </section>
  );
}
