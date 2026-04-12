import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';
import { MobileEnvelope, ToolResult } from '../types.js';

interface VendorCard {
  id: number | null;
  storefront_id: number | null;
  storefront_uuid: string | null;
  vendor_name: string;
  taxonomy_node: { key: string; label: string; singular_name: string } | null;
  city: string | null;
  state_province: string | null;
  email: string | null;
  starting_price_cents: number | null;
}

interface BookedVendor {
  id: number;
  uuid: string;
  account_id: number;
  vendor_type: string;
  vendor_name: string;
  vendor_card: VendorCard | null;
  booked: boolean;
  price_cents: number | null;
  event_date: number | null;
}

interface BookedListResponse {
  booked_vendors: BookedVendor[];
}

interface TypeaheadResult {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: { city: string | null; state_province_region: string | null } | null;
}

export async function listVendors(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<BookedListResponse>>(
    'POST',
    '/v3/account-vendors/booked-list',
    {}
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data.booked_vendors, null, 2) }] };
}

export async function searchVendors(args: {
  query: string;
  taxonomy_key?: string;
}): Promise<ToolResult> {
  const results = await client.requestMobile<MobileEnvelope<TypeaheadResult[]>>(
    'POST',
    '/v3/reference-vendors/typeahead-taxonomy',
    {
      query: args.query,
      taxonomy_key: args.taxonomy_key ?? 'wedding-venues',
    }
  );
  return { content: [{ type: 'text', text: JSON.stringify(results.data, null, 2) }] };
}

export async function addVendor(args: {
  vendor_type: string;
  name: string;
  city: string;
  state_province: string;
  email?: string;
  phone?: string;
  price_cents?: number;
  event_date?: string;
  reference_vendor_id?: number;
}): Promise<ToolResult> {
  // Find an unbooked slot for this vendor type
  const listResponse = await client.requestMobile<MobileEnvelope<BookedListResponse>>(
    'POST',
    '/v3/account-vendors/booked-list',
    {}
  );
  const slot = listResponse.data.booked_vendors.find(
    (v) => v.vendor_type === args.vendor_type && !v.booked
  );
  if (!slot) {
    throw new Error(`No unbooked slot for vendor type "${args.vendor_type}"`);
  }

  const body = {
    uuid: slot.uuid,
    id: 0,
    vendor_type: args.vendor_type,
    booked: true,
    booking_source: 'BOOKED_VENDORS',
    price_cents: args.price_cents ?? 0,
    event_date: args.event_date ? new Date(args.event_date).getTime() : null,
    sync_with_budget_tool_enabled: true,
    facet_keys: [],
    reference_vendor_request: {
      id: args.reference_vendor_id ?? null,
      name: args.name,
      email: args.email ?? null,
      phone: args.phone ?? null,
      address: {
        city: args.city,
        state_province_region: args.state_province,
      },
    },
  };

  const result = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    '/v5/account-vendors/vendor',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export async function updateVendor(args: {
  uuid: string;
  name?: string;
  city?: string;
  state_province?: string;
  email?: string;
  price_cents?: number;
  event_date?: string;
}): Promise<ToolResult> {
  const listResponse = await client.requestMobile<MobileEnvelope<BookedListResponse>>(
    'POST',
    '/v3/account-vendors/booked-list',
    {}
  );
  const current = listResponse.data.booked_vendors.find((v) => v.uuid === args.uuid);
  if (!current) {
    throw new Error(`Vendor with UUID "${args.uuid}" not found`);
  }

  const body = {
    uuid: args.uuid,
    id: current.id,
    vendor_type: current.vendor_type,
    booked: true,
    booking_source: 'BOOKED_VENDORS',
    price_cents: args.price_cents ?? current.price_cents ?? 0,
    event_date: args.event_date
      ? new Date(args.event_date).getTime()
      : current.event_date,
    sync_with_budget_tool_enabled: true,
    facet_keys: [],
    reference_vendor_request: {
      id: current.vendor_card?.id ?? null,
      name: args.name ?? current.vendor_name,
      email: args.email ?? current.vendor_card?.email ?? null,
      address: {
        city: args.city ?? current.vendor_card?.city ?? null,
        state_province_region: args.state_province ?? current.vendor_card?.state_province ?? null,
      },
    },
  };

  const result = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    '/v5/account-vendors/vendor',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export async function removeVendor(args: { uuid: string }): Promise<ToolResult> {
  await client.requestMobile(
    'POST',
    '/v3/account-vendors/vendor/unbook',
    { uuid: args.uuid }
  );
  return { content: [{ type: 'text', text: `Unbooked vendor ${args.uuid}` }] };
}

export function registerVendorTools(server: McpServer): void {
  server.registerTool('list_vendors', {
    description: 'List all booked vendors with details',
    annotations: { readOnlyHint: true },
  }, listVendors);

  server.registerTool('search_vendors', {
    description: 'Search for vendors by name (typeahead) within a vendor category',
    inputSchema: {
      query: z.string().describe('Vendor name to search for'),
      taxonomy_key: z.string().optional().describe('Vendor category key (e.g. wedding-venues, wedding-photographers, wedding-planners, wedding-bands-djs). Default: wedding-venues'),
    },
    annotations: { readOnlyHint: true },
  }, searchVendors);

  server.registerTool('add_vendor', {
    description: 'Book a new vendor',
    inputSchema: {
      vendor_type: z.string().describe('Vendor type (VENUE, PHOTOGRAPHER, FLORIST, MUSICIAN_DJ, PLANNER, VIDEOGRAPHER, HAIR_MAKEUP, CAKES_DESSERTS)'),
      name: z.string().describe('Vendor business name'),
      city: z.string().describe('City'),
      state_province: z.string().describe('State abbreviation (e.g. NC)'),
      email: z.string().optional().describe('Vendor email'),
      phone: z.string().optional().describe('Vendor phone'),
      price_cents: z.number().optional().describe('Total price in cents'),
      event_date: z.string().optional().describe('Event date ISO 8601'),
      reference_vendor_id: z.number().optional().describe('Reference vendor ID from search_vendors'),
    },
    annotations: { destructiveHint: false },
  }, addVendor);

  server.registerTool('update_vendor', {
    description: 'Update a booked vendor\'s details',
    inputSchema: {
      uuid: z.string().describe('Vendor UUID from list_vendors'),
      name: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      email: z.string().optional(),
      price_cents: z.number().optional(),
      event_date: z.string().optional().describe('ISO 8601 date'),
    },
    annotations: { destructiveHint: false },
  }, updateVendor);

  server.registerTool('remove_vendor', {
    description: 'Unbook a vendor',
    inputSchema: { uuid: z.string().describe('Vendor UUID from list_vendors') },
    annotations: { destructiveHint: true },
  }, removeVendor);
}
