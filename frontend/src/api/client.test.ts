import { describe, expect, it, vi } from 'vitest';
import { ApiError, api, errorMessage, fieldErrors } from './client';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api', () => {
  it('returns parsed JSON and sends cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 1, display_name: 'Asha' }));
    vi.stubGlobal('fetch', fetchMock);

    const user = await api<{ id: number }>('/auth/me');

    expect(user.id).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/me');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
  });

  it('serialises a JSON body for writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/auth/login', { method: 'POST', body: { email: 'a@example.com' } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ email: 'a@example.com' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('maps an error envelope to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'validation_error',
              message: 'Check the form.',
              details: [{ field: 'email', message: 'Enter a valid email.' }],
            },
          },
          422,
        ),
      ),
    );

    const caught = await api('/auth/register', { method: 'POST', body: {} }).catch((error) => error);

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 422, code: 'validation_error', message: 'Check the form.' });
    expect(errorMessage(caught)).toBe('Enter a valid email.');
    expect(fieldErrors(caught)).toEqual({ email: 'Enter a valid email.' });
  });

  it('reports an offline network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const caught = await api('/lessons').catch((error) => error);

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 0, code: 'network_error' });
  });

  it('lets abort errors through untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    await expect(api('/lessons', { signal: new AbortController().signal })).rejects.toBe(abort);
  });
});
