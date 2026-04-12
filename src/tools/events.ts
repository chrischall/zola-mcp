import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

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

import { MobileEnvelope, ToolResult } from '../types.js';

export async function listEvents(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<EventGroup[]>>(
    'GET',
    `/v3/websites/events/wedding-accounts/${weddingAccountId}/groups`
  );
  const events = response.data.flatMap((group) => group.events);
  return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
}

export async function trackRsvps(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<{ modules: RsvpModule[] }>>(
    'GET',
    '/v3/websites/events/track-rsvps'
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data.modules, null, 2) }] };
}

export async function getGiftTracker(): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<GiftTracker>>(
    'GET',
    `/v3/gift_tracker/${registryId}`
  );
  const { info_modules: _, ...tracker } = response.data;
  return { content: [{ type: 'text', text: JSON.stringify(tracker, null, 2) }] };
}

export async function getRegistry(): Promise<ToolResult> {
  const { registryId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v4/shop/registry?registry_id=${registryId}&updated_modules=true`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateEvent(args: {
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
}): Promise<ToolResult> {
  // Load current event to merge fields
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

  const body = {
    event_entity_id: current.event_entity_id,
    uuid: current.uuid,
    wedding_account_id: current.wedding_account_id,
    type: current.type,
    name: args.name ?? current.name,
    start_at: args.start_at ?? current.start_at,
    end_at: args.end_at ?? current.end_at,
    timezone: current.timezone,
    venue_name: args.venue_name ?? current.venue_name ?? '',
    address1: args.address1 ?? current.address1 ?? '',
    address2: '',
    city: args.city ?? current.city ?? '',
    state_province: args.state_province ?? current.state_province ?? '',
    postal_code: args.postal_code ?? current.postal_code ?? '',
    country_code: args.country_code ?? current.country_code ?? 'US',
    note: args.note ?? '',
    attire: args.attire ?? '',
    collect_rsvps: args.collect_rsvps ?? current.collect_rsvps,
    public: current.public,
    display_order: 0,
    num_guests_attending: current.num_guests_attending,
    num_guests_declined: current.num_guests_declined,
    num_guests_not_responded: current.num_guests_not_responded,
    meal_options: current.meal_options,
    rsvp_questions: [],
    add_booked_vendor: false,
  };

  const result = await client.requestMobile<MobileEnvelope<WeddingEvent>>(
    'PUT',
    `/v3/websites/events/${args.event_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export function registerEventTools(server: McpServer): void {
  server.tool(
    'list_events',
    'List all wedding events (ceremony, reception, rehearsal dinner, etc.) with RSVP counts',
    {},
    listEvents
  );

  server.tool(
    'track_rsvps',
    'Get RSVP tracking summary per event (attending, declined, not responded)',
    {},
    trackRsvps
  );

  server.tool(
    'get_gift_tracker',
    'View gift tracking: total gifts received, values, thank-you note status',
    {},
    getGiftTracker
  );

  server.tool(
    'get_registry',
    'View the wedding registry with categories and items',
    {},
    getRegistry
  );

  server.tool(
    'update_event',
    'Update a wedding event (name, time, venue, location, dress code, RSVP settings)',
    {
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
    },
    updateEvent
  );
}
