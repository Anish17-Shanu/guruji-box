import {
  ArrowRight,
  BookOpen,
  FileText,
  GraduationCap,
  MessageCircleQuestion,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DesktopDownloadCard } from '../components/DesktopDownload';
import { InstallCard } from '../components/PwaInstall';
import { useI18n } from '../i18n';
import { demoAccounts, demoEnabled } from '../lib/demo';

export function HomePage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const features = [
    { icon: BookOpen, title: t('home.learn.title'), body: t('home.learn.body'), to: '/learn', link: t('nav.learn') },
    {
      icon: MessageCircleQuestion,
      title: t('home.tutor.title'),
      body: t('home.tutor.body'),
      to: '/learn',
      link: t('learn.open'),
    },
    {
      icon: GraduationCap,
      title: t('home.teach.title'),
      body: t('home.teach.body'),
      to: user?.role === 'LEARNER' ? '/progress' : user ? '/teach' : '/login',
      link: user?.role === 'LEARNER' ? t('nav.progress') : t('nav.teach'),
    },
    { icon: Sparkles, title: t('home.skills.title'), body: t('home.skills.body'), to: '/skills', link: t('nav.skills') },
  ];

  const demoLabels = {
    learner: t('home.demo.learner'),
    teacher: t('home.demo.teacher'),
    admin: t('home.demo.admin'),
  };

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h1>{t('home.title')}</h1>
          <p className="lede">{t('home.subtitle')}</p>
          <div className="hero-actions">
            {user ? (
              <Link className="btn btn-primary btn-large" to="/learn">
                {t('nav.learn')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <Link className="btn btn-primary btn-large" to="/learn">
                {t('home.cta')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
            {(!user || user.role === 'LEARNER') && (
              <Link className="btn btn-ghost btn-large" to={user ? '/progress' : '/register'}>
                {user ? t('nav.progress') : t('auth.create')}
              </Link>
            )}
            {user && (user.role === 'TEACHER' || user.role === 'ADMIN') && (
              <Link className="btn btn-ghost btn-large" to="/teach">
                {t('nav.teach')}
              </Link>
            )}
          </div>
          <p className="hero-note">{t('home.offline')}</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-card hero-card-main">
            <span className="hero-chip">
              <BookOpen size={14} /> {t('learn.lesson')}
            </span>
            <h3>{t('home.learn.title')}</h3>
            <p>Fractions · Photosynthesis · Nutrients</p>
            <div className="hero-lines">
              <span style={{ width: '92%' }} />
              <span style={{ width: '78%' }} />
              <span style={{ width: '84%' }} />
            </div>
            <div className="hero-quiz">
              <span>Equal parts</span>
              <strong>80%</strong>
            </div>
          </div>
          <div className="hero-card hero-card-float">
            <MessageCircleQuestion size={18} />
            <p>“The denominator tells how many equal parts make the whole.”</p>
            <span className="hero-source">Fractions · Equal parts</span>
          </div>
          <div className="hero-blob" />
        </div>
      </section>

      <section className="feature-grid" aria-label={t('footer.product')}>
        {features.map(({ icon: Icon, title, body, to, link }) => (
          <article className="feature" key={title}>
            <span className="feature-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
            <Link to={to} className="text-link">
              {link} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </section>

      <section className="home-split">
        {demoEnabled && (
          <article className="demo-card">
            <div className="demo-head">
              <span className="feature-icon">
                <UsersRound size={20} aria-hidden="true" />
              </span>
              <div>
                <h2>{t('home.demo.title')}</h2>
                <p className="muted">{t('home.demo.body')}</p>
              </div>
            </div>
            <ul className="demo-list">
              {demoAccounts.map((account) => (
                <li key={account.email}>
                  <div>
                    <strong>{demoLabels[account.key]}</strong>
                    <span className="mono">{account.email}</span>
                  </div>
                  <Link className="btn btn-quiet btn-small" to={`/login?demo=${account.key}`}>
                    {t('auth.signIn')}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="small muted">
              <FileText size={13} aria-hidden="true" /> {t('auth.demoBody')}
            </p>
          </article>
        )}
        <InstallCard />
        <DesktopDownloadCard />
      </section>
    </div>
  );
}
