import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZolaClient } from '../src/client.js';

// Creates a mock JWT with a given exp timestamp (seconds since epoch)
function makeMockJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp, iss: 'svc-user', sub: 'test-user' })).toString('base64url');
  return `${header}.${payload}.mock-signature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600;   // 1 hour ago

function makeResponse(body: unknown, status = 200, setCookies: string[] = []): Response {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  for (const c of setCookies) headers.append('set-cookie', c);
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
    process.env.ZOLA_REFRESH_TOKEN = 'mock-usr-token';
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
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'ZOLA_REFRESH_TOKEN must be set'
    );
  });

  it('uses ZOLA_SESSION_TOKEN directly if valid (not expired)', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');

    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.zola.com/web-api/v1/test');
    expect((init.headers as Record<string, string>)['cookie']).toContain(`us=${validUs}`);
    expect((init.headers as Record<string, string>)['cookie']).toContain('usr=mock-usr-token');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBeUndefined();
  });

  it('skips ZOLA_SESSION_TOKEN if expired and attempts refresh', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);

    // Refresh flow: GET / for CSRF → POST /user/refresh (fails) → error
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [
        '_csrf=test-secret; Path=/; HttpOnly',
        'CSRF-TOKEN=test-csrf-token; Path=/',
      ])
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'failed' }, 403));

    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'Zola session expired'
    );
  });

  it('uses new session token from successful refresh', async () => {
    const newUs = makeMockJwt(FUTURE_EXP);

    // GET / for CSRF
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [
        '_csrf=test-secret; Path=/; HttpOnly',
        'CSRF-TOKEN=test-csrf-token; Path=/',
      ])
    );
    // POST /user/refresh → returns new us cookie
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [`us=${newUs}; Path=/; HttpOnly`])
    );
    // The actual API request
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');

    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, , [apiUrl, apiInit]] = fetchMock.mock.calls as [[string, RequestInit], [string, RequestInit], [string, RequestInit]];
    expect(apiUrl).toBe('https://www.zola.com/web-api/v1/test');
    expect((apiInit.headers as Record<string, string>)['cookie']).toContain(`us=${newUs}`);
  });

  it('re-authenticates on 401 and retries', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    const newUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    // First request → 401
    fetchMock.mockResolvedValueOnce(makeResponse({}, 401));
    // GET / for CSRF (refresh flow)
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [
        '_csrf=test-secret; Path=/; HttpOnly',
        'CSRF-TOKEN=test-csrf-token; Path=/',
      ])
    );
    // POST /user/refresh → new us
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [`us=${newUs}; Path=/; HttpOnly`])
    );
    // Retry request → success
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');
    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws with helpful message when refresh fails after 401', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);

    // First request → 401
    fetchMock.mockResolvedValueOnce(makeResponse({}, 401));
    // GET / for CSRF
    fetchMock.mockResolvedValueOnce(makeResponse({}, 200, ['_csrf=s; Path=/; HttpOnly', 'CSRF-TOKEN=t; Path=/']));
    // POST /user/refresh → fails
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'bad' }, 403));

    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'Zola session expired'
    );
  });

  it('includes x-csrf-token header on POST requests', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    // First call is GET / for CSRF
    fetchMock.mockResolvedValueOnce(
      makeResponse({}, 200, [
        '_csrf=test-secret; Path=/; HttpOnly',
        'CSRF-TOKEN=test-csrf-token; Path=/',
      ])
    );
    // Second call is the actual POST
    fetchMock.mockResolvedValueOnce(makeResponse({ id: '123' }));

    const client = new ZolaClient();
    await client.request('POST', '/web-api/v1/test', { foo: 'bar' });

    // First call was CSRF fetch (GET /)
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.zola.com/');
    // Second call was the POST with x-csrf-token
    const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((postInit.headers as Record<string, string>)['x-csrf-token']).toBe('test-csrf-token');
  });

  it('throws on 429 after one retry', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler) => {
      if (typeof fn === 'function') fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValue(makeResponse({}, 429));

    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'Rate limited by Zola API'
    );
  });
});
