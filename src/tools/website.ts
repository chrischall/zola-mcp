import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function listPages(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/websites/pages/wedding-accounts/full'
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function setPageHidden(args: {
  page_id: number;
  hidden: boolean;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages/${args.page_id}/hidden/${args.hidden}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function reorderPages(args: { page_ids: number[] }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages/wedding-accounts/${weddingAccountId}/reorder`,
    { ids: args.page_ids }
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export function registerWebsiteTools(server: McpServer): void {
  server.tool(
    'list_pages',
    'List all wedding-website pages with their IDs, types, display order, visibility, and theme info',
    {},
    listPages
  );

  server.tool(
    'set_page_hidden',
    'Show or hide a page on the wedding website (e.g., hide the RSVP page until invites go out)',
    {
      page_id: z.number().describe('Page ID from list_pages'),
      hidden: z.boolean().describe('true to hide the page, false to show it'),
    },
    setPageHidden
  );

  server.tool(
    'reorder_pages',
    'Reorder pages in the website navigation. Pass the complete ordered list of page IDs.',
    {
      page_ids: z.array(z.number()).describe('Full ordered list of page IDs in desired nav order'),
    },
    reorderPages
  );
}
