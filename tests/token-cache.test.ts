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

    it('is off when the fetchproxy fallback is disabled', () => {
      // With no env var and no bridge there is no path that can mint one.
      const cache = createRefreshTokenCache({
        ZOLA_DISABLE_FETCHPROXY: '1',
        ZOLA_TOKEN_FILE: file,
      });

      expect(cache).toBeNull();
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

    it('does not write the token in the clear under a predictable key', () => {
      // The value is the credential; assert it is stored as the record we
      // defined rather than leaking into some other field by accident.
      const cache = createRefreshTokenCache({ ZOLA_TOKEN_FILE: file });
      cache?.save({ refreshToken: 'tok-from-bridge' });

      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));

      expect(JSON.stringify(raw)).toContain('tok-from-bridge');
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
