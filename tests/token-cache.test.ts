import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRefreshTokenCache, refreshTokenCachePath } from '../src/token-cache.js';

// The cache exists so a hosted cold start can proceed with no browser present:
// the ~1-year refresh token is lifted from the signed-in tab ONCE and then read
// from disk. These tests pin (a) when the cache is off entirely, (b) where the
// file lands, and (c) that a malformed record is rejected rather than trusted.

describe('refresh-token cache', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zola-token-cache-'));
    file = join(dir, 'refresh-token.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('when there is nothing worth caching', () => {
    it('is off when ZOLA_REFRESH_TOKEN supplies the token directly', () => {
      // The env var IS the credential — there is no bootstrap to skip, so
      // caching would only copy a credential onto disk for nothing.
      const cache = createRefreshTokenCache({
        ZOLA_REFRESH_TOKEN: 'tok-from-env',
        ZOLA_TOKEN_FILE: file,
      });

      expect(cache).toBeNull();
    });

    it('stays READABLE when the fetchproxy fallback is disabled', () => {
      // The flag governs opening a browser, and reading a file is not that.
      // A headless run must still be able to use a token an earlier bootstrap
      // left behind — the case the cache was added for. No write guard is
      // needed: writes only happen on the fetchproxy path, which is disabled.
      const env = { ZOLA_DISABLE_FETCHPROXY: '1', ZOLA_TOKEN_FILE: file };
      createRefreshTokenCache({ ZOLA_TOKEN_FILE: file })?.save({
        refreshToken: 'tok-from-earlier-bootstrap',
      });

      const cache = createRefreshTokenCache(env);

      expect(cache).not.toBeNull();
      expect(cache?.load()).toEqual({ refreshToken: 'tok-from-earlier-bootstrap' });
    });

    it('is off when ZOLA_TOKEN_CACHE is explicitly disabled', () => {
      const cache = createRefreshTokenCache({
        ZOLA_TOKEN_CACHE: 'false',
        ZOLA_TOKEN_FILE: file,
      });

      expect(cache).toBeNull();
    });

    it('is on by default when only the bridge can mint the token', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });

      expect(cache).not.toBeNull();
    });
  });

  describe('where the file lands', () => {
    it('honours ZOLA_TOKEN_FILE verbatim', () => {
      expect(refreshTokenCachePath({ ZOLA_TOKEN_FILE: file })).toBe(file);
    });

    it('defaults under MCP_DATA_DIR — the dir mcp-host persists', () => {
      // state.dataDir: true is what makes this survive an idle-stop; without
      // the data dir the write would vanish and every cold start re-bridge.
      expect(refreshTokenCachePath({ MCP_DATA_DIR: '/data' })).toBe(
        join('/data', '.zola-mcp', 'refresh-token.json')
      );
    });

    it('falls back to HOME when no data dir is injected', () => {
      expect(refreshTokenCachePath({ HOME: '/home/someone' })).toBe(
        join('/home/someone', '.zola-mcp', 'refresh-token.json')
      );
    });
  });

  describe('round-trip', () => {
    it('loads back a saved token', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });

      cache?.save({ refreshToken: 'tok-from-bridge' });

      expect(cache?.load()).toEqual({ refreshToken: 'tok-from-bridge' });
    });

    it('writes the credential 0600 — it is a ~1-year credential at rest', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });

      cache?.save({ refreshToken: 'tok-from-bridge' });

      expect(statSync(file).mode & 0o777).toBe(0o600);
    });

    it('stores the credential inside the versioned envelope, not as a bare record', () => {
      // The envelope is what carries the binding, and a bare pre-envelope
      // record is rejected when a binding is required — so the shape on disk
      // is load-bearing, not incidental.
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });
      cache?.save({ refreshToken: 'tok-from-bridge' });

      const raw = JSON.parse(readFileSync(file, 'utf8')) as {
        v: number;
        boundTo?: { salt: string; digest: string };
        state: { refreshToken: string };
      };

      expect(raw.v).toBe(1);
      expect(raw.state).toEqual({ refreshToken: 'tok-from-bridge' });
      expect(raw.boundTo?.digest).toEqual(expect.any(String));
      // The binding is a salted digest of the mode, never a credential.
      expect(JSON.stringify(raw.boundTo)).not.toContain('fetchproxy');
    });

    it('reads nothing when no file has been written', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });

      expect(cache?.load()).toBeNull();
    });

    it('clears the stored record', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });
      cache?.save({ refreshToken: 'tok-from-bridge' });

      cache?.clear();

      expect(cache?.load()).toBeNull();
    });
  });

  describe('rejecting a record it cannot use', () => {
    it('returns null for corrupt JSON rather than throwing', () => {
      writeFileSync(file, '{ not json', 'utf8');
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });

      expect(cache?.load()).toBeNull();
    });

    it('rejects a record whose refreshToken is missing', () => {
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });
      cache?.save({ refreshToken: 'tok-from-bridge' });
      const envelope = JSON.parse(readFileSync(file, 'utf8')) as { state: unknown };
      writeFileSync(file, JSON.stringify({ ...envelope, state: {} }), 'utf8');

      expect(cache?.load()).toBeNull();
    });

    it('rejects a record whose refreshToken is empty', () => {
      // An empty credential would sail past a truthiness check on the caller
      // side and produce a confusing 401 instead of a re-bootstrap.
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });
      cache?.save({ refreshToken: 'tok-from-bridge' });
      const envelope = JSON.parse(readFileSync(file, 'utf8')) as { state: unknown };
      writeFileSync(file, JSON.stringify({ ...envelope, state: { refreshToken: '' } }), 'utf8');

      expect(cache?.load()).toBeNull();
    });
  });
});
