// Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
// asserted against the SERVED tool list — what a host actually reads — for
// every tool TOOL_REGISTRARS registers, plus the `view: 'brief'` answer of
// each canonical read.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { client } from '../src/client.js';
import { TOOL_REGISTRARS } from '../src/tools/index.js';
import { setupClientMocks } from './_fixtures.js';
import { briefLine } from '../src/tools/hints.js';

type Mint = {
  domain?: string;
  intent?: string;
  canonical?: boolean;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
};
type Listed = {
  name: string;
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
  annotations?: { readOnlyHint?: boolean };
  _meta?: { mint?: Mint };
};

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const READ_INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'other'];
const WRITE_INTENTS = ['turn-on-off', 'send', 'change', 'other'];

async function withHarness<T>(fn: (h: Awaited<ReturnType<typeof createTestHarness>>) => Promise<T>): Promise<T> {
  const h = await createTestHarness((server) => {
    for (const register of TOOL_REGISTRARS) register(server, client);
  });
  try {
    return await fn(h);
  } finally {
    await h.close();
  }
}

async function served(): Promise<Listed[]> {
  return withHarness(async (h) => (await h.client.listTools()).tools as unknown as Listed[]);
}

async function briefText(name: string): Promise<string> {
  return withHarness(async (h) => {
    const res = await h.client.callTool({ name, arguments: { view: 'brief' } });
    const content = (res as { content: { type: string; text: string }[] }).content;
    expect(content[0].type).toBe('text');
    return content[0].text;
  });
}

/** A plain brief answer: one line per item. */
async function brief(name: string): Promise<string[]> {
  return (await briefText(name)).split('\n');
}

type Envelope = { untrusted_content: boolean; note: string; data: string[] };

/** A brief answer inside the fleet's untrusted-data envelope, minified, note first. */
async function enveloped(name: string): Promise<Envelope> {
  const text = await briefText(name);
  const env = JSON.parse(text) as Envelope;
  expect(text).toBe(JSON.stringify(env));
  expect(Object.keys(env)).toEqual(['untrusted_content', 'note', 'data']);
  expect(env.untrusted_content).toBe(true);
  expect(Array.isArray(env.data)).toBe(true);
  return env;
}

const BRIEF_LINE = /^.+ — (\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?|no date) — .+$/;

afterEach(() => vi.restoreAllMocks());

describe('_meta.mint on tools/list', () => {
  it('every tool except the healthcheck carries domain family and a valid intent, in the contract’s shape', async () => {
    const tools = await served();
    expect(tools.length).toBe(77);
    for (const t of tools) {
      if (t.name.endsWith('_healthcheck')) {
        expect(t._meta?.mint, t.name).toBeUndefined();
        continue;
      }
      const m = t._meta?.mint;
      expect(m, t.name).toBeDefined();
      expect(Object.keys(m!).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS).toContain(m!.domain);
      expect(m!.domain, t.name).toBe('family');
      expect(INTENTS, t.name).toContain(m!.intent);
      const isRead = t.annotations?.readOnlyHint === true;
      expect(isRead ? READ_INTENTS : WRITE_INTENTS, `${t.name} (${isRead ? 'read' : 'write'})`).toContain(m!.intent);
    }
  });

  it('canonical only on read-only whats-new/due/on tools, at most one per intent', async () => {
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical !== undefined);
    const perIntent: Record<string, string[]> = {};
    for (const t of canonical) {
      const m = t._meta!.mint!;
      expect(m.canonical, t.name).toBe(true);
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(CANONICAL_INTENTS, t.name).toContain(m.intent);
      (perIntent[m.intent!] ??= []).push(t.name);
    }
    for (const [intent, names] of Object.entries(perIntent)) expect(names.length, intent).toBeLessThanOrEqual(1);
    expect(Object.fromEntries(Object.entries(perIntent).map(([k, v]) => [k, v[0]]))).toEqual({
      'whats-new': 'list_inquiries',
      'whats-due': 'get_budget',
      'whats-on': 'list_events',
    });
  });

  it('aliases are spoken words: ≤ 8, lowercase, ≤ 40 chars, never a tool name', async () => {
    const tools = await served();
    const names = new Set(tools.map((t) => t.name));
    for (const t of tools) {
      const aliases = t._meta?.mint?.aliases;
      if (!aliases) continue;
      expect(aliases.length, t.name).toBeGreaterThan(0);
      expect(aliases.length, t.name).toBeLessThanOrEqual(8);
      for (const a of aliases) {
        expect(a.length, `${t.name}: ${a}`).toBeLessThanOrEqual(40);
        expect(a, t.name).toBe(a.toLowerCase());
        expect(names.has(a), `${t.name}: ${a}`).toBe(false);
      }
    }
  });

  it('a declared subject or when names arguments that exist in the tool’s inputSchema', async () => {
    for (const t of await served()) {
      const m = t._meta?.mint;
      const props = t.inputSchema.properties ?? {};
      if (m?.subject) {
        expect(props, t.name).toHaveProperty(m.subject);
        const e = props[m.subject].enum;
        if (e) expect(e.length, t.name).toBeGreaterThan(0);
      }
      if (m?.when) {
        expect(Object.keys(m.when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(m.when.start);
        expect(props, t.name).toHaveProperty(m.when.end);
      }
    }
  });

  it('no subject: one wedding per account, nothing to list', async () => {
    for (const t of await served()) expect(t._meta?.mint?.subject, t.name).toBeUndefined();
  });

  it('every canonical read accepts view: brief', async () => {
    for (const t of (await served()).filter((x) => x._meta?.mint?.canonical)) {
      expect(t.inputSchema.properties?.view?.enum, t.name).toEqual(['full', 'brief']);
    }
  });
});

describe('view: brief on the canonical reads', () => {
  it('list_events: one line per event, "name — start — rsvp status"', async () => {
    const spy = setupClientMocks();
    spy.mockResolvedValueOnce({
      data: [
        {
          start_date: '2026-10-17',
          events: [
            { name: 'Ceremony', start_at: '2026-10-17T18:30:00Z', collect_rsvps: true, num_guests_attending: 12, num_guests_declined: 3, num_guests_not_responded: 5 },
            { name: 'Welcome Drinks', start_at: null, collect_rsvps: false, num_guests_attending: 0, num_guests_declined: 0, num_guests_not_responded: 0 },
            { name: 'X'.repeat(200), start_at: '2026-10-18T10:00:00Z', collect_rsvps: true, num_guests_attending: 1, num_guests_declined: 0, num_guests_not_responded: 0 },
          ],
        },
      ],
    } as never);
    const lines = await brief('list_events');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Ceremony — 2026-10-17T18:30:00Z — 12 attending, 3 declined, 5 no reply');
    expect(lines[1]).toBe('Welcome Drinks — no date — not collecting rsvps');
    for (const l of lines) {
      expect(l.length, l).toBeLessThanOrEqual(120);
      expect(l).toMatch(BRIEF_LINE);
    }
  });

  it('list_inquiries: one line per vendor inquiry, "vendor — last update — read state"', async () => {
    const spy = setupClientMocks();
    const card = (vendor_name: string, singular_name: string) => ({ vendor_name, taxonomy_node: { singular_name }, city: 'Springfield', state_province: 'ST', starting_price_cents: null });
    spy.mockResolvedValueOnce({
      data: [
        {
          title: 'Active',
          inquiry_summaries: [
            { inquiry_uuid: 'i-1', vendor_card: card('Example Florals', 'Florist'), status_text: 'Replied', updated_at: Date.UTC(2026, 10, 2, 15, 0, 0), unread: true, booked: false, inquiry_status: 'REPLIED' },
            { inquiry_uuid: 'i-2', vendor_card: card('Sample Studio', 'Photographer'), status_text: 'Booked', updated_at: null, unread: false, booked: true, inquiry_status: 'BOOKED' },
          ],
        },
      ],
    } as never);
    const env = await enveloped('list_inquiries');
    expect(env.note).toMatch(/^Vendor names are written by the vendors\. /);
    const lines = env.data;
    expect(lines).toEqual([
      'Example Florals (Florist) — 2026-11-02T15:00:00.000Z — unread',
      'Sample Studio (Photographer) — no date — read, booked',
    ]);
    for (const l of lines) expect(l).toMatch(BRIEF_LINE);
  });

  it('get_budget: one line per scheduled payment, "item payment — due date — paid|due"', async () => {
    const spy = setupClientMocks();
    spy.mockResolvedValueOnce({
      data: {
        budgeted_cents: 100, cost_cents: 100, paid_cents: 0, balance_due_cents: 100,
        taxonomy_nodes: [
          {
            title: 'Essential vendors',
            items: [
              {
                uuid: 'b-1', taxonomy_node_uuid: 'n', title: 'Venue', item_type: 'VENUE', cost_cents: 0, estimated_cost_cents: 0, actual_cost_cents: 0, paid_cents: 0, note: null,
                payments: [
                  { uuid: 'p-1', payment_type: 'DEPOSIT', amount_cents: 75000, paid_at: Date.UTC(2025, 2, 26), due_at: Date.UTC(2025, 0, 24), remind_at: null },
                  { uuid: 'p-2', payment_type: 'FINAL', amount_cents: 150050, paid_at: null, due_at: Date.UTC(2026, 8, 1), remind_at: null },
                  { uuid: 'p-3', payment_type: 'OTHER', amount_cents: 1000, paid_at: null, due_at: null, remind_at: null },
                ],
              },
              { uuid: 'b-2', taxonomy_node_uuid: 'n', title: 'Cake', item_type: 'CAKE', cost_cents: 0, estimated_cost_cents: 0, actual_cost_cents: 0, paid_cents: 0, note: null, payments: [] },
            ],
          },
        ],
      },
    } as never);
    const lines = await brief('get_budget');
    expect(lines).toEqual([
      'Venue deposit $750.00 — 2025-01-24 — paid',
      'Venue final $1500.50 — 2026-09-01 — due',
      'Venue other $10.00 — no date — due',
    ]);
    for (const l of lines) expect(l).toMatch(BRIEF_LINE);
  });

  it('an empty read answers the single note line "-- none"', async () => {
    setupClientMocks().mockResolvedValueOnce({ data: [{ start_date: '2026-10-17', events: [] }] } as never);
    expect(await brief('list_events')).toEqual(['-- none']);
    vi.restoreAllMocks();
    setupClientMocks().mockResolvedValueOnce({ data: [{ title: 'Active', inquiry_summaries: [] }] } as never);
    expect((await enveloped('list_inquiries')).data).toEqual(['-- none']);
    vi.restoreAllMocks();
    setupClientMocks().mockResolvedValueOnce({
      data: { budgeted_cents: 0, cost_cents: 0, paid_cents: 0, balance_due_cents: 0, taxonomy_nodes: [{ title: 'n', items: [{ title: 'Cake', payments: [] }] }] },
    } as never);
    expect(await brief('get_budget')).toEqual(['-- none']);
  });

  it('a title that starts with "-- " or "\\" is escaped with one leading backslash', async () => {
    setupClientMocks().mockResolvedValueOnce({
      data: [{ start_date: '2026-10-17', events: [
        { name: '-- none', start_at: null, collect_rsvps: false },
        { name: '\\back', start_at: null, collect_rsvps: false },
        { name: '--fine', start_at: null, collect_rsvps: false },
      ] }],
    } as never);
    expect(await brief('list_events')).toEqual([
      '\\-- none — no date — not collecting rsvps',
      '\\\\back — no date — not collecting rsvps',
      '--fine — no date — not collecting rsvps',
    ]);
  });

  it('a line is cut to ≤ 120 chars as a WHOLE, title first', () => {
    const shortTitle = briefLine('Venue', '2026-09-01', 's'.repeat(200));
    expect(shortTitle.length).toBeLessThanOrEqual(120);
    expect(shortTitle.startsWith('Venue — 2026-09-01 — ')).toBe(true);
    const both = briefLine('T'.repeat(200), '2026-09-01', 's'.repeat(200));
    expect(both.length).toBeLessThanOrEqual(120);
    expect(both).toMatch(/^T+… — 2026-09-01 — s+…$/);
    const titleOnly = briefLine('T'.repeat(200), '2026-09-01', 'due');
    expect(titleOnly.length).toBe(120);
    expect(titleOnly.endsWith('… — 2026-09-01 — due')).toBe(true);
  });

  it('the full view is unchanged when view is omitted', async () => {
    const spy = setupClientMocks();
    spy.mockResolvedValueOnce({ data: [{ start_date: '2026-10-17', events: [{ name: 'Ceremony' }] }] } as never);
    const text = await withHarness(async (h) => {
      const res = await h.client.callTool({ name: 'list_events', arguments: {} });
      return (res as { content: { text: string }[] }).content[0].text;
    });
    expect(JSON.parse(text)).toEqual([{ name: 'Ceremony' }]);
  });
});
