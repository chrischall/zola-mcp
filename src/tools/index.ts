import type { McpServer } from '@modelcontextprotocol/server';
import type { ZolaClient } from '../client.js';
import { registerVendorTools } from './vendors.js';
import { registerHealthcheckTools } from './healthcheck.js';
import { registerBudgetTools } from './budget.js';
import { registerGuestTools } from './guests.js';
import { registerSeatingTools } from './seating.js';
import { registerInquiryTools } from './inquiries.js';
import { registerEventTools } from './events.js';
import { registerDiscoverTools } from './discover.js';
import { registerWebsiteTools } from './website.js';
import { registerWebsiteContentTools } from './website-content.js';
import { registerWebsiteThemeTools } from './website-theme.js';
import { registerRegistryItemTools } from './registry-items.js';
import { registerReconcileTools } from './reconcile-registry.js';
import { registerInvitationTools } from './invitations.js';
import { registerEventInvitationTools } from './event-invitations.js';

/**
 * Every tool module the server registers, in registration order. The single
 * source of truth for `src/index.ts` and for `tests/manifest-sync.test.ts`,
 * which asserts manifest.json lists exactly these tools.
 */
export const TOOL_REGISTRARS: ReadonlyArray<(server: McpServer, client: ZolaClient) => void> = [
  registerVendorTools,
  registerHealthcheckTools,
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
];
