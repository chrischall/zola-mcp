import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { resolveRefreshToken } from './auth.js';

try {
  const { config } = await import('dotenv');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  config({ path: join(__dirname, '..', '.env'), override: false, quiet: true });
} catch {
  // bundled mode — rely on process.env
}

/**
 * Read an env var, trim whitespace, and treat as unset if blank or if the value
 * looks like an unsubstituted shell placeholder (e.g. `${FOO}`) — defends
 * against MCP hosts that pass .mcp.json env blocks through unexpanded.
 */
function readVar(key: string): string | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed === 'undefined' || trimmed === 'null') return undefined;
  if (/^\$\{[^}]*\}$/.test(trimmed)) return undefined;
  return trimmed;
}

const MOBILE_BASE_URL = 'https://mobile-api.zola.com';

function decodeJwtExp(token: string): number {
  const parts = token.split('.');
  if (parts.length < 3 || !parts[1]) {
    throw new Error(`Invalid JWT structure: expected 3 dot-separated parts, got ${parts.length}`);
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp: number };
  if (typeof payload.exp !== 'number') {
    throw new Error('JWT payload missing numeric "exp" claim');
  }
  return payload.exp;
}

function decodeJwtSessionId(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length < 3 || !parts[1]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

export interface UserContext {
  weddingAccountId: number;
  weddingId: number;
  registryId: string;
  userId: string;
  weddingDate: string | null;
  weddingSlug: string | null;
}

export class ZolaClient {
  private sessionToken: string | null = null;
  private sessionExpiry: Date | null = null;
  private cachedContext: UserContext | null = null;
  // WAF requires x-zola-session-id on all mobile-api.zola.com requests
  private readonly deviceSessionId = crypto.randomUUID().toUpperCase();

  /**
   * Make a request to the Zola mobile API (mobile-api.zola.com).
   * Uses Bearer JWT auth with x-zola-session-id header.
   */
  async requestMobile<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureSession();
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
    await this.ensureSession();
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

    const envAccountId = readVar('ZOLA_ACCOUNT_ID');
    const envRegistryId = readVar('ZOLA_REGISTRY_ID');
    const envWeddingId = readVar('ZOLA_WEDDING_ID');

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
    const sessionId = decodeJwtSessionId(this.sessionToken!);
    const headers: Record<string, string> = {
      accept,
      authorization: `Bearer ${this.sessionToken}`,
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
      this.sessionToken = null;
      this.sessionExpiry = null;
      await this.refresh();
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
      throw new Error(`Zola API error: ${response.status} ${response.statusText} for ${method} ${path}: ${text}`);
    }

    return response;
  }

  private async ensureSession(): Promise<void> {
    // Session still valid with comfortable margin
    if (this.sessionToken && this.sessionExpiry) {
      if (this.sessionExpiry.getTime() - Date.now() > 5 * 60 * 1000) return;
    }

    // Check for session token in env (first load only)
    if (this.sessionToken === null) {
      const envSession = readVar('ZOLA_SESSION_TOKEN');
      if (envSession) {
        try {
          const exp = decodeJwtExp(envSession);
          if (exp * 1000 - Date.now() > 5 * 60 * 1000) {
            this.sessionToken = envSession;
            this.sessionExpiry = new Date(exp * 1000);
            return;
          }
        } catch {
          // Invalid JWT in env — fall through to refresh
        }
      }
    }

    await this.refresh();
  }

  /**
   * Refresh the session using the mobile API endpoint.
   * POST /v3/sessions/refresh with the refresh token JWT.
   * Returns a new session_token (30-min) and optionally a new refresh_token.
   *
   * The refresh token comes from `resolveRefreshToken()`, which tries
   * (1) ZOLA_REFRESH_TOKEN env var, then (2) the fetchproxy 0.3.0 extension's
   * `usr` cookie on zola.com, then (3) errors with actionable guidance.
   */
  private async refresh(): Promise<void> {
    const { token: refreshToken } = await resolveRefreshToken();

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
      throw new Error(
        `Zola session refresh failed (${response.status}): ${text}\n` +
          'To fix: set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension and sign into zola.com.'
      );
    }

    const result = (await response.json()) as {
      data: { session_token: string; refresh_token: string; session_id: string };
    };

    const { session_token } = result.data;
    const exp = decodeJwtExp(session_token);
    this.sessionToken = session_token;
    this.sessionExpiry = new Date(exp * 1000);
  }
}

export const client = new ZolaClient();
