import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

try {
  const { config } = await import('dotenv');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  config({ path: join(__dirname, '..', '.env'), override: false });
} catch {
  // bundled mode — rely on process.env
}

const BASE_URL = 'https://www.zola.com';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// Session refresh: GET this endpoint with usr+guid cookies to obtain a fresh us
// token plus CSRF tokens in one round-trip. Zola auto-refreshes on this path.
const REFRESH_PATH = '/website-nav/web-api/v1/user/get';

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

function parseCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieValues: string[] =
    typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : // Fallback for environments without getSetCookie(). The comma-split heuristic
        // can misparse cookies whose values contain commas not preceded by a space,
        // but this branch is never reached on Node 18.14+ which is our target runtime.
        (headers.get('set-cookie') ?? '').split(/,(?=[^ ])/).filter(Boolean);

  for (const raw of setCookieValues) {
    const match = raw.match(/^([^=]+)=([^;]*)/);
    if (match) cookies[match[1].trim()] = match[2].trim();
  }
  return cookies;
}

const SETUP_HINT =
  'To fix: open Zola in Chrome → DevTools → Application → Cookies → www.zola.com → ' +
  'copy "usr" → ZOLA_REFRESH_TOKEN and "guid" → ZOLA_GUID in .env';

export class ZolaClient {
  private sessionToken: string | null = null;
  private sessionExpiry: Date | null = null;
  private csrfSecret: string | null = null;
  private csrfToken: string | null = null;

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureSession();
    if (method !== 'GET') await this.ensureCsrf();
    return this.doRequest<T>(method, path, body);
  }

  private async doRequest<T>(
    method: string,
    path: string,
    body: unknown,
    isAuthRetry = false,
    isRateRetry = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      cookie: this.buildCookieHeader(),
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401 && !isAuthRetry) {
      this.sessionToken = null;
      this.sessionExpiry = null;
      await this.refresh();
      return this.doRequest<T>(method, path, body, true, isRateRetry);
    }

    if (response.status === 429) {
      if (!isRateRetry) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        return this.doRequest<T>(method, path, body, isAuthRetry, true);
      }
      throw new Error('Rate limited by Zola API');
    }

    if (!response.ok) {
      throw new Error(
        `Zola API error: ${response.status} ${response.statusText} for ${method} ${path}`
      );
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async ensureSession(): Promise<void> {
    // Session still valid with comfortable margin
    if (this.sessionToken && this.sessionExpiry) {
      if (this.sessionExpiry.getTime() - Date.now() > 5 * 60 * 1000) return;
    }

    // Note: ZOLA_SESSION_TOKEN is read from env only on first load (sessionToken === null).
    // If the env value is rotated mid-run, restart the server to pick up the new token.
    if (this.sessionToken === null) {
      const envSession = process.env.ZOLA_SESSION_TOKEN;
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

  private async ensureCsrf(): Promise<void> {
    if (this.csrfToken) return;
    // CSRF tokens are normally obtained during refresh(). This fallback handles
    // the case where a valid ZOLA_SESSION_TOKEN was used and refresh() was skipped.
    try {
      const resp = await fetch(`${BASE_URL}/`, {
        headers: { 'user-agent': USER_AGENT },
      });
      const cookies = parseCookies(resp.headers);
      if (cookies['_csrf']) this.csrfSecret = cookies['_csrf'];
      if (cookies['CSRF-TOKEN']) this.csrfToken = cookies['CSRF-TOKEN'];
    } catch {
      // non-fatal: proceed without CSRF
    }
  }

  private async refresh(): Promise<void> {
    const refreshToken = process.env.ZOLA_REFRESH_TOKEN;
    if (!refreshToken) throw new Error('ZOLA_REFRESH_TOKEN must be set');

    const guid = process.env.ZOLA_GUID;
    if (!guid) throw new Error('ZOLA_GUID must be set');

    // GET /website-nav/web-api/v1/user/get with usr+guid — Zola auto-issues a
    // fresh us token and CSRF cookies in the Set-Cookie response headers.
    const cookieParts = [`usr=${refreshToken}`, `guid=${guid}`];
    if (this.sessionToken) cookieParts.push(`us=${this.sessionToken}`);

    let resp: Response;
    try {
      resp = await fetch(`${BASE_URL}${REFRESH_PATH}`, {
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          cookie: cookieParts.join('; '),
        },
      });
    } catch (err) {
      throw new Error(`Zola session refresh network error: ${String(err)}\n${SETUP_HINT}`);
    }

    if (!resp.ok) {
      throw new Error(
        `Zola session refresh failed: ${resp.status} ${resp.statusText}\n${SETUP_HINT}`
      );
    }

    const cookies = parseCookies(resp.headers);

    if (!cookies['us']) {
      throw new Error(
        'Zola session refresh returned no session token — ZOLA_REFRESH_TOKEN or ZOLA_GUID may be expired.\n' +
          SETUP_HINT
      );
    }

    const exp = decodeJwtExp(cookies['us']);
    this.sessionToken = cookies['us'];
    this.sessionExpiry = new Date(exp * 1000);

    // Capture CSRF tokens from the same response to avoid a separate GET /
    if (cookies['_csrf']) this.csrfSecret = cookies['_csrf'];
    if (cookies['CSRF-TOKEN']) this.csrfToken = cookies['CSRF-TOKEN'];
  }

  private buildCookieHeader(): string {
    const parts: string[] = [];
    if (this.sessionToken) parts.push(`us=${this.sessionToken}`);
    const refreshToken = process.env.ZOLA_REFRESH_TOKEN;
    if (refreshToken) parts.push(`usr=${refreshToken}`);
    const guid = process.env.ZOLA_GUID;
    if (guid) parts.push(`guid=${guid}`);
    if (this.csrfSecret) parts.push(`_csrf=${this.csrfSecret}`);
    if (this.csrfToken) parts.push(`CSRF-TOKEN=${this.csrfToken}`);
    return parts.join('; ');
  }
}

export const client = new ZolaClient();
