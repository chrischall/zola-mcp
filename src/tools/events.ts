import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';

interface WeddingEvent {
  event_entity_id: number;
  uuid: string;
  wedding_account_id: number;
  type: string;
  name: string;
  venue_name: string | null;
  address1: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country_code: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  collect_rsvps: boolean;
  num_guests_attending: number;
  num_guests_declined: number;
  num_guests_not_responded: number;
  meal_options: unknown[];
  public: boolean;
  address2?: string | null;
  note?: string | null;
  attire?: string | null;
  display_order?: number | null;
  rsvp_questions?: unknown[] | null;
  /** The PUT is a full replace, so anything else the server returns is carried too. */
  [key: string]: unknown;
}

interface EventGroup {
  start_date: string;
  events: WeddingEvent[];
}

interface RsvpModule {
  event_id: number;
  event_name: string;
  event_start_date: string;
  num_guests_attending: number;
  num_guests_declined: number;
  num_guests_not_responded: number;
  items: unknown[];
  type: string;
}

interface GiftEntry {
  type: string;
  title: string;
  price_cents: number;
  quantity: number;
  gifter_name: string | null;
  thank_you_note_status: string;
}

interface GiftTracker {
  gifts_available_to_send: number;
  cash_available_to_transfer_cents: number;
  total_gifts_received: number;
  total_gift_value: number;
  surprise_gift_count: number;
  info_modules: unknown[];
  gifts: GiftEntry[];
}

import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';
import { fetchRegistryCollection } from '../registry-collection.js';
import { CONFIRM_NOTE, confirmTokenParam, confirmWrite, diffFields, type GatedResult, type ServerContext } from './_confirm.js';

export async function listEvents(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<EventGroup[]>>(
    'GET',
    `/v3/websites/events/wedding-accounts/${weddingAccountId}/groups`
  );
  const events = response.data.flatMap((group) => group.events);
  return jsonResult(events);
}

export async function trackRsvps(client: ZolaClient): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<{ modules: RsvpModule[] }>>(
    'GET',
    '/v3/websites/events/track-rsvps'
  );
  return jsonResult(response.data.modules);
}

/**
 * Collapse an item's `image_links` map to a single canonical URL.
 *
 * The map holds ~15 keys (`A_84`, `A_96`, `A_138`, `A_300`, `A_640`, `A_1242`,
 * …) that are all the same base URL with different `w`/`h` query params. They
 * differ only in size, so one is enough. The widest is kept, matching
 * `canonicalImageUrl` on the registry side.
 */
function collapseImageLinks(item: Record<string, unknown>): Record<string, unknown> {
  const { image_links: links, ...rest } = item;
  let imageUrl: string | null = null;

  if (links && typeof links === 'object') {
    // Keys are `A_<width>`. Taking the first entry yielded the 84px thumbnail,
    // while `canonicalImageUrl` on the registry side prefers the largest — so
    // the two projections disagreed about which URL is "the" image. Pick the
    // widest here so they match.
    let widest = -1;
    for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
      if (typeof value !== 'string' || value === '') continue;
      const width = Number(/^A_(\d+)$/.exec(key)?.[1] ?? Number.NaN);
      const rank = Number.isFinite(width) ? width : 0;
      if (rank > widest) {
        widest = rank;
        imageUrl = value;
      }
    }
  }

  return { ...rest, image_url: imageUrl };
}

export async function getGiftTracker(client: ZolaClient): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<GiftTracker>>(
    'GET',
    `/v3/gift_tracker/${registryId}`
  );
  const { info_modules: _, ...tracker } = response.data;
  return jsonResult(projectGiftTracker(tracker));
}

/**
 * Strip presentation payloads from a gift-tracker response.
 *
 * Two things dominate this endpoint's size, and neither is gift data:
 *
 *  - `order_groups[].modules` — a `THANK_YOU_CARDS_PROMO` block per order, each
 *    carrying a full card-suite catalog. **26.5 KB per order**, ~106 KB of a
 *    154 KB response. This is the real bulk, not the image links.
 *  - `image_links` — ~15 keys per item, all the same base URL with different
 *    `w`/`h` params. ~1.3 KB per item.
 *
 * `info_modules` is dropped by the caller for the same reason. Together these
 * take the response from ~154 KB to ~12 KB without losing a single field the
 * reconciler reads.
 */
export function projectGiftTracker<T extends Record<string, unknown>>(tracker: T): T {
  const groups = (tracker as { order_groups?: unknown }).order_groups;
  if (!Array.isArray(groups)) return tracker;

  const projected = groups.map((group) => {
    const { modules: _promo, ...g } = group as Record<string, unknown>;
    const containers = Array.isArray(g.containers) ? g.containers : [];
    return {
      ...g,
      containers: containers.map((container) => {
        const c = container as Record<string, unknown>;
        const items = Array.isArray(c.items) ? c.items : [];
        return { ...c, items: items.map((i) => collapseImageLinks(i as Record<string, unknown>)) };
      }),
    };
  });

  return { ...tracker, order_groups: projected };
}

/**
 * Read the couple's registry collection, with per-item purchase state.
 *
 * This does **not** call `GET /v4/shop/registry` any more. That endpoint
 * returns HTTP 200 and ~4 MB of Shop *browse* content (search widgets,
 * carousels, partner retailers) containing zero registry items — which is why
 * this tool previously failed 100% of the time: the request succeeded and the
 * 4 MB result then died at the MCP boundary, surfacing only "Error occurred
 * during tool execution". The mobile API exposes no GET for the collection at
 * all; `OPTIONS /v3/registries/{id}/collections` reports `allow: POST, OPTIONS`.
 *
 * See `src/registry-collection.ts` for the full diagnosis and the source now
 * used instead.
 */
export async function getRegistry(
  client: ZolaClient,
  args: { limit?: number; offset?: number } = {}
): Promise<ToolResult> {
  const collection = await fetchRegistryCollection(client, {
    limit: args.limit ?? 100,
    offset: args.offset ?? 0,
  });
  return jsonResult(collection);
}

export async function updateEvent(client: ZolaClient, args: {
  event_id: number;
  name?: string;
  start_at?: string;
  end_at?: string;
  venue_name?: string;
  address1?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  note?: string;
  attire?: string;
  collect_rsvps?: boolean;
  confirmToken?: string;
}, ctx: ServerContext): Promise<GatedResult> {
  const { weddingAccountId } = await client.getContext();
  const listResponse = await client.requestMobile<MobileEnvelope<EventGroup[]>>(
    'GET',
    `/v3/websites/events/wedding-accounts/${weddingAccountId}/groups`
  );
  const allEvents = listResponse.data.flatMap((g) => g.events);
  const current = allEvents.find((e) => e.event_entity_id === args.event_id);
  if (!current) {
    throw new Error(`Event with ID ${args.event_id} not found`);
  }

  // PUT /v3/websites/events/{id} is a full replace: any field left out (or
  // sent blank) is wiped. Start from the event exactly as read — note, attire,
  // address2, rsvp_questions, display_order and anything else the server
  // returns — and overlay only what the caller supplied. Same read-modify-write
  // defence as the guest-group writes (docs/zola-api-quirks.md §1/§5).
  const body = {
    ...current,
    name: args.name ?? current.name,
    start_at: args.start_at ?? current.start_at,
    end_at: args.end_at ?? current.end_at,
    venue_name: args.venue_name ?? current.venue_name ?? '',
    address1: args.address1 ?? current.address1 ?? '',
    address2: current.address2 ?? '',
    city: args.city ?? current.city ?? '',
    state_province: args.state_province ?? current.state_province ?? '',
    postal_code: args.postal_code ?? current.postal_code ?? '',
    country_code: args.country_code ?? current.country_code ?? 'US',
    note: args.note ?? current.note ?? '',
    attire: args.attire ?? current.attire ?? '',
    collect_rsvps: args.collect_rsvps ?? current.collect_rsvps,
    display_order: current.display_order ?? 0,
    rsvp_questions: current.rsvp_questions ?? [],
    add_booked_vendor: false,
  };

  // Guests plan travel around these details and collect_rsvps turns RSVPs on
  // or off, so the change is previewed old -> new and confirmed first.
  const supplied = (Object.keys(args) as Array<keyof typeof args>).filter(
    (k) => k !== 'event_id' && k !== 'confirmToken' && args[k] !== undefined
  );
  const changes = diffFields(current as Record<string, unknown>, body as Record<string, unknown>, supplied);
  const path = `/v3/websites/events/${args.event_id}`;
  const changed = Object.keys(changes);
  const gate = await confirmWrite(ctx, {
    tool: 'update_event',
    action: 'zola.event.update',
    label: `Update event "${current.name}"` + (changed.length > 0 ? `: ${changed.join(', ')}` : ' (no field changes)'),
    method: 'PUT',
    path,
    target: String(args.event_id),
    current,
    body,
    showBody: false,
    about: {
      event: current.name,
      starts_at: current.start_at,
      changes,
      ...('collect_rsvps' in changes
        ? { note: body.collect_rsvps ? 'Guests will be asked to RSVP for this event.' : 'Guests can no longer RSVP for this event.' }
        : {}),
    },
    confirmToken: args.confirmToken,
  });
  if (gate) return gate;

  const result = await client.requestMobile<MobileEnvelope<WeddingEvent>>('PUT', path, body);
  return jsonResult(result.data);
}

export function registerEventTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('list_events', {
    description: 'List all wedding events (ceremony, reception, rehearsal dinner, etc.) with RSVP counts',
    annotations: { readOnlyHint: true },
  }, () => listEvents(client));

  server.registerTool('track_rsvps', {
    description: 'Get RSVP tracking summary per event (attending, declined, not responded)',
    annotations: { readOnlyHint: true },
  }, () => trackRsvps(client));

  server.registerTool('get_gift_tracker', {
    description: 'View gift tracking: total gifts received, values, thank-you note status',
    annotations: { readOnlyHint: true },
  }, () => getGiftTracker(client));

  server.registerTool('get_registry', {
    description:
      "View the couple's registry items with derived purchase state per item " +
      '(requested_qty, purchased_qty, marked_fulfilled, availability, inconsistent). ' +
      'Paged via limit/offset.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Max items to return. Default 100'),
      offset: z.number().optional().describe('Item offset. Default 0'),
    }),
    annotations: { readOnlyHint: true },
  }, (args) => getRegistry(client, args));

  server.registerTool('update_event', {
    description: `Update a wedding event (name, time, venue, location, dress code, RSVP settings). Guests see these details on the website. ${CONFIRM_NOTE}`,
    inputSchema: z.object({
      event_id: z.number().describe('Event entity ID from list_events'),
      name: z.string().optional().describe('Event name'),
      start_at: z.string().optional().describe('Start time ISO 8601 (e.g. 2026-10-17T18:30:00Z)'),
      end_at: z.string().optional().describe('End time ISO 8601'),
      venue_name: z.string().optional().describe('Venue name'),
      address1: z.string().optional().describe('Street address'),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
      note: z.string().optional().describe('Event notes/description'),
      attire: z.string().optional().describe('Dress code'),
      collect_rsvps: z.boolean().optional().describe('Whether to collect RSVPs for this event'),
      confirmToken: confirmTokenParam,
    }),
    annotations: { destructiveHint: true, idempotentHint: true },
  }, (args, ctx) => updateEvent(client, args, ctx));
}
