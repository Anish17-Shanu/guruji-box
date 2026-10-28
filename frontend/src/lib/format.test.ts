import { describe, expect, it } from 'vitest';
import { formatDate, formatScore, initials, isoDate, roleLabel } from './format';

describe('formatDate', () => {
  it('formats a date with the active locale', () => {
    const value = formatDate('2026-03-05T10:00:00Z', 'en');
    expect(value).toContain('Mar');
    expect(value).toContain('2026');
  });

  it('returns a dash for missing or invalid values', () => {
    expect(formatDate(null, 'en')).toBe('—');
    expect(formatDate(undefined, 'hi')).toBe('—');
    expect(formatDate('not-a-date', 'en')).toBe('—');
  });

  it('adds a time when requested', () => {
    const value = formatDate('2026-03-05T10:00:00Z', 'en', true);
    expect(value).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatScore', () => {
  it('rounds percentages', () => {
    expect(formatScore(72.6)).toBe('73%');
    expect(formatScore(0)).toBe('0%');
  });

  it('returns a dash for absent values', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore(Number.NaN)).toBe('—');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Asha Kumari Devi')).toBe('AK');
    expect(initials('guruji')).toBe('G');
  });

  it('handles empty names', () => {
    expect(initials('   ')).toBe('');
  });
});

describe('roleLabel', () => {
  it('maps role codes to labels', () => {
    expect(roleLabel('LEARNER')).toBe('Learner');
    expect(roleLabel('TEACHER')).toBe('Teacher');
    expect(roleLabel('ADMIN')).toBe('Admin');
  });
});

describe('isoDate', () => {
  it('returns a stable ISO calendar date', () => {
    expect(isoDate('2026-03-05T22:30:00Z')).toBe('2026-03-05');
  });
});
