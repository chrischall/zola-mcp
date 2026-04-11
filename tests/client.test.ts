import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZolaClient } from '../src/client.js';

// Creates a mock JWT with a given exp timestamp (seconds since epoch)
function makeMockJwt(exp: number, sessionId = 'test-session-id'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ exp, iss: 'svc-user', sub: 'test-user', session_id: sessionId })
  ).toString('base64url');
  return `${header}.${payload}.mock-signature`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

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
    const headers = init.headers as Record<string, string>;
    // Web requests include both Bearer and cookie auth
    expect(headers['authorization']).toBe(`Bearer ${validUs}`);
    expect(headers['cookie']).toContain(`us=${validUs}`);
  });

  it('refreshes via mobile API when session token is expired', async () => {
    const newSessionToken = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);

    // Mobile refresh call
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        data: {
          session_token: newSessionToken,
          refresh_token: 'new-refresh',
          session_id: 'new-session-id',
        },
      })
    );
    // Actual API request
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');

    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // First call was the mobile refresh
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(refreshUrl).toBe('https://mobile-api.zola.com/v3/sessions/refresh');
    expect(refreshInit.method).toBe('POST');
    // Second call was the API request with new token
    const [apiUrl, apiInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(apiUrl).toBe('https://www.zola.com/web-api/v1/test');
    expect((apiInit.headers as Record<string, string>)['authorization']).toBe(
      `Bearer ${newSessionToken}`
    );
  });

  it('refreshes via mobile API when no session token exists', async () => {
    const newSessionToken = makeMockJwt(FUTURE_EXP);

    // Mobile refresh call
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        data: {
          session_token: newSessionToken,
          refresh_token: 'new-refresh',
          session_id: 'new-session-id',
        },
      })
    );
    // Actual API request
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await client.request('GET', '/web-api/v1/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://mobile-api.zola.com/v3/sessions/refresh'
    );
  });

  it('re-authenticates on 401 and retries', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    const newUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    // First request → 401
    fetchMock.mockResolvedValueOnce(makeResponse({}, 401));
    // Mobile refresh
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        data: { session_token: newUs, refresh_token: 'r', session_id: 's' },
      })
    );
    // Retry request → success
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    const result = await client.request<{ data: string }>('GET', '/web-api/v1/test');
    expect(result.data).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws with helpful message when refresh fails', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);

    // Mobile refresh → fails
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'invalid' }, 401));

    const client = new ZolaClient();
    await expect(client.request('GET', '/web-api/v1/test')).rejects.toThrow(
      'Zola session refresh failed'
    );
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

  it('requestMarketplace hits marketplace base URL with Bearer auth', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse([{ uuid: 'v1' }]));

    const client = new ZolaClient();
    await client.requestMarketplace<unknown[]>('POST', '/v1/account/get-or-create-vendors');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://www.zola.com/web-marketplace-api/v1/account/get-or-create-vendors'
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${validUs}`);
    expect(headers['cookie']).toContain(`us=${validUs}`);
  });

  it('requestMobile uses Bearer auth and mobile base URL, no cookie', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse([{ uuid: 'chart-1', name: 'Reception' }]));

    const client = new ZolaClient();
    const result = await client.requestMobile<unknown[]>('GET', '/v3/seating-charts/summaries');

    expect(result).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mobile-api.zola.com/v3/seating-charts/summaries');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${validUs}`);
    expect(headers['x-zola-platform-type']).toBe('iphone_app');
    expect(headers['cookie']).toBeUndefined();
  });

  it('requestMobile sends body as JSON', async () => {
    const validUs = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = validUs;

    fetchMock.mockResolvedValueOnce(makeResponse({ data: { guest_groups: [] } }));

    const client = new ZolaClient();
    await client.requestMobile('POST', '/v3/guestlists/directory/wedding-accounts/123', {
      sort_by_name_asc: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ sort_by_name_asc: true }));
  });
});
