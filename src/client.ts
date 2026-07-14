import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  readEnvVar,
  loadDotenvSafely,
  decodeJwtExp,
  decodeJwtSessionId,
  formatApiError,
  truncateErrorMessage,
  createCachedTokenSource,
} from '@chrischall/mcp-utils';
import type { MintedToken } from '@chrischall/mcp-utils';
import { resolveRefreshToken } from './auth.js';

// Load `.env` next to the compiled entry point. `loadDotenvSafely` is a
// no-throw loader: in bundled mode (no resolvable `dotenv`) it returns false
// and we fall back to process.env. The try/catch additionally guards the
// Cloudflare Worker runtime, where `import.meta.url` is undefined and
// `fileURLToPath(undefined)` would otherwise throw at module init (Worker
// startup validation) — there is no filesystem / .env to load there anyway.
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });
} catch {
  /* v8 ignore next -- only reached in a non-Node runtime (Workers): no .env to load */
}

const MOBILE_BASE_URL = 'https://mobile-api.zola.com';

export interface UserContext {
  weddingAccountId: number;
  weddingId: number;
  registryId: string;
  userId: string;
  weddingDate: string | null;
  weddingSlug: string | null;
}

// Refresh the session token this long before its JWT `exp` — the same 5-minute
// comfort margin the hand-rolled cache used for both the "still valid" check and
// the `ZOLA_SESSION_TOKEN` seed's freshness gate.
const SESSION_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class ZolaClient {
  private cachedContext: UserContext | null = null;
  // WAF requires x-zola-session-id on all mobile-api.zola.com requests.
  // Generated LAZILY: this class's module-level singleton (`export const client`
  // below) is constructed at module load, and when that module graph is loaded
  // inside a Cloudflare Worker (via src/worker.ts) `crypto.randomUUID()` would run
  // in GLOBAL SCOPE, which the Workers runtime forbids ("Disallowed operation …
  // generating random values … within global scope", startup validation code
  // 10021). Deferring it to first use moves it into a request handler, where it's
  // allowed. No effect on the stdio path.
  private _deviceSessionId: string | undefined;
  private get deviceSessionId(): string {
    return (this._deviceSessionId ??= crypto.randomUUID().toUpperCase());
  }
  // The `ZOLA_SESSION_TOKEN` seed is a cold-start-only shortcut, exactly as the
  // old `ensureSession` gated it on `sessionToken === null`; a 401 re-mint goes
  // straight to `refresh()`, never back to the env token.
  private triedEnvSeed = false;
  // Single-flight cached mint: caches the 30-min session JWT until 5 min before
  // its `exp`, coalesces concurrent mints, and re-mints on demand after a 401.
  // LAZY for the same Worker-global-scope reason as deviceSessionId above.
  private _session: ReturnType<typeof createCachedTokenSource> | undefined;
  private get session(): ReturnType<typeof createCachedTokenSource> {
    return (this._session ??= createCachedTokenSource({
      mint: () => this.mintSession(),
      bufferMs: SESSION_REFRESH_BUFFER_MS,
    }));
  }

  // Optional injected refresh-token resolver. When set, `refresh()` uses it
  // instead of the module-level global `resolveRefreshToken` (env-var →
  // fetchproxy priority). A hosted per-user Cloudflare deployment injects its
  // own resolver so each request carries that user's stored `usr` refresh
  // token — see `src/worker.ts`. Left undefined by the stdio path, which falls
  // back to the global resolver, keeping that behaviour byte-for-byte identical.
  private readonly resolveRefreshToken:
    | (() => Promise<{ token: string; source: string }>)
    | undefined;

  constructor(opts?: { resolveRefreshToken?: () => Promise<{ token: string; source: string }> }) {
    this.resolveRefreshToken = opts?.resolveRefreshToken;
  }

  /**
   * Make a request to the Zola mobile API (mobile-api.zola.com).
   * Uses Bearer JWT auth with x-zola-session-id header.
   */
  async requestMobile<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.doRequest<T>(method, path, body);
  }

  /**
   * Like `requestMobile` but for endpoints that return a non-JSON body
   * (e.g. the QR-code preview which returns image bytes).
   * Sends `Accept: *\/*` (the JSON default would 406), and returns both the
   * raw bytes and the server's content-type so callers can pass it through.
   */
  async requestMobileBinary(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await this.sendWithRetry(method, path, body, false, false, '*/*');
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, contentType };
  }

  /**
   * Get user context (wedding account ID, registry ID, etc.).
   * Uses env vars as overrides; falls back to GET /v3/users/me/context.
   * Cached for the lifetime of the client instance.
   */
  async getContext(): Promise<UserContext> {
    if (this.cachedContext) return this.cachedContext;

    const envAccountId = readEnvVar('ZOLA_ACCOUNT_ID');
    const envRegistryId = readEnvVar('ZOLA_REGISTRY_ID');
    const envWeddingId = readEnvVar('ZOLA_WEDDING_ID');

    // If all env vars are set, skip the API call
    if (envAccountId && envRegistryId && envWeddingId) {
      this.cachedContext = {
        weddingAccountId: Number(envAccountId),
        weddingId: Number(envWeddingId),
        registryId: envRegistryId,
        userId: '',
        weddingDate: null,
        weddingSlug: null,
      };
      return this.cachedContext;
    }

    const response = await this.requestMobile<{
      data: {
        user: { id: string };
        wedding_account: { wedding_account_id: number };
        wedding: { wedding_id: number; wedding_date: string | null; slug: string | null };
        registry: { id: string };
      };
    }>('GET', '/v3/users/me/context');

    this.cachedContext = {
      weddingAccountId: Number(envAccountId) || response.data.wedding_account.wedding_account_id,
      weddingId: Number(envWeddingId) || response.data.wedding.wedding_id,
      registryId: envRegistryId || response.data.registry.id,
      userId: response.data.user.id,
      weddingDate: response.data.wedding.wedding_date,
      weddingSlug: response.data.wedding.slug,
    };
    return this.cachedContext;
  }

  private async doRequest<T>(method: string, path: string, body: unknown): Promise<T> {
    const response = await this.sendWithRetry(method, path, body);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async sendWithRetry(
    method: string,
    path: string,
    body: unknown,
    isAuthRetry = false,
    isRateRetry = false,
    accept = 'application/json'
  ): Promise<Response> {
    // Current session token from the cache (mints/refreshes as needed). The
    // per-request `x-zola-user-session-id` is derived from it every call, so a
    // re-minted token below carries its own session id on the replay.
    const token = await this.session.getToken();
    const sessionId = decodeJwtSessionId(token);
    const headers: Record<string, string> = {
      accept,
      authorization: `Bearer ${token}`,
      'x-zola-platform-type': 'iphone_app',
      'x-zola-session-id': this.deviceSessionId,
      'user-agent': 'Zola/42.5.0 (iPad; iOS 26.4; Scale/2.0)',
      ...(sessionId ? { 'x-zola-user-session-id': sessionId } : {}),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${MOBILE_BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401 && !isAuthRetry) {
      // Drop the cached token so the replay's getToken re-mints via refresh().
      this.session.invalidate();
      return this.sendWithRetry(method, path, body, true, isRateRetry, accept);
    }

    if (response.status === 429) {
      if (!isRateRetry) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        return this.sendWithRetry(method, path, body, isAuthRetry, true, accept);
      }
      throw new Error('Rate limited by Zola API');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        formatApiError(response.status, method, path, text, { service: 'Zola API' })
      );
    }

    return response;
  }

  /**
   * Mint a session token for the cache. On the very first mint, use a valid
   * `ZOLA_SESSION_TOKEN` if present (a cold-start shortcut that skips the
   * initial refresh); otherwise, and on every later mint, refresh via the
   * mobile API. Returns `{ token, expiresAt }` so the cache serves it until
   * `SESSION_REFRESH_BUFFER_MS` before the JWT's `exp`.
   */
  private async mintSession(): Promise<MintedToken> {
    // Cold-start seed: use ZOLA_SESSION_TOKEN if present and comfortably
    // unexpired. Only attempted once — a 401 re-mint always goes to refresh().
    if (!this.triedEnvSeed) {
      this.triedEnvSeed = true;
      const envSession = readEnvVar('ZOLA_SESSION_TOKEN');
      if (envSession) {
        try {
          const exp = decodeJwtExp(envSession);
          if (exp * 1000 - Date.now() > SESSION_REFRESH_BUFFER_MS) {
            return { token: envSession, expiresAt: exp * 1000 };
          }
        } catch {
          // Invalid JWT in env — fall through to refresh
        }
      }
    }

    return this.refresh();
  }

  /**
   * Refresh the session using the mobile API endpoint.
   * POST /v3/sessions/refresh with the refresh token JWT.
   * Returns a new session_token (30-min) as a {@link MintedToken}.
   *
   * The refresh token comes from `resolveRefreshToken()`, which tries
   * (1) ZOLA_REFRESH_TOKEN env var, then (2) the fetchproxy 0.3.0 extension's
   * `usr` cookie on zola.com, then (3) errors with actionable guidance.
   */
  private async refresh(): Promise<MintedToken> {
    const { token: refreshToken } = await (this.resolveRefreshToken ?? resolveRefreshToken)();

    const response = await fetch(`${MOBILE_BASE_URL}/v3/sessions/refresh`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-zola-platform-type': 'iphone_app',
        'x-zola-session-id': this.deviceSessionId,
        'user-agent': 'Zola/42.5.0 (iPad; iOS 26.4; Scale/2.0)',
      },
      body: JSON.stringify({ token: refreshToken }),
    });

    if (!response.ok) {
      const text = await response.text();
      // The refresh request body carries the refresh JWT — an echoing upstream
      // or proxy could reflect it in the error body, so redact + truncate the
      // untrusted body before it can reach a tool result.
      throw new Error(
        `Zola session refresh failed (${response.status}): ${truncateErrorMessage(text)}\n` +
          'To fix: set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension and sign into zola.com.'
      );
    }

    const result = (await response.json()) as {
      data: { session_token: string; refresh_token: string; session_id: string };
    };

    const { session_token } = result.data;
    const exp = decodeJwtExp(session_token);
    return { token: session_token, expiresAt: exp * 1000 };
  }
}

export const client = new ZolaClient();
