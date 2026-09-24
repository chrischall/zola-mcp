import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestHarness, parseToolResult, type TestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../src/client.js';
import { registerGuestTools } from '../src/tools/guests.js';
import { registerEventTools } from '../src/tools/events.js';
import { registerEventInvitationTools } from '../src/tools/event-invitations.js';
import { registerWebsiteTools } from '../src/tools/website.js';
import { registerWebsiteContentTools, _resetPageIdCache } from '../src/tools/website-content.js';
import { registerRegistryItemTools } from '../src/tools/registry-items.js';
import { fetchRegistryCollection } from '../src/registry-collection.js';
import { setupClientMocks } from './_fixtures.js';
import { restoreConfirmEnv, snapshotConfirmEnv, type PhaseOne } from './_confirm-helpers.js';

// remove_registry_item names the item it is about to delete, which means
// reading the collection (a www.zola.com page scrape). Stub that read here;
// its own tests live in registry-collection.test.ts.
vi.mock('../src/registry-collection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/registry-collection.js')>();
  return { ...actual, fetchRegistryCollection: vi.fn() };
});

/**
 * Every irreversible or public-facing Zola write is gated by the fleet
 * confirm-token pattern. A harness created WITHOUT an elicitation handler is a
 * client that cannot be prompted — claude.ai — so under the default
 * MCP_CONFIRM_MODE (ask-user) it gets the two-phase token flow: phase 1 returns
 * a preview naming the target in the user's own terms plus a confirmToken and
 * writes nothing; phase 2 with that token performs the write exactly once.
 */

const ACCT = 1000001;
const CEREMONY = 2000002;
const RECEPTION = 2000001;

function guest(guestId: number, firstName: string, relationship: string, rsvpForCeremony: string) {
  return {
    guest_id: guestId,
    relationship_type: relationship,
    first_name: firstName,
    family_name: 'Morgan',
    email_address: 'pat@example.com',
    mobile_phone: '',
    home_phone: '',
    address1: '1 Example Street',
    address2: '',
    city: 'Charlotte',
    state_province: 'NC',
    postal_code: '00000',
    country_code: 'US',
    rsvp: rsvpForCeremony,
    event_invitations: [
      { id: 100 + guestId, event_id: CEREMONY, meal_option_id: null, rsvp_type: rsvpForCeremony, rsvp_at: null },
    ],
    tags: [],
  };
}

const GROUP = {
  guest_group_id: 3000001,
  guest_group_uuid: 'uuid-3000001',
  wedding_account_id: ACCT,
  envelope_recipient: 'Pat Morgan and Sam Morgan',
  addressing_style: 'SEMI_FORMAL',
  guest_group_affiliation: 'PRIMARY_FRIEND',
  guest_group_tier: 'A',
  invited: true,
  invitation_sent: false,
  save_the_date_sent: false,
  rsvp_question_answers: [],
  gift_count: 0,
  gift_group: null,
  thank_you_note_status: 'NOT_STARTED',
  guests: [guest(4000001, 'Pat', 'PRIMARY', 'ATTENDING'), guest(4000002, 'Sam', 'PARTNER', 'NO_RESPONSE')],
};

const EVENTS = {
  data: [
    {
      start_date: '2026-10-17',
      events: [
        {
          event_entity_id: RECEPTION,
          uuid: 'r-uuid',
          wedding_account_id: ACCT,
          type: 'RECEPTION',
          name: 'Reception',
          venue_name: 'Rooftop 230',
          address1: null,
          city: 'Charlotte',
          state_province: 'NC',
          postal_code: null,
          country_code: 'US',
          start_at: '2026-10-17T18:30:00Z',
          end_at: '2026-10-17T23:00:00Z',
          timezone: 'America/New_York',
          collect_rsvps: true,
          num_guests_attending: 50,
          num_guests_declined: 10,
          num_guests_not_responded: 133,
          meal_options: [],
          public: false,
        },
        { event_entity_id: CEREMONY, uuid: 'c-uuid', name: 'Ceremony', type: 'CEREMONY' },
      ],
    },
  ],
};

const WEDDING = {
  wedding_id: 7585869,
  account_id: 7585875,
  slug: 'alexjordan2026',
  owner_first_name: 'Alex',
  owner_last_name: 'Rivera',
  partner_first_name: 'Jordan',
  partner_last_name: 'Hall',
  title: 'Alex & Jordan',
  wedding_date: '2026-10-17',
  hashtag: null,
  enable_search_engine: false,
  enable_search_zola: false,
  city: 'Charlotte',
  state_province: 'NC',
  guest_count: 100,
};

const PAGES = {
  data: {
    home_page: { page_id: 41938915, type: 'HOME' },
    faq_page: { page_id: 41938921, type: 'FAQ' },
    poi_page: { page_id: 41938922, type: 'POI' },
    travel_page: { page_id: 41938918, type: 'TRAVEL' },
  },
};

const REGISTRY_ITEM = {
  item_id: 'item-1',
  sku_id: 'sku-1',
  name: 'Stand Mixer',
  brand: 'Example Kitchen',
  store_name: 'Zola',
  product_url: null,
  price_cents: 42999,
  image_url: null,
  type: 'PRODUCT',
  cash_fund: false,
  most_wanted: true,
  personal_note: null,
  registry_import: false,
  purchase_state: {
    requested_qty: 1,
    purchased_qty: 0,
    marked_fulfilled: false,
    attributed: false,
    availability: 'AVAILABLE',
    inconsistent: false,
  },
};

interface Live {
  faqQuestion: string;
}

/** Route every mobile-api call by method+path; record what would change upstream. */
function wire(reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>, live: Live) {
  const writes: Array<[string, string, unknown]> = [];
  reqSpy.mockImplementation((async (method: string, path: string, body?: unknown) => {
    const isRead = method === 'GET' || (method === 'POST' && path.includes('/guestlists/directory/'));
    if (!isRead) writes.push([method, path, body]);
    if (method === 'POST' && path.includes('/guestlists/directory/')) {
      return structuredClone({ data: { num_invited_guests: 2, num_guests: 2, num_addresses_missing: 0, guest_groups: [GROUP] } });
    }
    if (method === 'GET' && path.includes('/websites/events/wedding-accounts/')) return structuredClone(EVENTS);
    if (method === 'GET' && path === '/v3/users/me/context') return { data: { wedding: { ...WEDDING } } };
    if (method === 'GET' && path === '/v3/websites/pages/wedding-accounts/full') return PAGES;
    if (method === 'GET' && path.startsWith('/v3/websites/faqs/')) {
      return { data: [{ faq_entity_id: 6522901, question: live.faqQuestion, answer: 'Yes, on site.', display_order: 0 }] };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/home-sections/')) {
      return { data: [{ homepage_entity_id: 1381564, title: 'How We Met', subtitle: 'Our story', description: 'd', display_order: 0, hidden: false }] };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/points-of-interest/')) {
      return { data: [{ poi_entity_id: 5506041, title: 'Freedom Park', description: 'A park', display_order: 0 }] };
    }
    if (method === 'GET' && path.startsWith('/v3/websites/travel/')) {
      return { data: [{ travel_entity_id: 4752577, name: 'DoubleTree Suites', type: 'HOTEL', display_order: 0 }] };
    }
    if (method === 'PUT' && path.startsWith('/v3/weddings/')) return { data: body };
    if (method === 'PUT' && path.startsWith('/v3/websites/events/')) return { data: body };
    return { data: null };
  }) as never);
  return writes;
}

async function harness(): Promise<TestHarness> {
  return createTestHarness((server) => {
    registerGuestTools(server, client);
    registerEventTools(server, client);
    registerEventInvitationTools(server, client);
    registerWebsiteTools(server, client);
    registerWebsiteContentTools(server, client);
    registerRegistryItemTools(server, client);
  });
}

const GATED: Array<{
  tool: string;
  args: Record<string, unknown>;
  method: string;
  path: string;
  /** Human-readable facts the preview must carry — never only the numeric id. */
  names: string[];
}> = [
  {
    tool: 'remove_guest',
    args: { guest_group_id: 3000001 },
    method: 'PUT',
    path: `/v3/guestlists/groups/wedding-accounts/${ACCT}/delete`,
    names: ['Pat Morgan and Sam Morgan', 'Pat Morgan', 'Sam Morgan'],
  },
  {
    tool: 'set_event_guests',
    args: { event_id: CEREMONY, guest_groups: [{ guest_group_id: 3000001, invited: false }] },
    method: 'PUT',
    path: `/v3/guestlists/groups/wedding-accounts/${ACCT}/bulk/directory`,
    names: ['Ceremony', 'Pat Morgan and Sam Morgan', 'ATTENDING'],
  },
  {
    tool: 'remove_event_invitation',
    args: { event_id: CEREMONY, guest_id: 4000001 },
    method: 'PUT',
    path: `/v3/guestlists/groups/wedding-accounts/${ACCT}/bulk/directory`,
    names: ['Ceremony', 'Pat Morgan', 'ATTENDING'],
  },
  {
    tool: 'update_wedding_settings',
    args: { slug: 'new-slug' },
    method: 'PUT',
    path: '/v3/weddings/7585869',
    names: ['Alex & Jordan', 'alexjordan2026', 'new-slug'],
  },
  {
    tool: 'update_event',
    args: { event_id: RECEPTION, name: 'Dinner & Dancing' },
    method: 'PUT',
    path: `/v3/websites/events/${RECEPTION}`,
    names: ['Reception', 'Dinner & Dancing'],
  },
  {
    tool: 'remove_registry_item',
    args: { collection_item_id: 'item-1' },
    method: 'DELETE',
    path: '/v3/registries/registry-1/items/item-1',
    names: ['Stand Mixer', 'Example Kitchen'],
  },
  {
    tool: 'remove_faq',
    args: { faq_entity_id: 6522901 },
    method: 'DELETE',
    path: `/v3/websites/pages/41938921/entities/6522901/wedding-accounts/${ACCT}`,
    names: ['Is there parking?'],
  },
  {
    tool: 'remove_home_section',
    args: { homepage_entity_id: 1381564 },
    method: 'DELETE',
    path: `/v3/websites/pages/41938915/entities/1381564/wedding-accounts/${ACCT}`,
    names: ['How We Met'],
  },
  {
    tool: 'remove_poi',
    args: { poi_entity_id: 5506041 },
    method: 'DELETE',
    path: `/v3/websites/pages/41938922/entities/5506041/wedding-accounts/${ACCT}`,
    names: ['Freedom Park'],
  },
  {
    tool: 'remove_travel_item',
    args: { travel_entity_id: 4752577 },
    method: 'DELETE',
    path: `/v3/websites/pages/41938918/entities/4752577/wedding-accounts/${ACCT}`,
    names: ['DoubleTree Suites'],
  },
];

describe('confirm-token gates on irreversible Zola writes', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;
  let writes: Array<[string, string, unknown]>;
  let live: Live;
  let savedEnv: Record<string, string | undefined>;
  let h: TestHarness;

  beforeEach(async () => {
    savedEnv = snapshotConfirmEnv();
    _resetPageIdCache();
    live = { faqQuestion: 'Is there parking?' };
    reqSpy = setupClientMocks();
    writes = wire(reqSpy, live);
    vi.mocked(fetchRegistryCollection).mockResolvedValue({
      items: [REGISTRY_ITEM] as never,
      total: 1,
      limit: 100,
      offset: 0,
      registry_key: 'couple-registry',
      source: 'https://www.zola.com/registry/couple-registry',
    });
    h = await harness();
  });

  afterEach(async () => {
    await h.close();
    vi.restoreAllMocks();
    restoreConfirmEnv(savedEnv);
  });

  describe.each(GATED)('$tool', ({ tool, args, method, path, names }) => {
    it('phase 1 previews the target by name and writes nothing; phase 2 writes exactly once', async () => {
      const first = await h.callTool(tool, args);
      expect(first.isError).toBeFalsy();
      const parsed = parseToolResult<PhaseOne>(first);
      expect(parsed.status).toBe('confirmation-required');
      expect(parsed.confirmToken).toEqual(expect.any(String));
      const previewText = JSON.stringify(parsed.preview);
      for (const name of names) expect(previewText).toContain(name);
      expect(writes).toHaveLength(0);

      const second = await h.callTool(tool, { ...args, confirmToken: parsed.confirmToken });
      expect(second.isError).toBeFalsy();
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe(method);
      expect(writes[0][1]).toBe(path);
    });

    it('advertises confirmToken in its input schema', async () => {
      const { tools } = await h.client.listTools();
      const schema = tools.find((t) => t.name === tool)?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema?.properties).toHaveProperty('confirmToken');
    });

    it('refuses to write when the client cannot be prompted and MCP_CONFIRM_MODE=refuse', async () => {
      process.env.MCP_CONFIRM_MODE = 'refuse';
      const result = await h.callTool(tool, args);
      const parsed = parseToolResult<{ confirmed: boolean; dispatched: boolean; reason: string }>(result);
      expect(parsed).toMatchObject({ confirmed: false, dispatched: false, reason: 'confirmation-unsupported' });
      expect(result.content[0]).not.toHaveProperty('text', expect.stringContaining('confirmToken'));
      expect(writes).toHaveLength(0);
    });
  });

  it('a token is single-use: replaying it is refused and nothing is written again', async () => {
    const first = parseToolResult<PhaseOne>(await h.callTool('remove_guest', { guest_group_id: 3000001 }));
    await h.callTool('remove_guest', { guest_group_id: 3000001, confirmToken: first.confirmToken });
    const replay = await h.callTool('remove_guest', { guest_group_id: 3000001, confirmToken: first.confirmToken });
    expect(replay.isError).toBe(true);
    expect(parseToolResult<{ error: string }>(replay).error).toBe('TOKEN_REUSED');
    expect(writes).toHaveLength(1);
  });

  it('a token binds the exact change: different arguments are refused as DRAFT_CHANGED', async () => {
    const first = parseToolResult<PhaseOne>(
      await h.callTool('update_event', { event_id: RECEPTION, name: 'Dinner & Dancing' })
    );
    const swapped = await h.callTool('update_event', {
      event_id: RECEPTION,
      name: 'Something else entirely',
      confirmToken: first.confirmToken,
    });
    expect(swapped.isError).toBe(true);
    expect(parseToolResult<{ error: string }>(swapped).error).toBe('DRAFT_CHANGED');
    expect(writes).toHaveLength(0);
  });

  it('a token binds the target as previewed: an FAQ edited between phases is refused as DRAFT_CHANGED', async () => {
    const first = parseToolResult<PhaseOne>(await h.callTool('remove_faq', { faq_entity_id: 6522901 }));
    live.faqQuestion = 'Is there parking? (Updated: yes, use the north lot)';
    const stale = await h.callTool('remove_faq', { faq_entity_id: 6522901, confirmToken: first.confirmToken });
    expect(stale.isError).toBe(true);
    const parsed = parseToolResult<{ error: string; reason: string; preview: Record<string, unknown> }>(stale);
    expect(parsed.error).toBe('DRAFT_CHANGED');
    expect(parsed.reason).toBe('revision-changed');
    expect(JSON.stringify(parsed.preview)).toContain('north lot');
    expect(writes).toHaveLength(0);
  });

  it('a delete of something that no longer exists is an error, not a blind DELETE', async () => {
    const result = await h.callTool('remove_faq', { faq_entity_id: 999 });
    expect(result.isError).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it('remove_registry_item names the item it would delete, and refuses an unknown one', async () => {
    const result = await h.callTool('remove_registry_item', { collection_item_id: 'no-such-item' });
    expect(result.isError).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it('set_event_guests that only INVITES is additive and not gated', async () => {
    const result = await h.callTool('set_event_guests', {
      event_id: RECEPTION,
      guest_groups: [{ guest_group_id: 3000001, invited: true }],
    });
    expect(result.isError).toBeFalsy();
    expect(parseToolResult<{ status?: string }>(result).status).toBeUndefined();
    expect(writes).toHaveLength(1);
  });

  it('invite_guest_to_event is additive and not gated', async () => {
    const result = await h.callTool('invite_guest_to_event', { event_id: RECEPTION, guest_group_id: 3000001 });
    expect(result.isError).toBeFalsy();
    expect(writes).toHaveLength(1);
  });

  it('update_wedding_settings warns when the slug changes, and not otherwise', async () => {
    const slug = parseToolResult<PhaseOne>(await h.callTool('update_wedding_settings', { slug: 'new-slug' }));
    expect(JSON.stringify(slug.preview)).toMatch(/QR/);
    const title = parseToolResult<PhaseOne>(await h.callTool('update_wedding_settings', { title: 'A & J' }));
    expect(JSON.stringify(title.preview)).not.toMatch(/QR/);
    expect(JSON.stringify(title.preview)).toContain('A & J');
  });

  it('previews of guest-directory writes do not echo guest addresses, emails or phones', async () => {
    for (const { tool, args } of GATED.filter((g) => g.path.includes('/guestlists/'))) {
      const parsed = parseToolResult<PhaseOne>(await h.callTool(tool, args));
      const text = JSON.stringify(parsed.preview);
      expect(text).not.toContain('1 Example Street');
      expect(text).not.toContain('pat@example.com');
      expect(text).not.toContain('postal_code');
    }
  });
});
