// ────────────────────────────────────────────────────────────────────────────
// Auth resolution — createAuthResolver (shared skeleton from mcp-utils)
// ────────────────────────────────────────────────────────────────────────────
//
// The canonical three-path "browser-bootstrap + Node-direct" resolver, now the
// shared `createAuthResolver` skeleton from `@chrischall/mcp-utils` (0.7.0+):
//
//   1. Env-var credential — ZOLA_REFRESH_TOKEN set → used directly. This is
//      the ~1-year JWT that doubles as the `usr` cookie on zola.com. Reads go
//      through the hardened `readEnvVar` (blank / 'undefined' / 'null' /
//      unexpanded `${VAR}` treated as unset).
//
//   2. fetchproxy fallback — unless ZOLA_DISABLE_FETCHPROXY is truthy
//      ('1'/'true'/'yes'/'on' via `parseBoolEnv` inside the resolver), lift
//      the HttpOnly `usr` cookie out of the user's signed-in zola.com tab via
//      `@fetchproxy/bootstrap` (one-shot WebSocket bridge; `chrome.cookies.get`
//      sees HttpOnly cookies). All subsequent Zola API calls go direct to
//      mobile-api.zola.com from Node — fetchproxy is NOT in the hot path.
//      Bridge-down errors surface the FetchproxyBridgeDownError `.hint`
//      verbatim (handled inside createAuthResolver since 0.7.0); a signed-out
//      tab raises SessionNotAuthenticatedError naming Zola + zola.com.
//
//   3. Error — nothing configured: an actionable message naming
//      ZOLA_REFRESH_TOKEN, the browser sign-in fallback, and
//      ZOLA_DISABLE_FETCHPROXY.
//
// Testability: `@fetchproxy/bootstrap` is mocked at the module boundary in
// tests, exactly as before. This module still exposes a single async
// `resolveRefreshToken()` returning the JWT plus the source — callers (the
// client) treat the return value as opaque credentials.

import { bootstrap } from '@fetchproxy/bootstrap';
import { createAuthResolver, type BootstrapFn } from '@chrischall/mcp-utils';
import pkg from '../package.json' with { type: 'json' };

/** Result of resolving the Zola refresh token, regardless of path taken. */
export interface ResolvedRefreshToken {
  /** ~1-year JWT used at POST /v3/sessions/refresh. */
  token: string;
  /** Which path produced the token. Diagnostics + future cache keying. */
  source: 'env' | 'fetchproxy';
}

const resolveAuth = createAuthResolver({
  envVar: 'ZOLA_REFRESH_TOKEN',
  disableEnvVar: 'ZOLA_DISABLE_FETCHPROXY',
  // The real bootstrap has a narrower opts type than the injected boundary;
  // the cast keeps the heavy bridge dep out of the shared module's types.
  bootstrap: bootstrap as unknown as BootstrapFn,
  bootstrapOptions: {
    serverName: pkg.name,
    version: pkg.version,
    // Zola serves www.zola.com (web app) and mobile-api.zola.com (API).
    // The `usr` cookie lives on the web app's apex domain; the extension
    // matches on suffix so listing the apex covers any subdomain.
    domains: ['zola.com'],
    declare: {
      // `usr` is HttpOnly → invisible to page JS, but fetchproxy's
      // read_cookies uses `chrome.cookies.get` which DOES see HttpOnly
      // cookies. The value IS the ~1-year refresh JWT.
      cookies: ['usr'],
      localStorage: [],
      sessionStorage: [],
      captureHeaders: [],
    },
  },
  parseTokens: (session) => session.cookies['usr'],
  serviceName: 'Zola',
  signInHost: 'zola.com',
});

/**
 * Resolve the Zola refresh token using the three-path priority described
 * above. Throws with an actionable error message when no path succeeds.
 *
 * Callers (i.e. `ZolaClient.refresh()`) should treat the return value as
 * opaque credentials — do not branch on `source`. The field exists for
 * logging / future cache-keying only.
 */
export async function resolveRefreshToken(): Promise<ResolvedRefreshToken> {
  const { credential, source } = await resolveAuth();
  return { token: credential, source };
}
