import {
  BookOpen,
  ChevronDown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { Avatar } from './ui';

function Logo() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <BookOpen size={20} strokeWidth={2.4} />
    </span>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function navItems(role: Role | undefined, t: ReturnType<typeof useI18n>['t']) {
  const items = [
    { to: '/learn', label: t('nav.learn'), icon: BookOpen },
    { to: '/skills', label: t('nav.skills'), icon: Sparkles },
  ];
  if (role === 'LEARNER') items.push({ to: '/progress', label: t('nav.progress'), icon: GraduationCap });
  if (role === 'TEACHER' || role === 'ADMIN') {
    items.push({ to: '/teach', label: t('nav.teach'), icon: LayoutDashboard });
    items.push({ to: '/worksheets', label: t('nav.worksheets'), icon: FileText });
  }
  if (role === 'ADMIN') items.push({ to: '/admin', label: t('nav.admin'), icon: ShieldCheck });
  return items;
}

export function Layout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const online = useOnline();
  const items = navItems(user?.role, t);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t('nav.skip')}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="Guruji Box home">
            <Logo />
            <span>
              Guruji <em>Box</em>
            </span>
          </Link>

          <nav className="primary-nav" aria-label="Primary">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              aria-label={lang === 'en' ? 'हिन्दी में बदलें' : 'Switch to English'}
            >
              {lang === 'en' ? 'हिंदी' : 'English'}
            </button>

            {user ? (
              <div className="user-menu" ref={menuRef}>
                <button
                  type="button"
                  className="user-trigger"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <Avatar name={user.display_name} size={32} />
                  <span className="user-name">{user.display_name}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="dropdown" role="menu">
                    <div className="dropdown-head">
                      <strong>{user.display_name}</strong>
                      <span className="muted">{user.email}</span>
                    </div>
                    <Link role="menuitem" to="/profile" className="dropdown-item">
                      <UserRound size={16} aria-hidden="true" /> {t('nav.profile')}
                    </Link>
                    {user.role === 'LEARNER' && (
                      <Link role="menuitem" to="/progress" className="dropdown-item">
                        <GraduationCap size={16} aria-hidden="true" /> {t('nav.progress')}
                      </Link>
                    )}
                    <button role="menuitem" type="button" className="dropdown-item" onClick={handleLogout}>
                      <LogOut size={16} aria-hidden="true" /> {t('nav.signOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link className="btn btn-primary btn-small" to="/login">
                {t('nav.signIn')}
              </Link>
            )}

            <button
              type="button"
              className="icon-button mobile-only"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={t('nav.menu')}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav id="mobile-nav" className="mobile-nav" aria-label="Primary mobile">
            <NavLink to="/" className="nav-link">
              {t('nav.home')}
            </NavLink>
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            {!user && (
              <Link className="btn btn-primary" to="/login">
                {t('nav.signIn')}
              </Link>
            )}
          </nav>
        )}
      </header>

      {!online && (
        <div className="offline-bar" role="status">
          <WifiOff size={16} aria-hidden="true" /> {t('offline.banner')}
        </div>
      )}

      <main id="main" className="site-main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link className="brand" to="/">
              <Logo />
              <span>
                Guruji <em>Box</em>
              </span>
            </Link>
            <p className="muted">{t('footer.tagline')}</p>
          </div>
          <div className="footer-links">
            <div>
              <h2>{t('footer.product')}</h2>
              <Link to="/learn">{t('nav.learn')}</Link>
              <Link to="/skills">{t('nav.skills')}</Link>
              {user && (user.role === 'TEACHER' || user.role === 'ADMIN') && (
                <Link to="/worksheets">{t('nav.worksheets')}</Link>
              )}
            </div>
            <div>
              <h2>{t('footer.account')}</h2>
              {user ? (
                <>
                  <Link to="/profile">{t('nav.profile')}</Link>
                  {user.role === 'LEARNER' && <Link to="/progress">{t('nav.progress')}</Link>}
                  {user.role === 'ADMIN' && <Link to="/admin">{t('nav.admin')}</Link>}
                </>
              ) : (
                <>
                  <Link to="/login">{t('nav.signIn')}</Link>
                  <Link to="/register">{t('auth.create')}</Link>
                </>
              )}
            </div>
            <div>
              <h2>{t('footer.about')}</h2>
              <p className="muted small">{t('footer.privacy')}</p>
              <p className="muted small">{t('footer.offline')}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
