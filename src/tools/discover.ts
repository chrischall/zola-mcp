import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

import { MobileEnvelope, ToolResult } from '../types.js';

export async function getWeddingDashboard(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v4/your-wedding'
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function searchStorefronts(args: {
  taxonomy_node_id: number;
  city: string;
  state_province: string;
  limit?: number;
  offset?: number;
}): Promise<ToolResult> {
  const body = {
    taxonomy_node_id: args.taxonomy_node_id,
    city: args.city,
    state: args.state_province,
    limit: args.limit ?? 24,
    offset: args.offset ?? 0,
    facets: {},
    metro_types: ['HOME', 'HOME_SERVICE', 'AWAY'],
    metros: [],
    exclude_inquired_storefronts: false,
    exclude_booked_storefronts: false,
    boost_featured_storefronts: false,
    suggested_vendors_for_inquiry_limit: 12,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/storefronts/search',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function getStorefront(args: { uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/storefronts/${args.uuid}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function listFavorites(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/favorites/'
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export function registerDiscoverTools(server: McpServer): void {
  server.registerTool('get_wedding_dashboard', {
    description: 'Get the wedding planning dashboard overview (invites, paper, planning progress)',
    annotations: { readOnlyHint: true },
  }, getWeddingDashboard);

  server.registerTool('search_storefronts', {
    description: 'Search Zola vendor marketplace by category and location (1=Venues, 2=Photographers, 3=Florists, 7=Planners, 9=Bands/DJs)',
    inputSchema: {
      taxonomy_node_id: z.number().describe('Vendor category ID (1=Venues, 2=Photographers, 3=Florists, 7=Planners, 9=Bands/DJs)'),
      city: z.string().describe('City name (e.g. Charlotte)'),
      state_province: z.string().describe('State abbreviation (e.g. NC)'),
      limit: z.number().optional().describe('Results per page (default 24)'),
      offset: z.number().optional().describe('Pagination offset (default 0)'),
    },
    annotations: { readOnlyHint: true },
  }, searchStorefronts);

  server.registerTool('get_storefront', {
    description: 'Get full details for a vendor storefront (pricing, reviews, photos, about, FAQs)',
    inputSchema: { uuid: z.string().describe('Storefront UUID from search_storefronts or list_favorites') },
    annotations: { readOnlyHint: true },
  }, getStorefront);

  server.registerTool('list_favorites', {
    description: 'List all favorited/saved vendors',
    annotations: { readOnlyHint: true },
  }, listFavorites);
}
