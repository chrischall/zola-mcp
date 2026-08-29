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
import { resolveRefreshToken, clearCachedRefreshToken } from './auth.js';

/**
 * A session refresh the API refused, carrying the HTTP status so the caller can
 * tell a rejected credential (4xx) from a transient upstream failure (5xx).
 * That distinction is the whole reason this is not a bare `Error`: it decides
 * whether a cached refresh token is discarded or kept.
 */
class RefreshFailedError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'RefreshFailedError';
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Whether an error means the API rejected the credential itself, as opposed to
 * failing for a reason that says nothing about it. A network error is not an
 * instance of {@link RefreshFailedError} at all, so it correctly reads as
 * transient.
 */
function isCredentialRejection(err: unknown): boolean {
  return err instanceof RefreshFailedError && err.status >= 400 && err.status < 500;
}

// Load `.env` next to the compiled entry point. `loadDotenvSafely` is a
// no-throw loader: in bundled mode (no resolvable `dotenv`) it returns false
// and we fall back to process.env. The try/catch additionally guards a
// runtime where `import.meta.url` is undefined and `fileURLToPath(undefined)`
// would otherwise throw at module init — there is no filesystem / .env to load
// in one of those anyway.
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  await loadDotenvSafely({ path: join(__dirname, '..', '.env'), override: false });
} catch {
  /* v8 ignore next -- only reached in a non-Node runtime (Workers): no .env to load */
}

const MOBILE_BASE_URL = 'https://mobile-api.zola.com';

/**
 * A request that failed anywhere between "we called fetch" and "we have parsed
 * JSON", carrying enough context to tell the three failure modes apart.
 *
 * This type exists because they were previously indistinguishable. A tool that
 * surfaced only "Error occurred during tool execution" gave no way to tell an
 * expired credential from a 403 WAF rejection from a body too large to parse —
 * all three needed different fixes and looked identical. Every field below is
 * something that was missing at the moment it was most needed.
 *
 * `bytes` earns its place: the failure that motivated this class was a 4 MB
 * success response, where the status code alone (200) said nothing useful.
 */
export class ZolaApiError extends Error {
  readonly stage: 'transport' | 'http' | 'parse';
  readonly status: number | null;
  readonly method: string;
  readonly path: string;
  readonly bytes: number | null;
  readonly bodyPreview: string | null;

  constructor(init: {
    stage: 'transport' | 'http' | 'parse';
    status?: number | null;
    method: string;
    path: string;
    bytes?: number | null;
    bodyPreview?: string | null;
    message: string;
    cause?: unknown;
  }) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = 'ZolaApiError';
    this.stage = init.stage;
    this.status = init.status ?? null;
    this.method = init.method;
    this.path = init.path;
    this.bytes = init.bytes ?? null;
    this.bodyPreview = init.bodyPreview ?? null;
  }
}

/**
 * Byte length of a string as sent over the wire.
 *
 * `String.length` counts UTF-16 code units, so a body full of multi-byte
 * characters under-reports — misleading in a field literally named `bytes`.
 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Human-readable byte count for diagnostics (`4.0 MB`, `154.0 KB`, `812 B`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  // below) is constructed at module load, so an eager `crypto.randomUUID()`
  // would run in GLOBAL SCOPE — which some sandboxed runtimes forbid outright
  // ("Disallowed operation … generating random values … within global scope").
  // Deferring it to first use moves it into a request handler, where it is
  // allowed everywhere. No effect on the stdio path.
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
  // fetchproxy priority). A hosted per-user deployment injects its own
  // resolver so each request carries that user's stored `usr` refresh
  // token. Left undefined by the stdio path, which falls
  // back to the global resolver, keeping that behaviour byte-for-byte identical.
  private readonly resolveRefreshToken:
    | (() => Promise<{ token: string; source: string }>)
    | undefined;

  // Optional injected cache-clear, paired with the resolver above so a test (or
  // a hosted per-user deployment with its own store) can own both halves of the
  // stale-credential recovery in `refresh()`.
  private readonly clearCachedRefreshToken: (() => void) | undefined;

  constructor(opts?: {
    resolveRefreshToken?: () => Promise<{ token: string; source: string }>;
    clearCachedRefreshToken?: () => void;
  }) {
    this.resolveRefreshToken = opts?.resolveRefreshToken;
    this.clearCachedRefreshToken = opts?.clearCachedRefreshToken;
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
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      // A 2xx whose body will not parse. Previously this surfaced as a bare
      // "Unexpected token …" with no hint of which endpoint produced it or how
      // big the body was — the two facts that actually identify the problem.
      const size = byteLength(text);
      throw new ZolaApiError({
        stage: 'parse',
        status: response.status,
        method,
        path,
        bytes: size,
        bodyPreview: truncateErrorMessage(text, 300),
        message:
          `Zola API returned unparseable JSON for ${method.toUpperCase()} ${path} ` +
          `(HTTP ${response.status}, ${formatBytes(size)}): ` +
          `${truncateErrorMessage(text, 300)}`,
        cause,
      });
    }
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

    let response: Response;
    try {
      response = await fetch(`${MOBILE_BASE_URL}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      // DNS failure, TLS error, socket reset, abort. There is no status code to
      // report here, and saying so explicitly is the point: "transport" tells
      // the reader not to go looking for one.
      throw new ZolaApiError({
        stage: 'transport',
        method,
        path,
        message:
          `Zola API transport failure for ${method.toUpperCase()} ${path}: ` +
          truncateErrorMessage(cause instanceof Error ? cause.message : String(cause)),
        cause,
      });
    }

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
      throw new ZolaApiError({
        stage: 'http',
        status: 429,
        method,
        path,
        message: `Zola API error 429 for ${method.toUpperCase()} ${path}: rate limited (retried once after 2s)`,
      });
    }

    if (!response.ok) {
      const text = await response.text();
      // `formatApiError` already yields "Zola API error <status> for <METHOD>
      // <path>: <redacted body>" and runs the body through redaction *then*
      // truncation. Keep it as the message, and additionally carry the parts as
      // structured fields so callers can branch on status without regex.
      throw new ZolaApiError({
        stage: 'http',
        status: response.status,
        method,
        path,
        bytes: byteLength(text),
        bodyPreview: truncateErrorMessage(text),
        message: formatApiError(response.status, method, path, text, { service: 'Zola API' }),
      });
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
   * (1) the ZOLA_REFRESH_TOKEN env var, then (2) the on-disk cache, then
   * (3) the fetchproxy extension's `usr` cookie on zola.com, then (4) errors
   * with actionable guidance.
   */
  private async refresh(): Promise<MintedToken> {
    const resolve = this.resolveRefreshToken ?? resolveRefreshToken;
    const resolved = await resolve();

    try {
      return await this.mintWithRefreshToken(resolved.token);
    } catch (err) {
      // Only a CACHED credential earns a second attempt. The env var would
      // re-resolve to the same value, and a token just lifted from the browser
      // is already as fresh as the bridge can make it — so for both, retrying
      // only buries the real "your token is bad" signal.
      //
      // A 4xx is the API rejecting the credential, which for a cached token
      // means it was revoked or aged out; discard it and go back to the bridge.
      // A 5xx or a network error says nothing about the credential, so the
      // record survives — destroying a valid token on a transient blip would
      // force a needless re-bridge (mcp-utils #139).
      if (resolved.source !== 'cache' || !isCredentialRejection(err)) throw err;
      (this.clearCachedRefreshToken ?? clearCachedRefreshToken)();
      const retry = await resolve();
      return this.mintWithRefreshToken(retry.token);
    }
  }

  /**
   * Exchange a refresh token for a 30-minute session token. Throws a
   * {@link RefreshFailedError} carrying the HTTP status, so `refresh()` can
   * tell a rejected credential from a transient upstream failure.
   */
  private async mintWithRefreshToken(refreshToken: string): Promise<MintedToken> {
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
      throw new RefreshFailedError(
        `Zola session refresh failed (${response.status}): ${truncateErrorMessage(text)}\n` +
          'To fix: set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension and sign into zola.com.',
        response.status
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
