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

export class ZolaClient {
  private sessionToken: string | null = null;
  private sessionExpiry: Date | null = null;
  private csrfSecret: string | null = null;
  private csrfToken: string | null = null;

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.ensureSession();
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

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 401 && !isAuthRetry) {
      this.sessionToken = null;
      this.sessionExpiry = null;
      const refreshToken = process.env.ZOLA_REFRESH_TOKEN;
      if (!refreshToken) throw new Error('ZOLA_REFRESH_TOKEN must be set');
      await this.refresh(refreshToken);
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
    const refreshToken = process.env.ZOLA_REFRESH_TOKEN;
    if (!refreshToken) throw new Error('ZOLA_REFRESH_TOKEN must be set');

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

    // Attempt auto-refresh
    await this.refresh(refreshToken);
  }

  private async refresh(refreshToken: string): Promise<void> {
    // Step 1: Get fresh CSRF tokens
    try {
      const navResp = await fetch(`${BASE_URL}/web-api/v1/nav/get`, {
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          cookie: `usr=${refreshToken}`,
        },
      });
      const cookies = parseCookies(navResp.headers);
      if (cookies['_csrf']) this.csrfSecret = cookies['_csrf'];
      if (cookies['CSRF-TOKEN']) this.csrfToken = cookies['CSRF-TOKEN'];
    } catch {
      // Non-fatal: proceed without CSRF (refresh may still work)
    }

    // Step 2: Attempt session refresh
    const cookieParts = [`usr=${refreshToken}`];
    if (this.csrfSecret) cookieParts.push(`_csrf=${this.csrfSecret}`);
    if (this.csrfToken) cookieParts.push(`CSRF-TOKEN=${this.csrfToken}`);

    try {
      const refreshResp = await fetch(`${BASE_URL}/web-api/v1/user/refresh`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
          referer: `${BASE_URL}/`,
          origin: BASE_URL,
          cookie: cookieParts.join('; '),
        },
      });

      if (refreshResp.ok) {
        const cookies = parseCookies(refreshResp.headers);
        if (cookies['us']) {
          const exp = decodeJwtExp(cookies['us']);
          this.sessionToken = cookies['us'];
          this.sessionExpiry = new Date(exp * 1000);
          return;
        }
      }
    } catch {
      // fall through to error
    }

    throw new Error(
      'Zola session expired and auto-refresh failed.\n' +
        'To fix: open Zola in Chrome → DevTools → Application → Cookies → www.zola.com → ' +
        'copy the "us" cookie value → update ZOLA_SESSION_TOKEN in .env'
    );
  }

  private buildCookieHeader(): string {
    const parts: string[] = [];
    if (this.sessionToken) parts.push(`us=${this.sessionToken}`);
    const refreshToken = process.env.ZOLA_REFRESH_TOKEN;
    if (refreshToken) parts.push(`usr=${refreshToken}`);
    if (this.csrfSecret) parts.push(`_csrf=${this.csrfSecret}`);
    if (this.csrfToken) parts.push(`CSRF-TOKEN=${this.csrfToken}`);
    return parts.join('; ');
  }
}

export const client = new ZolaClient();
