import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
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
import { registerReconcileTools } from './tools/reconcile-registry.js';
import { registerInvitationTools } from './tools/invitations.js';
import { registerEventInvitationTools } from './tools/event-invitations.js';

const VERSION = '1.8.0'; // x-release-please-version

await runMcp({
  name: 'zola-mcp',
  version: VERSION,
  banner: `zola-mcp ${VERSION} ready`,
  deps: client,
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
    registerReconcileTools,
    registerInvitationTools,
    registerEventInvitationTools,
  ],
});
