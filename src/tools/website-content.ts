import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface MobileEnvelope<T> {
  data: T;
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

type PageType = 'HOME' | 'FAQ' | 'POI';

interface PagesFullResponse {
  data: {
    home_page?: { page_id: number };
    faq_page?: { page_id: number };
    poi_page?: { page_id: number };
  };
}

const pageIdCache = new Map<number, Map<PageType, number>>();

/** Test-only: clear the cache between tests. */
export function _resetPageIdCache(): void {
  pageIdCache.clear();
}

async function getPageId(pageType: PageType): Promise<number> {
  const { weddingAccountId } = await client.getContext();
  let perAccount = pageIdCache.get(weddingAccountId);
  if (!perAccount) {
    perAccount = new Map();
    pageIdCache.set(weddingAccountId, perAccount);
  }
  const cached = perAccount.get(pageType);
  if (cached !== undefined) return cached;

  const response = await client.requestMobile<PagesFullResponse>(
    'GET',
    '/v3/websites/pages/wedding-accounts/full'
  );
  if (response.data.home_page) perAccount.set('HOME', response.data.home_page.page_id);
  if (response.data.faq_page) perAccount.set('FAQ', response.data.faq_page.page_id);
  if (response.data.poi_page) perAccount.set('POI', response.data.poi_page.page_id);

  const pageId = perAccount.get(pageType);
  if (pageId === undefined) {
    throw new Error(`Page of type ${pageType} not found on this wedding`);
  }
  return pageId;
}

async function deletePageEntity(pageType: PageType, entityId: number): Promise<void> {
  const { weddingAccountId } = await client.getContext();
  const pageId = await getPageId(pageType);
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/websites/pages/${pageId}/entities/${entityId}/wedding-accounts/${weddingAccountId}`
  );
}

// ===== FAQs =====

export async function listFaqs(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/faqs/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addFaq(args: {
  question: string;
  answer: string;
  display_order?: number;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    faq_entity_id: 0,
    question: args.question,
    answer: args.answer,
    display_order: args.display_order ?? 0,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/faqs',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateFaq(args: {
  faq_entity_id: number;
  question: string;
  answer: string;
  display_order: number;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    faq_entity_id: args.faq_entity_id,
    question: args.question,
    answer: args.answer,
    display_order: args.display_order,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/faqs/${args.faq_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeFaq(args: { faq_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('FAQ', args.faq_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.faq_entity_id }) }] };
}

// ===== Home page sections (story blocks) =====

export async function listHomeSections(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/home-sections/wedding-accounts/${weddingAccountId}`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function addHomeSection(args: {
  title: string;
  subtitle: string;
  description: string;
  display_order?: number;
  hidden?: boolean;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    homepage_entity_id: 0,
    title: args.title,
    subtitle: args.subtitle,
    description: args.description,
    display_order: args.display_order ?? 0,
    hidden: args.hidden ?? false,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/home-sections',
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function updateHomeSection(args: {
  homepage_entity_id: number;
  title: string;
  subtitle: string;
  description: string;
  display_order: number;
  hidden: boolean;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = {
    wedding_account_id: weddingAccountId,
    homepage_entity_id: args.homepage_entity_id,
    title: args.title,
    subtitle: args.subtitle,
    description: args.description,
    display_order: args.display_order,
    hidden: args.hidden,
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/home-sections/${args.homepage_entity_id}`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function removeHomeSection(args: { homepage_entity_id: number }): Promise<ToolResult> {
  await deletePageEntity('HOME', args.homepage_entity_id);
  return { content: [{ type: 'text', text: JSON.stringify({ removed: args.homepage_entity_id }) }] };
}

export function registerWebsiteContentTools(server: McpServer): void {
  server.tool('list_faqs', 'List all FAQs on the wedding website', {}, listFaqs);

  server.tool(
    'add_faq',
    'Add a new FAQ (question + answer) to the website FAQ page',
    {
      question: z.string().describe('The FAQ question'),
      answer: z.string().describe('The FAQ answer'),
      display_order: z.number().optional().describe('Position in the FAQ list (defaults to 0)'),
    },
    addFaq
  );

  server.tool(
    'update_faq',
    'Update an existing FAQ — all three fields (question, answer, display_order) must be supplied',
    {
      faq_entity_id: z.number().describe('FAQ entity ID from list_faqs'),
      question: z.string(),
      answer: z.string(),
      display_order: z.number(),
    },
    updateFaq
  );

  server.tool(
    'remove_faq',
    'Remove an FAQ from the website',
    { faq_entity_id: z.number().describe('FAQ entity ID from list_faqs') },
    removeFaq
  );

  server.tool('list_home_sections', 'List the story sections on the website home page', {}, listHomeSections);

  server.tool(
    'add_home_section',
    'Add a story section to the home page (title + subtitle + description block)',
    {
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number().optional(),
      hidden: z.boolean().optional(),
    },
    addHomeSection
  );

  server.tool(
    'update_home_section',
    'Update a home page story section — all fields must be supplied',
    {
      homepage_entity_id: z.number().describe('Home section ID from list_home_sections'),
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number(),
      hidden: z.boolean(),
    },
    updateHomeSection
  );

  server.tool(
    'remove_home_section',
    'Remove a story section from the home page',
    { homepage_entity_id: z.number() },
    removeHomeSection
  );
}
