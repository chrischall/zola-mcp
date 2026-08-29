// ────────────────────────────────────────────────────────────────────────────
// Auth resolution — createAuthResolver (shared skeleton from mcp-utils)
// ────────────────────────────────────────────────────────────────────────────
//
// The canonical "browser-bootstrap + Node-direct" resolver, built on the shared
// `createAuthResolver` skeleton from `@chrischall/mcp-utils` (0.7.0+), with a
// disk cache in front of the bridge (see `token-cache.ts` for why):
//
//   1. Env-var credential — ZOLA_REFRESH_TOKEN set → used directly. This is
//      the ~1-year JWT that doubles as the `usr` cookie on zola.com. Reads go
//      through the hardened `readEnvVar` (blank / 'undefined' / 'null' /
//      unexpanded `${VAR}` treated as unset).
//
//   2. Disk cache — the refresh token a previous bootstrap lifted from the
//      browser, kept under `$MCP_DATA_DIR` (see `token-cache.ts`). It is what
//      lets a cold start proceed with no browser attached at all. Inert when
//      the env var is set, so path 1 keeps precedence.
//
//   3. fetchproxy fallback — unless ZOLA_DISABLE_FETCHPROXY is truthy
//      ('1'/'true'/'yes'/'on' via `parseBoolEnv` inside the resolver), lift
//      the HttpOnly `usr` cookie out of the user's signed-in zola.com tab via
//      `@fetchproxy/bootstrap` (one-shot WebSocket bridge; `chrome.cookies.get`
//      sees HttpOnly cookies). All subsequent Zola API calls go direct to
//      mobile-api.zola.com from Node — fetchproxy is NOT in the hot path.
//      Bridge-down errors surface the FetchproxyBridgeDownError `.hint`
//      verbatim (handled inside createAuthResolver since 0.7.0); a signed-out
//      tab raises SessionNotAuthenticatedError naming Zola + zola.com.
//
//   4. Error — nothing configured: an actionable message naming
//      ZOLA_REFRESH_TOKEN, the browser sign-in fallback, and
//      ZOLA_DISABLE_FETCHPROXY.
//
// Testability: `@fetchproxy/bootstrap` is mocked at the module boundary in
// tests, exactly as before. This module still exposes a single async
// `resolveRefreshToken()` returning the JWT plus the source. Callers treat the
// JWT as opaque; `source` is diagnostic except for the one documented use in
// `ZolaClient.refresh()`, which needs to know a credential came from the cache
// to decide whether a rejection is worth re-resolving.

import { bootstrap } from '@fetchproxy/bootstrap';
import { createAuthResolver, type BootstrapFn } from '@chrischall/mcp-utils';
import pkg from '../package.json' with { type: 'json' };
import { createRefreshTokenCache, reportCacheWriteFailure } from './token-cache.js';

/** Result of resolving the Zola refresh token, regardless of path taken. */
export interface ResolvedRefreshToken {
  /** ~1-year JWT used at POST /v3/sessions/refresh. */
  token: string;
  /**
   * Which path produced the token. Diagnostics — with one exception: a
   * `'cache'` token is the only one worth discarding and re-resolving when the
   * API rejects it (see `ZolaClient.refresh()`), because it is the only one
   * that can be stale while a working path to a fresh credential still exists.
   */
  source: 'env' | 'fetchproxy' | 'cache';
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
 * Resolve the Zola refresh token using the four-path priority described above.
 * Throws with an actionable error message when no path succeeds.
 *
 * Callers treat `token` as an opaque credential. The only sanctioned use of
 * `source` is `ZolaClient.refresh()`'s stale-cache recovery — see
 * {@link ResolvedRefreshToken.source}.
 */
export async function resolveRefreshToken(): Promise<ResolvedRefreshToken> {
  // The cache sits between the env var and the bridge, and is inert whenever
  // the env var is set (`createRefreshTokenCache` returns null), so path 1
  // keeps its precedence without being checked twice.
  const cache = createRefreshTokenCache();
  const cached = cache?.load();
  if (cached) return { token: cached.refreshToken, source: 'cache' };

  const { credential, source } = await resolveAuth();

  // Persist only what the bridge produced. An env-var credential is already
  // durable, and re-writing it would put a credential on disk that the operator
  // never asked us to store.
  if (source === 'fetchproxy' && cache) {
    try {
      cache.save({ refreshToken: credential });
    } catch (err) {
      reportCacheWriteFailure(err);
    }
  }

  return { token: credential, source };
}

/**
 * Discard the cached refresh token, so the next {@link resolveRefreshToken}
 * goes back to the bridge. Called when the API rejects a cached credential —
 * see `ZolaClient.refresh()`, which owns the decision about which rejections
 * mean "stale" and which are merely transient.
 */
export function clearCachedRefreshToken(): void {
  createRefreshTokenCache()?.clear();
}
