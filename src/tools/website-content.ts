import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult, pickDefined } from '../types.js';

type PageType = 'HOME' | 'FAQ' | 'POI' | 'TRAVEL';

interface PagesFullResponse {
  data: {
    home_page?: { page_id: number };
    faq_page?: { page_id: number };
    poi_page?: { page_id: number };
    travel_page?: { page_id: number };
  };
}

const pageIdCache = new Map<number, Map<PageType, number>>();

/** Test-only: clear the cache between tests. */
export function _resetPageIdCache(): void {
  pageIdCache.clear();
}

async function getPageId(client: ZolaClient, pageType: PageType): Promise<number> {
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
  if (response.data.travel_page) perAccount.set('TRAVEL', response.data.travel_page.page_id);

  const pageId = perAccount.get(pageType);
  if (pageId === undefined) {
    throw new Error(`Page of type ${pageType} not found on this wedding`);
  }
  return pageId;
}

async function removeEntity(client: ZolaClient, pageType: PageType, entityId: number): Promise<ToolResult> {
  await deletePageEntity(client, pageType, entityId);
  return jsonResult({ removed: entityId });
}

async function deletePageEntity(client: ZolaClient, pageType: PageType, entityId: number): Promise<void> {
  const { weddingAccountId } = await client.getContext();
  const pageId = await getPageId(client, pageType);
  await client.requestMobile<MobileEnvelope<unknown>>(
    'DELETE',
    `/v3/websites/pages/${pageId}/entities/${entityId}/wedding-accounts/${weddingAccountId}`
  );
}

// ===== FAQs =====

export async function listFaqs(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/faqs/wedding-accounts/${weddingAccountId}`
  );
  return jsonResult(response.data);
}

export async function addFaq(client: ZolaClient, args: {
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
  return jsonResult(response.data);
}

export async function updateFaq(client: ZolaClient, args: {
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
  return jsonResult(response.data);
}

export async function removeFaq(client: ZolaClient, args: { faq_entity_id: number }): Promise<ToolResult> {
  return removeEntity(client, 'FAQ', args.faq_entity_id);
}

// ===== Home page sections (story blocks) =====

export async function listHomeSections(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/home-sections/wedding-accounts/${weddingAccountId}`
  );
  return jsonResult(response.data);
}

export async function addHomeSection(client: ZolaClient, args: {
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
  return jsonResult(response.data);
}

export async function updateHomeSection(client: ZolaClient, args: {
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
  return jsonResult(response.data);
}

export async function removeHomeSection(client: ZolaClient, args: { homepage_entity_id: number }): Promise<ToolResult> {
  return removeEntity(client, 'HOME', args.homepage_entity_id);
}

// ===== Points of Interest =====

interface PoiFields {
  title?: string;
  description?: string;
  display_order?: number;
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: string;
  longitude?: string;
  google_place_id?: string;
  contact_phone?: string;
  url?: string;
}

const POI_FIELDS = ['title', 'description', 'display_order', 'address1', 'address2', 'city', 'state_province', 'postal_code', 'country_code', 'latitude', 'longitude', 'google_place_id', 'contact_phone', 'url'] as const;

function buildPoiBody(args: PoiFields, weddingAccountId: number, poiEntityId: number): Record<string, unknown> {
  return pickDefined(
    { wedding_account_id: weddingAccountId, poi_entity_id: poiEntityId },
    args as Record<string, unknown>,
    POI_FIELDS
  );
}

export async function listPois(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/points-of-interest/wedding-accounts/${weddingAccountId}`
  );
  return jsonResult(response.data);
}

export async function addPoi(client: ZolaClient, args: PoiFields & { title: string }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildPoiBody(args, weddingAccountId, 0);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/points-of-interest',
    body
  );
  return jsonResult(response.data);
}

export async function updatePoi(client: ZolaClient, args: PoiFields & { poi_entity_id: number }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildPoiBody(args, weddingAccountId, args.poi_entity_id);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/points-of-interest/${args.poi_entity_id}`,
    body
  );
  return jsonResult(response.data);
}

export async function removePoi(client: ZolaClient, args: { poi_entity_id: number }): Promise<ToolResult> {
  return removeEntity(client, 'POI', args.poi_entity_id);
}

// ===== Travel items (hotels, flights, transportation) =====

type TravelType = 'HOTEL' | 'FLIGHT' | 'TRAIN' | 'BUS' | 'CAR' | 'OTHER';

interface TravelFields {
  type?: TravelType;
  name?: string;
  note?: string;
  code?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
  latitude?: string;
  longitude?: string;
  google_place_id?: string;
  contact_number?: string;
  email_address?: string;
  url?: string;
  source?: string;
  timezone?: string;
  display_order?: number;
}

const TRAVEL_FIELDS = ['type', 'name', 'note', 'code', 'address1', 'address2', 'city', 'state_province', 'postal_code', 'country_code', 'latitude', 'longitude', 'google_place_id', 'contact_number', 'email_address', 'url', 'source', 'timezone', 'display_order'] as const;

function buildTravelBody(args: TravelFields, weddingAccountId: number, travelEntityId: number): Record<string, unknown> {
  return pickDefined(
    { wedding_account_id: weddingAccountId, travel_entity_id: travelEntityId },
    args as Record<string, unknown>,
    TRAVEL_FIELDS
  );
}

export async function listTravelItems(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/travel/wedding-accounts/${weddingAccountId}`
  );
  return jsonResult(response.data);
}

export async function addTravelItem(client: ZolaClient, args: TravelFields & { type: TravelType; name: string }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildTravelBody(args, weddingAccountId, 0);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/travel',
    body
  );
  return jsonResult(response.data);
}

export async function updateTravelItem(client: ZolaClient, args: TravelFields & { travel_entity_id: number }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const body = buildTravelBody(args, weddingAccountId, args.travel_entity_id);
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/websites/travel/${args.travel_entity_id}`,
    body
  );
  return jsonResult(response.data);
}

export async function removeTravelItem(client: ZolaClient, args: { travel_entity_id: number }): Promise<ToolResult> {
  return removeEntity(client, 'TRAVEL', args.travel_entity_id);
}

export function registerWebsiteContentTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('list_faqs', {
    description: 'List all FAQs on the wedding website',
    annotations: { readOnlyHint: true },
  }, () => listFaqs(client));

  server.registerTool('add_faq', {
    description: 'Add a new FAQ (question + answer) to the website FAQ page',
    inputSchema: {
      question: z.string().describe('The FAQ question'),
      answer: z.string().describe('The FAQ answer'),
      display_order: z.number().optional().describe('Position in the FAQ list (defaults to 0)'),
    },
    annotations: { destructiveHint: false },
  }, (args) => addFaq(client, args));

  server.registerTool('update_faq', {
    description: 'Update an existing FAQ — all three fields (question, answer, display_order) must be supplied',
    inputSchema: {
      faq_entity_id: z.number().describe('FAQ entity ID from list_faqs'),
      question: z.string(),
      answer: z.string(),
      display_order: z.number(),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateFaq(client, args));

  server.registerTool('remove_faq', {
    description: 'Remove an FAQ from the website',
    inputSchema: {
      faq_entity_id: z.number().describe('FAQ entity ID from list_faqs'),
    },
    annotations: { destructiveHint: true },
  }, (args) => removeFaq(client, args));

  server.registerTool('list_home_sections', {
    description: 'List the story sections on the website home page',
    annotations: { readOnlyHint: true },
  }, () => listHomeSections(client));

  server.registerTool('add_home_section', {
    description: 'Add a story section to the home page (title + subtitle + description block)',
    inputSchema: {
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number().optional(),
      hidden: z.boolean().optional(),
    },
    annotations: { destructiveHint: false },
  }, (args) => addHomeSection(client, args));

  server.registerTool('update_home_section', {
    description: 'Update a home page story section — all fields must be supplied',
    inputSchema: {
      homepage_entity_id: z.number().describe('Home section ID from list_home_sections'),
      title: z.string(),
      subtitle: z.string(),
      description: z.string(),
      display_order: z.number(),
      hidden: z.boolean(),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateHomeSection(client, args));

  server.registerTool('remove_home_section', {
    description: 'Remove a story section from the home page',
    inputSchema: {
      homepage_entity_id: z.number(),
    },
    annotations: { destructiveHint: true },
  }, (args) => removeHomeSection(client, args));

  server.registerTool('list_pois', {
    description: 'List points-of-interest on the "Things to Do" page',
    annotations: { readOnlyHint: true },
  }, () => listPois(client));

  server.registerTool('add_poi', {
    description: 'Add a point-of-interest to the Things-to-Do page (restaurant, attraction, etc.)',
    inputSchema: {
      title: z.string().describe('Name of the place'),
      description: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
      latitude: z.string().optional().describe('Decimal degrees as string'),
      longitude: z.string().optional().describe('Decimal degrees as string'),
      google_place_id: z.string().optional(),
      contact_phone: z.string().optional(),
      url: z.string().optional(),
      display_order: z.number().optional(),
    },
    annotations: { destructiveHint: false },
  }, (args) => addPoi(client, args));

  server.registerTool('update_poi', {
    description: 'Update a point-of-interest. Provide only the fields you want to change.',
    inputSchema: {
      poi_entity_id: z.number().describe('POI ID from list_pois'),
      title: z.string().optional(),
      description: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      google_place_id: z.string().optional(),
      contact_phone: z.string().optional(),
      url: z.string().optional(),
      display_order: z.number().optional(),
    },
    annotations: { destructiveHint: false },
  }, (args) => updatePoi(client, args));

  server.registerTool('remove_poi', {
    description: 'Remove a point-of-interest from the Things-to-Do page',
    inputSchema: {
      poi_entity_id: z.number(),
    },
    annotations: { destructiveHint: true },
  }, (args) => removePoi(client, args));

  server.registerTool('list_travel_items', {
    description: 'List hotels, flights, and transportation on the website Travel page',
    annotations: { readOnlyHint: true },
  }, () => listTravelItems(client));

  server.registerTool('add_travel_item', {
    description: 'Add a travel item (hotel, flight, train, car, bus) to the Travel page',
    inputSchema: {
      type: z.enum(['HOTEL', 'FLIGHT', 'TRAIN', 'BUS', 'CAR', 'OTHER']).describe('Travel item type'),
      name: z.string().describe('Name of the hotel/airline/etc.'),
      note: z.string().optional().describe('Free-text notes (e.g., booking code instructions)'),
      code: z.string().optional().describe('Booking code or group rate code'),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
      latitude: z.string().optional().describe('Decimal degrees as string'),
      longitude: z.string().optional().describe('Decimal degrees as string'),
      google_place_id: z.string().optional(),
      contact_number: z.string().optional(),
      email_address: z.string().optional(),
      url: z.string().optional().describe('Booking link'),
      source: z.enum(['GOOGLE_PLACES', 'MANUAL']).optional().describe('How the address was sourced'),
      timezone: z.string().optional().describe('e.g. America/New_York'),
      display_order: z.number().optional(),
    },
    annotations: { destructiveHint: false },
  }, (args) => addTravelItem(client, args));

  server.registerTool('update_travel_item', {
    description: 'Update a travel item. Provide only the fields you want to change.',
    inputSchema: {
      travel_entity_id: z.number().describe('Travel entity ID from list_travel_items'),
      type: z.enum(['HOTEL', 'FLIGHT', 'TRAIN', 'BUS', 'CAR', 'OTHER']).optional(),
      name: z.string().optional(),
      note: z.string().optional(),
      code: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      google_place_id: z.string().optional(),
      contact_number: z.string().optional(),
      email_address: z.string().optional(),
      url: z.string().optional(),
      source: z.enum(['GOOGLE_PLACES', 'MANUAL']).optional(),
      timezone: z.string().optional(),
      display_order: z.number().optional(),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateTravelItem(client, args));

  server.registerTool('remove_travel_item', {
    description: 'Remove a travel item from the Travel page',
    inputSchema: {
      travel_entity_id: z.number(),
    },
    annotations: { destructiveHint: true },
  }, (args) => removeTravelItem(client, args));
}
