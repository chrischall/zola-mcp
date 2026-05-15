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

interface WeddingFields {
  wedding_id: number;
  account_id: number;
  slug: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  title: string;
  wedding_date: string | null;
  hashtag: string | null;
  enable_search_engine: boolean;
  enable_search_zola: boolean;
  city: string | null;
  state_province: string | null;
  guest_count: number | null;
}

interface UserContextResponse {
  data: {
    wedding: WeddingFields;
  };
}

async function fetchWeddingFields(): Promise<WeddingFields> {
  const response = await client.requestMobile<UserContextResponse>('GET', '/v3/users/me/context');
  return response.data.wedding;
}

export async function getWeddingSettings(): Promise<ToolResult> {
  const wedding = await fetchWeddingFields();
  return { content: [{ type: 'text', text: JSON.stringify(wedding, null, 2) }] };
}

export async function updateWeddingSettings(args: {
  title?: string;
  slug?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  partner_first_name?: string;
  partner_last_name?: string;
  wedding_date?: string;
  city?: string;
  state_province?: string;
  hashtag?: string;
  guest_count?: number;
  enable_search_engine?: boolean;
  enable_search_zola?: boolean;
}): Promise<ToolResult> {
  const current = await fetchWeddingFields();
  const body = {
    wedding_id: current.wedding_id,
    account_id: current.account_id,
    slug: args.slug ?? current.slug,
    owner_first_name: args.owner_first_name ?? current.owner_first_name,
    owner_last_name: args.owner_last_name ?? current.owner_last_name,
    partner_first_name: args.partner_first_name ?? current.partner_first_name,
    partner_last_name: args.partner_last_name ?? current.partner_last_name,
    title: args.title ?? current.title,
    wedding_date: args.wedding_date ?? current.wedding_date,
    hashtag: args.hashtag ?? current.hashtag ?? '',
    enable_search_engine: args.enable_search_engine ?? current.enable_search_engine,
    enable_search_zola: args.enable_search_zola ?? current.enable_search_zola,
    city: args.city ?? current.city,
    state_province: args.state_province ?? current.state_province,
    guest_count: args.guest_count ?? current.guest_count,
  };

  const response = await client.requestMobile<MobileEnvelope<WeddingFields>>(
    'PUT',
    `/v3/weddings/${current.wedding_id}`,
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

  server.tool(
    'get_wedding_settings',
    'Get top-level wedding settings: title, URL slug, partner names, date, city, hashtag, guest count, search visibility',
    {},
    getWeddingSettings
  );

  server.tool(
    'update_wedding_settings',
    'Update top-level wedding settings. Provide only the fields you want to change; the rest are preserved.',
    {
      title: z.string().optional().describe('Wedding title (e.g., "Meredith & Chris")'),
      slug: z.string().optional().describe('URL slug — appears in the public website URL'),
      owner_first_name: z.string().optional(),
      owner_last_name: z.string().optional(),
      partner_first_name: z.string().optional(),
      partner_last_name: z.string().optional(),
      wedding_date: z.string().optional().describe('YYYY-MM-DD'),
      city: z.string().optional(),
      state_province: z.string().optional(),
      hashtag: z.string().optional().describe('e.g. #merchris2026 — empty string clears it'),
      guest_count: z.number().optional(),
      enable_search_engine: z.boolean().optional().describe('Allow search engines (Google, etc.) to index the site'),
      enable_search_zola: z.boolean().optional().describe('Allow Zola search to find the site'),
    },
    updateWeddingSettings
  );
}
