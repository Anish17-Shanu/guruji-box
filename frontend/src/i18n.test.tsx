import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, useI18n } from './i18n';

function Probe() {
  const { lang, setLang, t } = useI18n();
  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p>{t('learn.title')}</p>
      <p>{t('guard.roleTitle', { role: 'Teacher' })}</p>
      <button type="button" onClick={() => setLang('hi')}>
        switch
      </button>
    </div>
  );
}

describe('LanguageProvider', () => {
  it('translates and interpolates values', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    expect(screen.getByText('Lessons')).toBeInTheDocument();
    expect(screen.getByText('This area is for Teachers')).toBeInTheDocument();
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('switches language, updates the document and persists the choice', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    expect(screen.getByText('पाठ')).toBeInTheDocument();
    expect(screen.getByTestId('lang')).toHaveTextContent('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(window.localStorage.getItem('guruji.lang')).toBe('hi');
  });
});
