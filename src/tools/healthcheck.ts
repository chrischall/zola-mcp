import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCredentialHealthcheckTool } from '@chrischall/mcp-utils/healthcheck';
import type { ZolaClient } from '../client.js';

/**
 * Register `zola_healthcheck` — resolves the refresh token the way real tools
 * do, then makes one authenticated call to `/v4/your-wedding`.
 *
 * Zola uses fetchproxy only to BOOTSTRAP a credential (the `usr` cookie off a
 * signed-in zola.com tab); every request after that is a plain API call. So
 * health here is about the credential, not a bridge — and the three failures
 * are worth telling apart: nothing resolved a refresh token, Zola rejected the
 * one we have, or Zola is down.
 *
 * `/v4/your-wedding` is the probe because it is the cheapest endpoint that
 * requires a minted session token, so it exercises the whole refresh path
 * rather than just the stored credential.
 */
export function registerHealthcheckTools(server: McpServer, client: ZolaClient): void {
  registerCredentialHealthcheckTool({
    server,
    prefix: 'zola',
    hostLabel: 'mobile-api.zola.com',
    probePath: '/v4/your-wedding',
    resolveCredential: () => client.describeCredential(),
    probeFn: () => client.requestMobile('GET', '/v4/your-wedding'),
    hints: {
      credential_rejected:
        'Zola rejected the refresh token. Re-sign in at zola.com so the fetchproxy extension can lift a fresh `usr` cookie, or set a new ZOLA_REFRESH_TOKEN.',
    },
  });
}
