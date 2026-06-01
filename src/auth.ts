// ────────────────────────────────────────────────────────────────────────────
// Auth resolution — Pattern A template
// ────────────────────────────────────────────────────────────────────────────
//
// Mirrors the canonical "browser-bootstrap + Node-direct" shape from
// ofw-mcp/src/auth.ts. Other MCPs in this family (resy-mcp, opentable-mcp,
// signupgenius-mcp, …) use the same selector — keep the structure flat,
// the path-selection explicit, and the error messages actionable.
//
// THE THREE PATHS, in priority order:
//
//   1. Env-var credential (existing behavior)
//      ZOLA_REFRESH_TOKEN set → use it directly. This is the ~1-year JWT
//      that doubles as the `usr` cookie on zola.com. Legacy users keep
//      working without action.
//
//   2. fetchproxy fallback (new)
//      When no token is set, lift the user's session out of their
//      signed-in zola.com browser tab via the fetchproxy 0.3.0 extension.
//      The `@fetchproxy/bootstrap` helper spins up a one-shot WebSocket
//      bridge, asks the extension for the HttpOnly `usr` cookie via
//      `chrome.cookies.get`, then closes the bridge. From there, all
//      Zola API calls go out via plain Node `fetch()` to
//      mobile-api.zola.com — fetchproxy is NOT in the hot path.
//
//      Users opt out with ZOLA_DISABLE_FETCHPROXY=1 (anyone who wants the
//      old behavior of "fail loudly when creds are missing").
//
//   3. Error
//      Nothing to authenticate with. We throw a message that tells the
//      user exactly what to do: set the env var, OR install the extension
//      and sign in.
//
// Why fetchproxy is only a one-shot read:
//   The bootstrap call snapshots the `usr` cookie and returns. The MCP
//   then operates from Node with direct fetch — latency and reliability
//   are not coupled to the browser bridge for normal tool calls. The
//   captured refresh token is fed into the existing
//   `POST /v3/sessions/refresh` flow which mints 30-min session tokens
//   (also in pure Node).
//
// Testability:
//   - `@fetchproxy/bootstrap` is mocked at the module boundary in tests.
//   - This module exposes a single async `resolveRefreshToken()` that
//     returns the JWT plus the source — callers (the client) treat the
//     return value as opaque credentials.

import { bootstrap } from '@fetchproxy/bootstrap';
import { classifyBridgeError, FetchproxyBridgeDownError } from '@fetchproxy/server';
import { readEnvVar } from '@chrischall/mcp-utils';
import pkg from '../package.json' with { type: 'json' };

/** Result of resolving the Zola refresh token, regardless of path taken. */
export interface ResolvedRefreshToken {
  /** ~1-year JWT used at POST /v3/sessions/refresh. */
  token: string;
  /** Which path produced the token. Diagnostics + future cache keying. */
  source: 'env' | 'fetchproxy';
}

/** True if the user has explicitly disabled the fetchproxy fallback. */
function fetchproxyDisabled(): boolean {
  const raw = readEnvVar('ZOLA_DISABLE_FETCHPROXY');
  if (raw === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/**
 * Resolve the Zola refresh token using the three-path priority described
 * above. Throws with an actionable error message when no path succeeds.
 *
 * Callers (i.e. `ZolaClient.refresh()`) should treat the return value as
 * opaque credentials — do not branch on `source`. The field exists for
 * logging / future cache-keying only.
 */
export async function resolveRefreshToken(): Promise<ResolvedRefreshToken> {
  // ── Path 1: env-var refresh token (unchanged from pre-fetchproxy behavior).
  const envToken = readEnvVar('ZOLA_REFRESH_TOKEN');
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  // ── Path 2: fetchproxy fallback (new).
  if (!fetchproxyDisabled()) {
    try {
      const session = await bootstrap({
        serverName: pkg.name,
        version: pkg.version,
        // Zola serves www.zola.com (web app) and mobile-api.zola.com (API).
        // The `usr` cookie lives on the web app's apex domain; the extension
        // matches on suffix so listing the apex covers any subdomain.
        domains: ['zola.com'],
        declare: {
          // `usr` is HttpOnly → invisible to page JS, but fetchproxy 0.3.0's
          // read_cookies uses `chrome.cookies.get` which DOES see HttpOnly
          // cookies. The value IS the ~1-year refresh JWT.
          cookies: ['usr'],
          localStorage: [],
          sessionStorage: [],
          captureHeaders: [],
        },
      });

      const token = session.cookies['usr'];
      if (!token) {
        throw new Error(
          'zola: no `usr` cookie found. ' +
            'Sign into zola.com in your browser (with the fetchproxy extension installed) and retry.',
        );
      }
      return { token, source: 'fetchproxy' };
    } catch (e) {
      // 0.8.0+ typed-error discrimination. The fetchproxy server already
      // retries once on SW eviction (bridgeReviveDelayMs=2000 default), so
      // a thrown FetchproxyBridgeDownError means the retry also failed —
      // the extension's service worker is genuinely down and the user
      // needs to wake it. The `.hint` is the actionable copy
      // ("click the extension toolbar icon...") that we'd otherwise have
      // to hand-write here. Surface it verbatim so users in path 2 get
      // the same self-service guidance as path 3.
      if (classifyBridgeError(e) === 'bridge_down') {
        const downErr = e as FetchproxyBridgeDownError;
        throw new Error(
          `Zola auth: fetchproxy bridge is down (extension service worker unreachable after retry). ${downErr.hint}`,
        );
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Zola auth: no ZOLA_REFRESH_TOKEN set, and fetchproxy fallback failed: ${msg}`,
      );
    }
  }

  // ── Path 3: nothing configured. Surface both fixes side-by-side so the
  //    user can pick whichever fits their setup.
  throw new Error(
    'Zola auth: set ZOLA_REFRESH_TOKEN, ' +
      'or install the fetchproxy extension and sign into zola.com ' +
      '(unset ZOLA_DISABLE_FETCHPROXY if it is set).',
  );
}
