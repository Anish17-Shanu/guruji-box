import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n';
import type { User } from './api/types';

const learner: User = {
  id: 2,
  display_name: 'Asha Kumar',
  email: 'learner@example.com',
  role: 'LEARNER',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockSession(user: User | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      user
        ? json(user)
        : json({ error: { code: 'not_authenticated', message: 'Sign in required.' } }, 401),
    ),
  );
}

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.setItem('guruji.lang', 'en');
});

describe('App', () => {
  it('renders the public home page with working navigation', async () => {
    mockSession(null);
    renderApp('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /Learning that feels clear, kind and possible/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Learn/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Sign in' }).length).toBeGreaterThan(0);
  });

  it('sends signed-out visitors from a protected page to the login page', async () => {
    mockSession(null);
    renderApp('/progress');

    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('blocks a learner from an admin-only area', async () => {
    mockSession(learner);
    renderApp('/admin');

    expect(
      await screen.findByRole('heading', { name: 'This area is for administrators' }),
    ).toBeInTheDocument();
  });

  it('switches the interface to Hindi from the header', async () => {
    mockSession(null);
    renderApp('/');

    fireEvent.click(await screen.findByRole('button', { name: 'हिन्दी में बदलें' }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'सीखना जो स्पष्ट, सौम्य और संभव लगे।' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('hi');
  });

  it('shows a friendly page for unknown routes', async () => {
    mockSession(null);
    renderApp('/this-page-does-not-exist');

    expect(await screen.findByRole('heading', { name: 'This page wandered off' })).toBeInTheDocument();
  });
});
