import type { ConnectorAuth } from '@chrischall/mcp-connector';
import { ZolaClient } from './client.js';

/**
 * OAuth props stored per user by the Cloudflare connector's OAuth provider.
 *
 * Zola's refresh token is the long-lived (~1-year) `usr` cookie JWT that
 * `POST /v3/sessions/refresh` exchanges for short-lived (30-min) session
 * tokens. Unlike the OFW connector, which stores a username/password to re-run
 * a form login, we only need to store this one long-lived token: it is
 * encrypted at rest in `OAUTH_KV` by the OAuth provider and turned back into a
 * per-user `ZolaClient` by `worker.ts`'s `buildClient`, whose injected resolver
 * hands it to `ZolaClient.refresh()`.
 *
 * The index signature satisfies `createConnector`'s
 * `Props extends Record<string, unknown>` constraint.
 */
export interface ZolaProps {
  refreshToken: string;
  [key: string]: unknown;
}

/**
 * `ConnectorAuth` for the Zola remote connector: the login page collects the
 * user's own Zola refresh token (the `usr` cookie value from zola.com),
 * verifies it by constructing a `ZolaClient` with an injected resolver that
 * returns the pasted token and forcing a session mint (a bad token makes the
 * refresh throw here, which the connector surfaces back on the login page), and
 * stores `{ refreshToken }` as the OAuth props that `worker.ts`'s `buildClient`
 * turns into a per-user client.
 */
export const zolaAuth: ConnectorAuth<ZolaProps> = {
  service: 'Zola',
  accent: '#00B0A6',
  privacyNote:
    'Your Zola refresh token (the long-lived `usr` cookie value) is stored encrypted and used only to mint short-lived session tokens to call Zola on your behalf.',
  fields: [
    {
      name: 'refreshToken',
      label: 'Zola refresh token (the `usr` cookie value from zola.com)',
      type: 'password',
    },
  ],
  async login(fields) {
    // Verify the token up front: build a client whose refresh resolver returns
    // the pasted token, then force a session mint by hitting a cheap
    // authenticated read. An invalid/expired refresh token makes `refresh()`
    // throw here — surfaced back on the login page. The response is discarded;
    // the per-user client is built fresh from the stored token by buildClient.
    const client = new ZolaClient({
      resolveRefreshToken: async () => ({ token: fields.refreshToken, source: 'env' }),
    });
    await client.requestMobile('GET', '/v3/users/me/context');
    return { refreshToken: fields.refreshToken };
  },
};
