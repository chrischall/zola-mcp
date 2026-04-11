import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

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
}
