import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// resolveRefreshToken() drives three paths:
//   1. env var (ZOLA_REFRESH_TOKEN) → returned directly
//   2. fetchproxy fallback (read `usr` cookie via @fetchproxy/bootstrap)
//   3. error: tell the user to set the env var or sign in via the extension
//
// These tests verify path selection, error shapes, and that we don't
// accidentally preempt env-var auth when it's set.

// Mock @fetchproxy/bootstrap at the module boundary — never hit a real WS.
const bootstrapMock = vi.fn();
vi.mock('@fetchproxy/bootstrap', () => ({
  bootstrap: (...args: unknown[]) => bootstrapMock(...args),
}));

import { resolveRefreshToken } from '../src/auth.js';
import { createRefreshTokenCache } from '../src/token-cache.js';

describe('resolveRefreshToken', () => {
  let originalToken: string | undefined;
  let originalDisable: string | undefined;
  let originalTokenFile: string | undefined;
  let cacheDir: string;

  beforeEach(() => {
    originalToken = process.env.ZOLA_REFRESH_TOKEN;
    originalDisable = process.env.ZOLA_DISABLE_FETCHPROXY;
    originalTokenFile = process.env.ZOLA_TOKEN_FILE;
    delete process.env.ZOLA_REFRESH_TOKEN;
    delete process.env.ZOLA_DISABLE_FETCHPROXY;
    // Pin the cache at a temp path. A successful bootstrap WRITES the token,
    // so without this every fetchproxy test below would deposit a credential in
    // the developer's real $HOME.
    cacheDir = mkdtempSync(join(tmpdir(), 'zola-auth-'));
    process.env.ZOLA_TOKEN_FILE = join(cacheDir, 'refresh-token.json');
    bootstrapMock.mockReset();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ZOLA_REFRESH_TOKEN;
    else process.env.ZOLA_REFRESH_TOKEN = originalToken;
    if (originalDisable === undefined) delete process.env.ZOLA_DISABLE_FETCHPROXY;
    else process.env.ZOLA_DISABLE_FETCHPROXY = originalDisable;
    if (originalTokenFile === undefined) delete process.env.ZOLA_TOKEN_FILE;
    else process.env.ZOLA_TOKEN_FILE = originalTokenFile;
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('path 1: env-var refresh token', () => {
    it('returns ZOLA_REFRESH_TOKEN when set', async () => {
      process.env.ZOLA_REFRESH_TOKEN = 'tok-from-env';

      const result = await resolveRefreshToken();

      expect(bootstrapMock).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'tok-from-env', source: 'env' });
    });

    it('takes env-var precedence even when fetchproxy is enabled', async () => {
      process.env.ZOLA_REFRESH_TOKEN = 'tok-from-env';

      await resolveRefreshToken();

      expect(bootstrapMock).not.toHaveBeenCalled();
    });

    it('trims surrounding whitespace from the env value', async () => {
      process.env.ZOLA_REFRESH_TOKEN = '  tok-trimmed  ';

      const result = await resolveRefreshToken();

      expect(result.token).toBe('tok-trimmed');
    });
  });

  describe('path 2: fetchproxy fallback', () => {
    it('reads `usr` cookie from cookies via bootstrap()', async () => {
      bootstrapMock.mockResolvedValue({
        cookies: { usr: 'tok-from-fp' },
        localStorage: {},
        sessionStorage: {},
        capturedHeaders: {},
      });

      const result = await resolveRefreshToken();

      expect(bootstrapMock).toHaveBeenCalledTimes(1);
      const opts = bootstrapMock.mock.calls[0][0] as {
        serverName: string;
        version: string;
        domains: string[];
        declare: {
          cookies: string[];
          localStorage: string[];
          sessionStorage: string[];
          captureHeaders: unknown[];
        };
      };
      expect(opts.serverName).toBe('zola-mcp');
      expect(typeof opts.version).toBe('string');
      expect(opts.domains).toEqual(['zola.com']);
      expect(opts.declare.cookies).toEqual(['usr']);
      expect(opts.declare.localStorage).toEqual([]);
      expect(opts.declare.sessionStorage).toEqual([]);
      expect(opts.declare.captureHeaders).toEqual([]);

      expect(result.token).toBe('tok-from-fp');
      expect(result.source).toBe('fetchproxy');
    });

    it('throws the not-signed-in error (naming Zola + zola.com) when `usr` cookie is missing', async () => {
      // createAuthResolver maps "bootstrap succeeded but the declared cookie
      // is absent" to SessionNotAuthenticatedError(serviceName, signInHost).
      bootstrapMock.mockResolvedValue({
        cookies: {},
        localStorage: {},
        sessionStorage: {},
        capturedHeaders: {},
      });

      await expect(resolveRefreshToken()).rejects.toThrow(/Not signed in to Zola/);
      await expect(resolveRefreshToken()).rejects.toThrow(/zola\.com/);
    });

    it('wraps bootstrap() errors with actionable context', async () => {
      bootstrapMock.mockRejectedValue(new Error('extension offline'));

      await expect(resolveRefreshToken()).rejects.toThrow(
        /fetchproxy fallback failed: extension offline/
      );
    });

    it('handles non-Error rejections from bootstrap()', async () => {
      bootstrapMock.mockRejectedValue('plain string failure');

      await expect(resolveRefreshToken()).rejects.toThrow(
        /fetchproxy fallback failed: plain string failure/
      );
    });

    it('surfaces FetchproxyBridgeDownError.hint verbatim when the SW retry exhausts', async () => {
      // 0.8.0+: bootstrap propagates FetchproxyBridgeDownError when the
      // server's lazy-revive retry also fails. We surface the typed
      // `.hint` so users see the actionable "click the extension toolbar
      // icon" message in path 2, matching the self-service guidance in
      // path 3.
      const { FetchproxyBridgeDownError } = await import('@chrischall/mcp-utils/fetchproxy');
      const downErr = new FetchproxyBridgeDownError({
        originalError: 'content_script_unreachable',
        retryAttempted: true,
        op: 'fetch',
      });
      bootstrapMock.mockRejectedValue(downErr);

      await expect(resolveRefreshToken()).rejects.toThrow(/fetchproxy bridge is down/);
      await expect(resolveRefreshToken()).rejects.toThrow(downErr.hint);

      // The hint must also survive as the structured `.hint` on the thrown
      // error (0.7.0 handles the bridge_down branch inside createAuthResolver
      // — this pins that the bridge-down guidance reaches callers verbatim).
      const thrown = await resolveRefreshToken().then(
        () => undefined,
        (e: unknown) => e as Error & { hint?: string },
      );
      expect(thrown).toBeDefined();
      expect(thrown!.hint).toBe(downErr.hint);
      expect(thrown!.message).toContain(downErr.hint);
    });
  });

  describe('env-var sanitization', () => {
    // Matches readEnvVar hardening: treat unexpanded `${VAR}`, blank, and serialized undefined/null as unset.
    it.each(['undefined', 'null', '${ZOLA_REFRESH_TOKEN}', '   ', ''])(
      'treats ZOLA_REFRESH_TOKEN=%j as unset and falls through to fetchproxy',
      async (val) => {
        process.env.ZOLA_REFRESH_TOKEN = val;
        bootstrapMock.mockResolvedValue({
          cookies: { usr: 'tok-from-fp' },
          localStorage: {},
          sessionStorage: {},
          capturedHeaders: {},
        });

        const result = await resolveRefreshToken();

        expect(result.source).toBe('fetchproxy');
        expect(result.token).toBe('tok-from-fp');
      },
    );
  });

  describe('path 3: nothing configured', () => {
    it('skips fetchproxy when ZOLA_DISABLE_FETCHPROXY=1 is set', async () => {
      process.env.ZOLA_DISABLE_FETCHPROXY = '1';

      await expect(resolveRefreshToken()).rejects.toThrow(/ZOLA_REFRESH_TOKEN/);
      expect(bootstrapMock).not.toHaveBeenCalled();
    });

    it.each(['1', 'true', 'yes', 'on', 'TRUE'])(
      'treats ZOLA_DISABLE_FETCHPROXY=%j as disabled',
      async (val) => {
        process.env.ZOLA_DISABLE_FETCHPROXY = val;
        await expect(resolveRefreshToken()).rejects.toThrow(/ZOLA_REFRESH_TOKEN/);
        expect(bootstrapMock).not.toHaveBeenCalled();
      },
    );

    it.each(['0', 'false', 'no', '', 'off'])(
      'treats ZOLA_DISABLE_FETCHPROXY=%j as enabled (default)',
      async (val) => {
        process.env.ZOLA_DISABLE_FETCHPROXY = val;
        bootstrapMock.mockResolvedValue({
          cookies: { usr: 'tok' },
          localStorage: {},
          sessionStorage: {},
          capturedHeaders: {},
        });
        await resolveRefreshToken();
        expect(bootstrapMock).toHaveBeenCalled();
      },
    );
  });

  describe('the refresh-token cache', () => {
    const session = {
      cookies: { usr: 'tok-from-fp' },
      localStorage: {},
      sessionStorage: {},
      capturedHeaders: {},
    };

    it('serves a cached token without touching the bridge', async () => {
      // The whole point: a cold start with no browser attached still works.
      createRefreshTokenCache()?.save({ refreshToken: 'tok-from-cache' });

      const result = await resolveRefreshToken();

      expect(bootstrapMock).not.toHaveBeenCalled();
      expect(result).toEqual({ token: 'tok-from-cache', source: 'cache' });
    });

    it('caches the token after a successful bootstrap', async () => {
      bootstrapMock.mockResolvedValue(session);

      await resolveRefreshToken();

      expect(createRefreshTokenCache()?.load()).toEqual({ refreshToken: 'tok-from-fp' });
    });

    it('lets the env var win over a cached token', async () => {
      createRefreshTokenCache()?.save({ refreshToken: 'tok-from-cache' });
      process.env.ZOLA_REFRESH_TOKEN = 'tok-from-env';

      const result = await resolveRefreshToken();

      expect(result).toEqual({ token: 'tok-from-env', source: 'env' });
      expect(bootstrapMock).not.toHaveBeenCalled();
    });

    it('does not read a cached token when the cache is disabled', async () => {
      createRefreshTokenCache()?.save({ refreshToken: 'tok-from-cache' });
      process.env.ZOLA_TOKEN_CACHE = 'false';
      bootstrapMock.mockResolvedValue(session);

      try {
        const result = await resolveRefreshToken();

        expect(result.source).toBe('fetchproxy');
        expect(bootstrapMock).toHaveBeenCalled();
      } finally {
        delete process.env.ZOLA_TOKEN_CACHE;
      }
    });

    it('still returns the token when the cache write fails', async () => {
      // A read-only or unwritable data dir costs the next start a re-bootstrap;
      // it must not cost this call its credential.
      const wall = join(cacheDir, 'not-a-dir');
      writeFileSync(wall, 'x', 'utf8');
      process.env.ZOLA_TOKEN_FILE = join(wall, 'refresh-token.json');
      bootstrapMock.mockResolvedValue(session);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const result = await resolveRefreshToken();

        expect(result).toEqual({ token: 'tok-from-fp', source: 'fetchproxy' });
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('could not cache'));
      } finally {
        errSpy.mockRestore();
      }
    });
  });
});
