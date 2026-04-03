import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface AccountVendor {
  uuid: string;
  vendorType: string;
  vendorName: string | null;
  booked: boolean;
  bookedAt: number | null;
  priceCents: number | null;
  eventDate: number | null;
  priority: number;
  referenceVendorId: number | null;
  referenceVendorUuid: string | null;
  vendorCard: {
    city: string | null;
    stateProvince: string | null;
    email: string | null;
  } | null;
}

interface VendorSearchResult {
  id: string;
  uuid: string;
  name: string;
  email: string | null;
  address: { city: string | null; stateProvince: string | null } | null;
  storefrontUuid: string | null;
  taxonomyNodeId: string | null;
  websiteUrl: string | null;
  phone: string | null;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

function vendorPutBody(
  vendorType: string,
  booked: boolean,
  name: string | null,
  email: string | null,
  city: string | null,
  stateProvince: string | null,
  priceCents: number | null,
  eventDate: number | null
) {
  return {
    vendorType,
    booked,
    bookingSource: 'BOOKED_VENDORS',
    eventDate,
    referenceVendorRequest: {
      id: null,
      name,
      email,
      address: { city, stateProvince },
    },
    priceCents,
    facetKeys: [] as string[],
  };
}

export async function listVendors(): Promise<ToolResult> {
  const vendors = await client.requestMarketplace<AccountVendor[]>(
    'POST',
    '/v1/account/get-or-create-vendors'
  );
  return { content: [{ type: 'text', text: JSON.stringify(vendors, null, 2) }] };
}

export async function searchVendors(args: { prefix: string }): Promise<ToolResult> {
  const results = await client.requestMarketplace<VendorSearchResult[]>(
    'POST',
    '/v1/vendor-search/name-prefix-query',
    { prefix: args.prefix }
  );
  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}

export async function addVendor(args: {
  vendorType: string;
  name: string;
  city: string;
  stateProvince: string;
  email?: string;
  priceCents?: number;
  eventDate?: string;
}): Promise<ToolResult> {
  const vendors = await client.requestMarketplace<AccountVendor[]>(
    'POST',
    '/v1/account/get-or-create-vendors'
  );
  const slot = vendors.find((v) => v.vendorType === args.vendorType && !v.booked);
  if (!slot) {
    throw new Error(`No unbooked slot found for vendor type "${args.vendorType}"`);
  }
  const body = vendorPutBody(
    args.vendorType,
    true,
    args.name,
    args.email ?? null,
    args.city,
    args.stateProvince,
    args.priceCents ?? null,
    args.eventDate ? new Date(args.eventDate).getTime() : null
  );
  const result = await client.requestMarketplace<{ accountVendor: AccountVendor }>(
    'PUT',
    `/v2/account/vendor/${slot.uuid}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.accountVendor, null, 2) }] };
}

export async function updateVendor(args: {
  uuid: string;
  name?: string;
  city?: string;
  stateProvince?: string;
  email?: string;
  priceCents?: number;
  eventDate?: string;
}): Promise<ToolResult> {
  const vendors = await client.requestMarketplace<AccountVendor[]>(
    'POST',
    '/v1/account/get-or-create-vendors'
  );
  const current = vendors.find((v) => v.uuid === args.uuid);
  if (!current) {
    throw new Error(`Vendor with UUID "${args.uuid}" not found`);
  }
  const body = vendorPutBody(
    current.vendorType,
    current.booked,
    args.name ?? current.vendorName,
    args.email ?? current.vendorCard?.email ?? null,
    args.city ?? current.vendorCard?.city ?? null,
    args.stateProvince ?? current.vendorCard?.stateProvince ?? null,
    args.priceCents ?? current.priceCents,
    args.eventDate ? new Date(args.eventDate).getTime() : current.eventDate
  );
  const result = await client.requestMarketplace<{ accountVendor: AccountVendor }>(
    'PUT',
    `/v2/account/vendor/${args.uuid}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.accountVendor, null, 2) }] };
}

export async function removeVendor(args: { uuid: string }): Promise<ToolResult> {
  const vendors = await client.requestMarketplace<AccountVendor[]>(
    'POST',
    '/v1/account/get-or-create-vendors'
  );
  const current = vendors.find((v) => v.uuid === args.uuid);
  if (!current) {
    throw new Error(`Vendor with UUID "${args.uuid}" not found`);
  }
  const body = vendorPutBody(current.vendorType, false, null, null, null, null, null, null);
  const result = await client.requestMarketplace<{ accountVendor: AccountVendor }>(
    'PUT',
    `/v2/account/vendor/${args.uuid}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.accountVendor, null, 2) }] };
}

export function registerVendorTools(server: McpServer): void {
  server.tool('list_vendors', 'List all vendor slots (booked and unbooked) and their details', {}, listVendors);

  server.tool(
    'search_vendors',
    'Search Zola marketplace vendors by name prefix',
    { prefix: z.string().describe('Vendor name prefix to search for') },
    searchVendors
  );

  server.tool(
    'add_vendor',
    'Mark an unbooked vendor slot as booked with vendor details',
    {
      vendorType: z
        .string()
        .describe(
          'Vendor category (VENUE, PHOTOGRAPHER, FLORIST, MUSICIAN_DJ, PLANNER, VIDEOGRAPHER, HAIR_MAKEUP, CAKES_DESSERTS)'
        ),
      name: z.string().describe('Vendor business name'),
      city: z.string().describe('City where vendor is based'),
      stateProvince: z.string().describe('State abbreviation (e.g. NC)'),
      email: z.string().optional().describe('Vendor contact email'),
      priceCents: z.number().optional().describe('Total price in cents'),
      eventDate: z.string().optional().describe('Event date in ISO 8601 format (e.g. 2026-10-16)'),
    },
    addVendor
  );

  server.tool(
    'update_vendor',
    'Update details of an existing booked vendor slot',
    {
      uuid: z.string().describe('Vendor slot UUID (from list_vendors)'),
      name: z.string().optional(),
      city: z.string().optional(),
      stateProvince: z.string().optional(),
      email: z.string().optional(),
      priceCents: z.number().optional(),
      eventDate: z.string().optional().describe('ISO 8601 date'),
    },
    updateVendor
  );

  server.tool(
    'remove_vendor',
    'Unbook a vendor slot, clearing all its details',
    { uuid: z.string().describe('Vendor slot UUID (from list_vendors)') },
    removeVendor
  );
}
