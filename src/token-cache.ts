// ────────────────────────────────────────────────────────────────────────────
// Refresh-token cache — persist the bridge's one output across restarts
// ────────────────────────────────────────────────────────────────────────────
//
// The fetchproxy path (see `auth.ts`) lifts the `usr` cookie out of a signed-in
// zola.com tab. That cookie is the ~1-year refresh JWT, and it is the ONLY
// thing this server needs a browser for — every call after it is a direct dial
// to mobile-api.zola.com from this process.
//
// Without persistence the asymmetry is stark: `ZolaClient.refresh()` resolves
// the refresh token again every time the 30-minute session token expires, and
// again on every cold start. Hosted on mcp-host, where the machine scales to
// zero, that means a browser must be awake, attached and holding a signed-in
// tab at nearly every cold start — to fetch a credential that stays valid for a
// year. Caching it collapses that to once.
//
// The record is written under `MCP_DATA_DIR` when the host provides one, which
// is why the registration must declare `state.dataDir: true`: without it the
// file lands on a per-boot directory and vanishes on the next idle-stop,
// leaving the re-bridging behaviour this module exists to remove.

import {
  createFileStatePersistence,
  resolveStateFile,
  type SyncStatePersistence,
} from '@chrischall/mcp-utils/session';
import { readEnvVar, parseBoolEnv } from '@chrischall/mcp-utils';

/** The cached credential: the ~1-year refresh JWT, nothing else. */
export interface CachedRefreshToken {
  /** The `usr` cookie value — used at POST /v3/sessions/refresh. */
  refreshToken: string;
}

/** Where the bootstrapped refresh token is cached between runs. */
export function refreshTokenCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveStateFile({
    env,
    envVar: 'ZOLA_TOKEN_FILE',
    subdir: '.zola-mcp',
    fileName: 'refresh-token.json',
  });
}

/**
 * Guard the stored record. An empty string is rejected as well as a missing
 * field: a blank credential would pass the caller's truthiness check and then
 * fail upstream as an opaque 401, instead of falling through to a re-bootstrap.
 */
function isCachedRefreshToken(raw: unknown): raw is CachedRefreshToken {
  if (raw === null || typeof raw !== 'object') return false;
  const record = raw as Partial<CachedRefreshToken>;
  return typeof record.refreshToken === 'string' && record.refreshToken !== '';
}

/**
 * The refresh-token cache, or `null` when this configuration has nothing worth
 * caching.
 *
 * Which auth path is in play decides, because what a mint COSTS differs:
 *
 *  - `ZOLA_REFRESH_TOKEN` — the token IS the environment variable. There is no
 *    bootstrap to skip, so caching would only copy a credential onto disk.
 *  - `ZOLA_DISABLE_FETCHPROXY` — the bridge is off, so with no env var nothing
 *    can mint a token at all; there will never be anything to store.
 *  - fetchproxy — worth caching, and the reason this module exists: a cached
 *    token lets a cold start proceed with no browser present, which on a host
 *    that has none is the difference between working and not.
 *
 * The record is bound to the path that minted it, so a token lifted from the
 * browser is never handed back under a configuration that did not come from
 * there. Only a salted digest of that discriminator is written, never a
 * credential.
 */
export function createRefreshTokenCache(
  env: NodeJS.ProcessEnv = process.env
): SyncStatePersistence<CachedRefreshToken> | null {
  if (!parseBoolEnv('ZOLA_TOKEN_CACHE', { env, default: true })) return null;
  if (readEnvVar('ZOLA_REFRESH_TOKEN', { env }) !== undefined) return null;
  if (parseBoolEnv('ZOLA_DISABLE_FETCHPROXY', { env })) return null;

  return createFileStatePersistence<CachedRefreshToken>({
    filePath: refreshTokenCachePath(env),
    boundTo: 'fetchproxy',
    validate: (raw) => (isCachedRefreshToken(raw) ? raw : null),
  });
}

/**
 * Report a cache write that failed. Not fatal: the token is re-mintable from
 * the bridge, so a lost write costs the next cold start a re-bootstrap rather
 * than access. Worth saying, though — a read-only data dir otherwise looks
 * exactly like a server that never caches, which is the failure this module was
 * added to remove.
 *
 * stderr only; stdout is the JSON-RPC channel.
 */
export function reportCacheWriteFailure(err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(
    `[zola-mcp] could not cache the refresh token (${detail}); continuing without the ` +
      'cache — every restart will need the browser bridge again until this is fixed.'
  );
}
