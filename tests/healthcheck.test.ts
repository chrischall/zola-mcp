import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import { registerHealthcheckTools } from '../src/tools/healthcheck.js';
import type { ZolaClient } from '../src/client.js';

interface Result {
  ok: boolean;
  credential: { source: string | null; resolved: boolean };
  error?: { kind: string; message: string };
  hint: string;
}

function clientWith(
  describe_: () => Promise<{ source: string | null }>,
  probe: () => Promise<unknown>,
): ZolaClient {
  return { describeCredential: describe_, requestMobile: probe } as unknown as ZolaClient;
}

async function call(client: ZolaClient) {
  const h = await createTestHarness((server) => registerHealthcheckTools(server, client));
  const res = await h.client.callTool({ name: 'zola_healthcheck', arguments: {} });
  await h.close?.();
  return parseToolResult<Result>(res as never);
}

describe('zola_healthcheck', () => {
  it('reports the source that actually resolved', async () => {
    const r = await call(clientWith(async () => ({ source: 'fetchproxy' }), async () => ({ data: {} })));
    expect(r.ok).toBe(true);
    expect(r.credential).toMatchObject({ source: 'fetchproxy', resolved: true });
  });

  // The resolver's own error names all three ways to fix a missing credential
  // (env var, cache, sign in to zola.com); replacing it with a generic message
  // would throw away the only actionable part.
  it("surfaces the resolver's guidance verbatim when nothing resolves", async () => {
    const r = await call(
      clientWith(
        async () => {
          throw new Error('To fix: set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension and sign into zola.com.');
        },
        async () => ({}),
      ),
    );
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('no_credential');
    expect(r.error?.message).toMatch(/ZOLA_REFRESH_TOKEN/);
    expect(r.error?.message).toMatch(/zola\.com/);
  });

  it('does not probe when no credential resolved', async () => {
    let probed = false;
    await call(
      clientWith(
        async () => {
          throw new Error('nope');
        },
        async () => {
          probed = true;
          return {};
        },
      ),
    );
    expect(probed).toBe(false);
  });

  it('tells a rejected token apart from a Zola-side failure', async () => {
    const rejected = await call(
      clientWith(async () => ({ source: 'env' }), async () => {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
      }),
    );
    expect(rejected.error?.kind).toBe('credential_rejected');
    expect(rejected.hint).toMatch(/zola\.com|ZOLA_REFRESH_TOKEN/);

    const upstream = await call(
      clientWith(async () => ({ source: 'env' }), async () => {
        throw Object.assign(new Error('Bad gateway'), { status: 502 });
      }),
    );
    expect(upstream.error?.kind).toBe('http');
  });

  it('never reports the token itself', async () => {
    const r = await call(clientWith(async () => ({ source: 'cache' }), async () => ({})));
    expect(JSON.stringify(r)).not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });
});
