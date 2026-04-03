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

export function registerVendorTools(_server: McpServer): void {
  // Filled in Task 5
}
