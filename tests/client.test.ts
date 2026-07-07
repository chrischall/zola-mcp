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

  it('throws when ZOLA_REFRESH_TOKEN is missing and fetchproxy is disabled', async () => {
    delete process.env.ZOLA_REFRESH_TOKEN;
    process.env.ZOLA_DISABLE_FETCHPROXY = '1';
    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/v3/test')).rejects.toThrow(
      /ZOLA_REFRESH_TOKEN/
    );
    delete process.env.ZOLA_DISABLE_FETCHPROXY;
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

  it('single-flights the refresh across concurrent requests', async () => {
    // Two requests racing from a cold client must trigger exactly one refresh —
    // the single-flight guarantee the cached token source provides (the old
    // hand-rolled cache issued one refresh per concurrent caller).
    const newSessionToken = makeMockJwt(FUTURE_EXP);
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/v3/sessions/refresh')) {
        refreshCalls += 1;
        return makeResponse({
          data: { session_token: newSessionToken, refresh_token: 'r', session_id: 's' },
        });
      }
      return makeResponse({ data: 'ok' });
    });

    const client = new ZolaClient();
    await Promise.all([
      client.requestMobile('GET', '/a'),
      client.requestMobile('GET', '/b'),
    ]);

    expect(refreshCalls).toBe(1);
  });

  it('recomputes x-zola-user-session-id from the current token, updating after re-auth', async () => {
    // The WAF header is derived per request from the live session token; after a
    // 401 re-mint it must reflect the NEW token's session id, not the stale one.
    const firstToken = makeMockJwt(FUTURE_EXP, 'session-A');
    const secondToken = makeMockJwt(FUTURE_EXP, 'session-B');
    process.env.ZOLA_SESSION_TOKEN = firstToken;

    fetchMock.mockResolvedValueOnce(makeResponse({}, 401)); // first API call
    fetchMock.mockResolvedValueOnce(
      makeResponse({ data: { session_token: secondToken, refresh_token: 'r', session_id: 's' } })
    ); // refresh
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' })); // replay

    const client = new ZolaClient();
    await client.requestMobile('GET', '/v3/test');

    const firstHeaders = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
      .headers as Record<string, string>;
    const replayHeaders = (fetchMock.mock.calls[2] as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(firstHeaders['x-zola-user-session-id']).toBe('session-A');
    expect(replayHeaders['x-zola-user-session-id']).toBe('session-B');
  });

  it('throws with helpful message when refresh fails', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);
    fetchMock.mockResolvedValueOnce(makeResponse({ error: 'invalid' }, 401));

    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/v3/test')).rejects.toThrow(
      'Zola session refresh failed'
    );
  });

  it('redacts a JWT echoed in a refresh-failure body', async () => {
    // The refresh request body carries the refresh JWT; an echoing upstream or
    // proxy would reflect it back in the error body. It must never reach the
    // thrown (tool-result-visible) message.
    const echoedJwt = makeMockJwt(FUTURE_EXP);
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(PAST_EXP);
    fetchMock.mockResolvedValueOnce(makeResponse({ error: `bad token ${echoedJwt}` }, 401));

    const client = new ZolaClient();
    const err = await client.requestMobile('GET', '/v3/test').then(
      () => {
        throw new Error('expected rejection');
      },
      (e: unknown) => e as Error
    );
    expect(err.message).toContain('Zola session refresh failed (401)');
    expect(err.message).not.toContain(echoedJwt);
    expect(err.message).toContain('[REDACTED]');
    // The actionable guidance must survive redaction/truncation.
    expect(err.message).toContain('ZOLA_REFRESH_TOKEN');
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

  it('getContext: returns weddingId from context response', async () => {
    const freshClient = new (await import('../src/client.js')).ZolaClient();
    vi.spyOn(freshClient, 'requestMobile').mockResolvedValueOnce({
      data: {
        user: { id: 'user-1' },
        wedding_account: { wedding_account_id: 4664323 },
        wedding: { wedding_id: 7585869, wedding_date: '2026-10-17', slug: 'chrismer26' },
        registry: { id: 'registry-1' },
      },
    } as never);
    const ctx = await freshClient.getContext();
    expect(ctx.weddingId).toBe(7585869);
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

  it('valid session — no refresh on second call', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    fetchMock.mockResolvedValue(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await client.requestMobile('GET', '/test');
    await client.requestMobile('GET', '/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => !u.includes('/v3/sessions/refresh'))).toBe(true);
  });

  it('near-expiry session triggers proactive refresh', async () => {
    const nearExp = Math.floor(Date.now() / 1000) + 2 * 60; // 2 min from now
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(nearExp);
    const newSessionToken = makeMockJwt(FUTURE_EXP);

    fetchMock.mockResolvedValueOnce(
      makeResponse({ data: { session_token: newSessionToken, refresh_token: 'r', session_id: 's' } })
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await client.requestMobile('GET', '/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://mobile-api.zola.com/v3/sessions/refresh');
  });

  it('malformed ZOLA_SESSION_TOKEN falls through to refresh', async () => {
    process.env.ZOLA_SESSION_TOKEN = 'not.a.jwt-or-malformed';
    const newSessionToken = makeMockJwt(FUTURE_EXP);

    fetchMock.mockResolvedValueOnce(
      makeResponse({ data: { session_token: newSessionToken, refresh_token: 'r', session_id: 's' } })
    );
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' }));

    const client = new ZolaClient();
    await expect(client.requestMobile('GET', '/test')).resolves.toBeDefined();
    expect(fetchMock.mock.calls[0][0]).toBe('https://mobile-api.zola.com/v3/sessions/refresh');
  });

  it('500 response throws descriptive error', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    fetchMock.mockResolvedValueOnce(makeResponse('server exploded', 500));

    const client = new ZolaClient();
    let caught: Error | undefined;
    try {
      await client.requestMobile('GET', '/foo');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('Zola API error');
    expect(caught!.message).toContain('500');
    expect(caught!.message).toContain('server exploded');
    expect(caught!.message).toContain('GET');
    expect(caught!.message).toContain('/foo');
  });

  it('empty-body 200 response resolves to null', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    const emptyResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '',
      json: async () => null,
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(emptyResponse);

    const client = new ZolaClient();
    const result = await client.requestMobile('DELETE', '/foo');
    expect(result).toBeNull();
  });

  it('getContext caches across calls', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);
    const contextResponse = {
      data: {
        user: { id: 'user-1' },
        wedding_account: { wedding_account_id: 4664323 },
        wedding: { wedding_id: 7585869, wedding_date: '2026-10-17', slug: 'chrismer26' },
        registry: { id: 'registry-1' },
      },
    };
    fetchMock.mockResolvedValueOnce(makeResponse({ data: 'ok' })); // session setup is handled by token
    fetchMock.mockResolvedValue(makeResponse(contextResponse));

    const freshClient = new ZolaClient();
    delete process.env.ZOLA_ACCOUNT_ID;
    delete process.env.ZOLA_REGISTRY_ID;
    delete process.env.ZOLA_WEDDING_ID;

    // Stub requestMobile to return the context data without going through fetch for the context call
    const reqSpy = vi.spyOn(freshClient, 'requestMobile').mockResolvedValue(contextResponse as never);

    await freshClient.getContext();
    await freshClient.getContext();

    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/users/me/context');
  });

  it('getContext short-circuits when all three env vars are present', async () => {
    process.env.ZOLA_ACCOUNT_ID = '4664323';
    process.env.ZOLA_REGISTRY_ID = 'registry-env';
    process.env.ZOLA_WEDDING_ID = '7585869';

    const freshClient = new ZolaClient();
    const ctx = await freshClient.getContext();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.weddingAccountId).toBe(4664323);
    expect(ctx.registryId).toBe('registry-env');
    expect(ctx.weddingId).toBe(7585869);
    expect(ctx.userId).toBe('');

    delete process.env.ZOLA_ACCOUNT_ID;
    delete process.env.ZOLA_REGISTRY_ID;
    delete process.env.ZOLA_WEDDING_ID;
  });

  it('requestMobileBinary returns raw bytes + content-type and sends Accept: */*', async () => {
    process.env.ZOLA_SESSION_TOKEN = makeMockJwt(FUTURE_EXP);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => png.buffer,
    } as unknown as Response);

    const client = new ZolaClient();
    const result = await client.requestMobileBinary('PUT', '/v3/card-projects/qrcode/preview', {
      url: 'https://example.com',
    });

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
    expect(result.contentType).toBe('image/jpeg');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ url: 'https://example.com' }));
    const headers = init.headers as Record<string, string>;
    expect(headers['accept']).toBe('*/*');
  });
});
