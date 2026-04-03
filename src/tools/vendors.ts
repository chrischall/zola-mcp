import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

export function registerVendorTools(_server: McpServer): void {
  // Filled in Task 5
}
