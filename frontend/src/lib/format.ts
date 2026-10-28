import type { Role } from '../api/types';

const locales: Record<string, string> = { en: 'en-IN', hi: 'hi-IN' };

export function formatDate(value: string | null | undefined, lang: string, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locales[lang] ?? 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function roleLabel(role: Role): string {
  return role === 'LEARNER' ? 'Learner' : role === 'TEACHER' ? 'Teacher' : 'Admin';
}

export function isoDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}
