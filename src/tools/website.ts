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

export async function updatePage(args: {
  page_id: number;
  title?: string;
  nav_title?: string;
  menu_title?: string;
  intro_copy?: string;
  description?: string;
  hidden?: boolean;
  customization?: unknown;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = { page_id: args.page_id };
  if (args.title !== undefined) body.title = args.title;
  if (args.nav_title !== undefined) body.nav_title = args.nav_title;
  if (args.menu_title !== undefined) body.menu_title = args.menu_title;
  if (args.intro_copy !== undefined) body.intro_copy = args.intro_copy;
  if (args.description !== undefined) body.description = args.description;
  if (args.hidden !== undefined) body.hidden = args.hidden;
  if (args.customization !== undefined) body.customization = args.customization;

  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/pages-v2/${args.page_id}`,
    body
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

  server.tool(
    'update_page',
    'Update page-level metadata (title, intro copy, nav title, visibility, layout customization)',
    {
      page_id: z.number().describe('Page ID from list_pages'),
      title: z.string().optional().describe('On-page title'),
      nav_title: z.string().optional().describe('Title shown in nav bar'),
      menu_title: z.string().optional().describe('Title shown in mobile menu'),
      intro_copy: z.string().optional().describe('Introductory paragraph on the page'),
      description: z.string().optional().describe('Page description'),
      hidden: z.boolean().optional().describe('Hide the page from the public site'),
      customization: z.unknown().optional().describe('Layout customization object (see list_pages for shape)'),
    },
    updatePage
  );
}
