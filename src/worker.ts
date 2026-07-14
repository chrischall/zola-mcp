import { createConnector } from '@chrischall/mcp-connector';
import { ZolaClient } from './client.js';
import { zolaAuth, type ZolaProps } from './zola-auth.js';
import { registerVendorTools } from './tools/vendors.js';
import { registerBudgetTools } from './tools/budget.js';
import { registerGuestTools } from './tools/guests.js';
import { registerSeatingTools } from './tools/seating.js';
import { registerInquiryTools } from './tools/inquiries.js';
import { registerEventTools } from './tools/events.js';
import { registerDiscoverTools } from './tools/discover.js';
import { registerWebsiteTools } from './tools/website.js';
import { registerWebsiteContentTools } from './tools/website-content.js';
import { registerWebsiteThemeTools } from './tools/website-theme.js';
import { registerRegistryItemTools } from './tools/registry-items.js';
import { registerInvitationTools } from './tools/invitations.js';
import { registerEventInvitationTools } from './tools/event-invitations.js';
import pkg from '../package.json' with { type: 'json' };

// The Cloudflare remote-connector entrypoint: wires the same transport-neutral
// tool registrars the stdio server uses (`src/index.ts`) into
// `@chrischall/mcp-connector`'s generic OAuth + McpAgent harness. Each user logs
// in on the connector's own OAuth page with their personal Zola refresh token
// (the long-lived `usr` cookie — `src/zola-auth.ts`), and `buildClient` mints a
// per-user `ZolaClient` whose injected resolver hands that stored token to
// `ZolaClient.refresh()`, so concurrent sessions never share a refresh token.
//
// Zola is STATELESS — there is no local cache, so unlike the OFW connector this
// Worker declares only the `MCP_OBJECT` per-session agent Durable Object (no
// cache DO, no cache provider).
const { Agent, handler } = createConnector<ZolaProps, ZolaClient>({
  name: 'zola-mcp',
  version: pkg.version,
  auth: zolaAuth,
  buildClient: (props) =>
    new ZolaClient({
      // Per-user auth: each session token refresh re-mints from THIS operator's
      // stored `usr` refresh token, so concurrent user sessions never share a
      // session token.
      resolveRefreshToken: async () => ({ token: props.refreshToken, source: 'env' }),
    }),
  // Keep the SAME order as src/index.ts.
  tools: [
    registerVendorTools,
    registerBudgetTools,
    registerGuestTools,
    registerSeatingTools,
    registerInquiryTools,
    registerEventTools,
    registerDiscoverTools,
    registerWebsiteTools,
    registerWebsiteContentTools,
    registerWebsiteThemeTools,
    registerRegistryItemTools,
    registerInvitationTools,
    registerEventInvitationTools,
  ],
});

// The connector's per-session MCP agent Durable Object
// (`wrangler.jsonc`'s `MCP_OBJECT` → `ZolaMcpAgent`) resolves this export.
export { Agent as ZolaMcpAgent };

export default handler;
