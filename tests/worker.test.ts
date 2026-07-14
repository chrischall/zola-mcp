import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { ZolaClient } from '../src/client.js';
import { registerVendorTools } from '../src/tools/vendors.js';
import { registerBudgetTools } from '../src/tools/budget.js';
import { registerGuestTools } from '../src/tools/guests.js';
import { registerSeatingTools } from '../src/tools/seating.js';
import { registerInquiryTools } from '../src/tools/inquiries.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerDiscoverTools } from '../src/tools/discover.js';
import { registerWebsiteTools } from '../src/tools/website.js';
import { registerWebsiteContentTools } from '../src/tools/website-content.js';
import { registerWebsiteThemeTools } from '../src/tools/website-theme.js';
import { registerRegistryItemTools } from '../src/tools/registry-items.js';
import { registerInvitationTools } from '../src/tools/invitations.js';
import { registerEventInvitationTools } from '../src/tools/event-invitations.js';

// Handshake + tool-surface test for the Zola Cloudflare remote connector, run
// inside the real Workers runtime (Miniflare) via
// `@cloudflare/vitest-pool-workers` against `wrangler.jsonc`. It proves three
// things that don't require a live Zola session:
//   1. the OAuth default handler serves discovery + the login page, and
//   2. an unauthenticated `/mcp` request is rejected before any tool code runs;
//   3. the exact registrar wiring `src/worker.ts` uses registers the full
//      Zola tool surface.
//
// The full authenticated `initialize` + `tools/list` handshake over `/mcp`
// requires a real OAuth access token minted via `workers-oauth-provider`'s
// KV-backed grant flow (POST /authorize with a real refresh token → auth code →
// POST /token), which would mean a live Zola login or extensive KV mocking —
// out of scope for a hermetic in-process test. So #3 asserts tool registration
// through the same in-memory MCP harness the stdio suite uses, wired exactly as
// `worker.ts` wires it, rather than through the token-gated `/mcp` route.

describe('Zola Cloudflare connector — OAuth surface', () => {
  it('serves the OAuth authorization-server discovery document', async () => {
    const res = await SELF.fetch('https://example.com/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string };
    expect(meta.authorization_endpoint).toContain('/authorize');
    expect(meta.token_endpoint).toContain('/token');
  });

  it('rejects an unauthenticated /mcp request', async () => {
    const res = await SELF.fetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /authorize renders the Zola login page with the refresh-token field', async () => {
    // No `client_id` query param: the login page renders without needing a
    // registered OAuth client, which is all we verify here.
    const res = await SELF.fetch('https://example.com/authorize?response_type=code&state=abc');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Zola');
    expect(html).toContain('Zola refresh token');
    expect(html).toContain('type="password"');
  });
});

describe('Zola Cloudflare connector — tool surface', () => {
  it('registers the full Zola tool set via the same wiring as worker.ts', async () => {
    const client = new ZolaClient();

    // Mirror src/worker.ts's `tools` array exactly (same order, same wiring).
    const harness = await createTestHarness((server) => {
      registerVendorTools(server, client);
      registerBudgetTools(server, client);
      registerGuestTools(server, client);
      registerSeatingTools(server, client);
      registerInquiryTools(server, client);
      registerEventTools(server, client);
      registerDiscoverTools(server, client);
      registerWebsiteTools(server, client);
      registerWebsiteContentTools(server, client);
      registerWebsiteThemeTools(server, client);
      registerRegistryItemTools(server, client);
      registerInvitationTools(server, client);
      registerEventInvitationTools(server, client);
    });

    try {
      const names = (await harness.listTools()).map((t) => t.name).sort();
      expect(names).toEqual(
        [
          'add_faq',
          'add_guest',
          'add_home_section',
          'add_poi',
          'add_registry_item',
          'add_travel_item',
          'add_vendor',
          'assign_seat',
          'create_card_project',
          'get_budget',
          'get_card_project',
          'get_card_project_guests',
          'get_card_suite',
          'get_current_theme',
          'get_gift_tracker',
          'get_inquiry_conversation',
          'get_registry',
          'get_rsvp_page',
          'get_seating_chart',
          'get_storefront',
          'get_website_customizations',
          'get_wedding_dashboard',
          'get_wedding_settings',
          'invite_guest_to_event',
          'list_card_projects',
          'list_events',
          'list_faqs',
          'list_favorite_card_suites',
          'list_favorites',
          'list_guests',
          'list_home_sections',
          'list_inquiries',
          'list_pages',
          'list_pois',
          'list_seating_charts',
          'list_travel_items',
          'list_unseated_guests',
          'list_vendors',
          'mark_inquiry_read',
          'preview_card_template',
          'preview_qrcode',
          'remove_event_invitation',
          'remove_faq',
          'remove_guest',
          'remove_home_section',
          'remove_poi',
          'remove_registry_item',
          'remove_travel_item',
          'remove_vendor',
          'reorder_pages',
          'search_card_catalog',
          'search_registry_products',
          'search_storefronts',
          'search_themes',
          'search_vendors',
          'set_card_project_guests',
          'set_card_project_qrcode',
          'set_event_guests',
          'set_page_hidden',
          'swap_card_project_variation',
          'track_rsvps',
          'update_budget_item',
          'update_current_theme',
          'update_event',
          'update_faq',
          'update_guest_address',
          'update_home_section',
          'update_page',
          'update_poi',
          'update_registry_item',
          'update_travel_item',
          'update_vendor',
          'update_website_customization',
          'update_wedding_settings',
          'validate_card_project',
        ].sort(),
      );
      expect(names.length).toBe(75);
    } finally {
      await harness.close();
    }
  });
});
