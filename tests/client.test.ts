import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZolaClient } from '../src/client.js';

function makeMockJwt(exp: number, sessionId = 'test-session-id'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp, iss: 'svc-user', sub: 'test-user', session_id: sessionId })
  ).toString('base64url');
  return `${header}.${payload}.mock-signature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600;

function makeResponse(body: unknown, status = 200): Response {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Error ${status}`,
    headers,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('ZolaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    process.env.ZOLA_REFRESH_TOKEN = makeMockJwt(FUTURE_EXP);
    delete process.env.ZOLA_SESSION_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.ZOLA_REFRESH_TOKEN;
    delete process.env.ZOLA_SESSION_TOKEN;
  });

  it('throws when ZOLA_REFRESH_TOKEN is missing', async () => {
    delete process.env.ZOLA_REFRESH_TOKEN;
    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/v3/test')).rejects.toThrow(
      'ZOLA_REFRESH_TOKEN must be set'
    );
  });

  it('uses ZOLA_SESSION_TOKEN directly if valid', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.requestMobile<{ data: string }>('GET', '/v3/test');

    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mobile-api.zola.com/v3/test');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${validUs}`);
    expect(headers['x-zola-platform-type']).toBe('iphone_app');
    expect(headers['x-zola-session-id']).toBeDefined();
    expect(headers['cookie']).toBeUndefined();
  });

  it('refreshes via mobile API when session token is expired', async () => {
    const newSessionToken = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);

    fetchMock.mockResolvedValueOnce(
      makeResponse({
        data: { session_token: newSessionToken, refresh_token: 'r', session_id: 's' },
      })
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.requestMobile<{ data: string }>('GET', '/v3/test');

    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://mobile-api.zola.com/v3/sessions/refresh');
    const [apiUrl, apiInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(apiUrl).toBe('https://mobile-api.zola.com/v3/test');
    expect((apiInit.headers as Record<string, string>)['authorization']).toBe(
      `Bearer ${newSessionToken}`
    );
  });

  it('refreshes when no session token exists', async () => {
    const newSessionToken = makeMockJwt(FUTURE_EXP);

    fetchMock.mockResolvedValueOnce(
      makeResponse({
        data: { session_token: newSessionToken, refresh_token: 'r', session_id: 's' },
      })
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await client.requestMobile('GET', '/v3/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://mobile-api.zola.com/v3/sessions/refresh');
  });

  it('re-authenticates on 401 and retries', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    const newUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse({}, 401));
    fetchMock.mockResolvedValueOnce(
      makeResponse({ data: { session_token: newUs, refresh_token: 'r', session_id: 's' } })
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.requestMobile<{ data: string }>('GET', '/v3/test');
    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws with helpful message when refresh fails', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'invalid' }, 401));

    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/v3/test')).rejects.toThrow(
      'Zola session refresh failed'
    );
  });

  it('throws on 429 after one retry', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    fetchMock.mockResolvedValue(makeResponse({}, 429));

    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/v3/test')).rejects.toThrow(
      'Rate limited by Zola API'
    );
  });

  it('sends body as JSON with content-type header', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    fetchMock.mockResolvedValueOnce(makeResponse({ data: [] }));

    const client = new ZolaClient();
    await client.requestMobile('POST', '/v3/test', { foo: 'bar' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ foo: 'bar' }));
  });
});
