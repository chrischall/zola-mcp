import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult, imageResult } from '../types.js';

// ─── Tier 1: read-only ───────────────────────────────────────────────────────

export async function listCardProjects(client: ZolaClient, args: {
  include_completed?: boolean;
  limit?: number;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/card-projects/search_request',
    {
      completed: args.include_completed ?? false,
      limit: args.limit ?? 30,
      card_suite_uuids: [],
      card_suite_ids: [],
      offset: 0,
      fetch_customizations: true,
      include_deleted: false,
      medium: ['PAPER', 'MAGNET', 'DIGITAL'],
      single_sample: false,
    }
  );
  return jsonResult(response.data);
}

export async function getCardProject(client: ZolaClient, args: { project_uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/card-projects/${args.project_uuid}`
  );
  return jsonResult(response.data);
}

export async function validateCardProject(client: ZolaClient, args: { project_uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/card-projects/${args.project_uuid}/validate`
  );
  return jsonResult(response.data);
}

export async function getCardProjectGuests(client: ZolaClient, args: { project_uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/card-projects/${args.project_uuid}/project-guest-groups`
  );
  return jsonResult(response.data);
}

export async function getCardSuite(client: ZolaClient, args: { suite_uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    `/v4/card-catalog/suites/details/${args.suite_uuid}`
  );
  return jsonResult(response.data);
}

export async function searchCardCatalog(client: ZolaClient, args: {
  card_type?: string;
  limit?: number;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/card-catalog/search/faceted',
    {
      lead_card_types: [],
      include_updated_proof_module: true,
      limit: args.limit ?? 50,
      offset: 0,
      digital_suite: false,
      include_lead_card_type_metadata: true,
      lead_card_type: args.card_type ?? 'INVITATION',
      include_module: true,
    }
  );
  return jsonResult(response.data);
}

export async function listFavoriteCardSuites(client: ZolaClient): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/favorites/card-suites/'
  );
  return jsonResult(response.data);
}

export async function getRsvpPage(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    `/v3/websites/rsvps/wedding-accounts/${weddingAccountId}`
  );
  return jsonResult(response.data);
}

// ─── Tier 2: writes ──────────────────────────────────────────────────────────

export async function createCardProject(client: ZolaClient, args: {
  suite_uuid: string;
  lead_variation_uuid: string;
  quantity?: number;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/card-projects',
    {
      quantity: args.quantity ?? 150,
      lead_variation_uuid: args.lead_variation_uuid,
      extra_customizable: false,
      account_id: weddingAccountId,
      suite_uuid: args.suite_uuid,
    }
  );
  return jsonResult(response.data);
}

export async function swapCardProjectVariation(client: ZolaClient, args: {
  project_uuid: string;
  customizations: Record<string, string>;
}): Promise<ToolResult> {
  const customizations: Record<string, { variation_uuid: string }> = {};
  for (const [customizationUuid, variationUuid] of Object.entries(args.customizations)) {
    customizations[customizationUuid] = { variation_uuid: variationUuid };
  }
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/card-projects/${args.project_uuid}`,
    { customizations }
  );
  return jsonResult(response.data);
}

export async function setCardProjectGuests(client: ZolaClient, args: {
  project_uuid: string;
  guest_groups: Array<{
    guest_group_id: number;
    enabled: boolean;
    guest_name_font_size_override?: number;
    address_font_size_override?: number;
  }>;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/card-projects/${args.project_uuid}/project-guest-groups`,
    { guest_group_requests: args.guest_groups }
  );
  return jsonResult(response.data);
}

export async function previewCardTemplate(client: ZolaClient, args: {
  variation_uuids: string[];
  first_name?: string;
  last_name?: string;
  partner_first_name?: string;
  partner_last_name?: string;
  wedding_date?: string;
}): Promise<ToolResult> {
  const substitutions: Record<string, string> = {};
  if (args.first_name !== undefined) substitutions.first_name = args.first_name;
  if (args.last_name !== undefined) substitutions.last_name = args.last_name;
  if (args.partner_first_name !== undefined) substitutions.partner_first_name = args.partner_first_name;
  if (args.partner_last_name !== undefined) substitutions.partner_last_name = args.partner_last_name;
  if (args.wedding_date !== undefined) {
    substitutions.wedding_date = args.wedding_date;
  } else {
    const { weddingDate } = await client.getContext();
    if (weddingDate) substitutions.wedding_date = weddingDate;
  }

  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/card-templates/preview',
    {
      variation_uuids: args.variation_uuids,
      customizable: true,
      substitutions,
    }
  );
  return jsonResult(response.data);
}

// ─── QR code ─────────────────────────────────────────────────────────────────

export async function previewQrcode(client: ZolaClient, args: {
  url: string;
  dimension?: string;
  url_type?: string;
  enabled?: boolean;
}): Promise<ToolResult> {
  const { bytes, contentType } = await client.requestMobileBinary(
    'PUT',
    '/v3/card-projects/qrcode/preview',
    {
      dimension: args.dimension ?? 'MEDIUM',
      url_type: args.url_type ?? 'CUSTOM',
      enabled: args.enabled ?? true,
      url: args.url,
    }
  );
  // Zola's qrcode/preview returns PNG bytes with `Content-Type: image/jpeg`. Sniff magic bytes.
  return imageResult(bytes, sniffImageType(bytes) ?? contentType);
}

function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

export async function setCardProjectQrcode(client: ZolaClient, args: {
  project_uuid: string;
  page_uuid: string;
  url: string;
  dimension?: string;
  url_type?: string;
  color?: string;
  enabled?: boolean;
}): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/card-projects/${args.project_uuid}/customization/page/${args.page_uuid}/qrcode`,
    {
      dimension: args.dimension ?? 'MEDIUM',
      url_type: args.url_type ?? 'CUSTOM',
      color: args.color ?? '000000',
      enabled: args.enabled ?? true,
      url: args.url,
    }
  );
  return jsonResult(response.data);
}

// ─── MCP registration ────────────────────────────────────────────────────────

export function registerInvitationTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('list_card_projects', {
    description: 'List your invitation / save-the-date / shower-invite "card" projects (paper or digital). Returns project UUID, name, customizations, suite, and quantity.',
    inputSchema: {
      include_completed: z.boolean().optional().describe('Include orders that have already been placed. Default: false (drafts only).'),
      limit: z.number().optional().describe('Max projects to return. Default: 30.'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => listCardProjects(client, args));

  server.registerTool('get_card_project', {
    description: 'Get full details for one invitation project including all customizations (invitation, envelope, RSVP card, details card), paper/color options, and per-customization pages.',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => getCardProject(client, args));

  server.registerTool('validate_card_project', {
    description: 'Validate an invitation project — reports any text-fit, image, or guest-addressing errors per customization. Use before placing an order.',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => validateCardProject(client, args));

  server.registerTool('get_card_project_guests', {
    description: 'List the guest groups assigned to an invitation project, including per-group font-size overrides for printed addressing.',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => getCardProjectGuests(client, args));

  server.registerTool('get_card_suite', {
    description: 'Get details for an invitation design "suite" (the family of matching invitation + RSVP + details cards), including paper types, sizes, and price range.',
    inputSchema: {
      suite_uuid: z.string().describe('Suite UUID (e.g. from search_card_catalog or list_favorite_card_suites)'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => getCardSuite(client, args));

  server.registerTool('search_card_catalog', {
    description: 'Search the invitation design catalog. Faceted search returning suites matching the requested card type.',
    inputSchema: {
      card_type: z.string().optional().describe('Lead card type: INVITATION (default), SAVE_THE_DATE, WEDDING_SHOWER_INVITATION, REHEARSAL_DINNER_INVITATION, THANK_YOU_CARD, etc.'),
      limit: z.number().optional().describe('Max suites to return. Default: 50.'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => searchCardCatalog(client, args));

  server.registerTool('list_favorite_card_suites', {
    description: 'List invitation design suites you have favorited (hearted).',
    annotations: { readOnlyHint: true },
  }, () => listFavoriteCardSuites(client));

  server.registerTool('get_rsvp_page', {
    description: 'Get the RSVP page settings on the wedding website (title, intro copy, visibility, customization).',
    annotations: { readOnlyHint: true },
  }, () => getRsvpPage(client));

  server.registerTool('create_card_project', {
    description: 'Create a new invitation project from a design suite and a lead variation (specific size/paper).',
    inputSchema: {
      suite_uuid: z.string().describe('Suite UUID from search_card_catalog or get_card_suite'),
      lead_variation_uuid: z.string().describe('Lead variation UUID (specific size/paper/color from the suite)'),
      quantity: z.number().optional().describe('Quantity to order. Default: 150.'),
    },
    annotations: { destructiveHint: false },
  }, (args) => createCardProject(client, args));

  server.registerTool('swap_card_project_variation', {
    description: 'Swap one or more customizations on a project to different variations (e.g. switch paper type, color, or size). Pass a map of customization UUID → new variation UUID.',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
      customizations: z.record(z.string(), z.string()).describe('{ customization_uuid: new_variation_uuid }'),
    },
    annotations: { destructiveHint: false },
  }, (args) => swapCardProjectVariation(client, args));

  server.registerTool('set_card_project_guests', {
    description: 'Enable / disable guest groups for an invitation project and optionally override font sizes for printed names and addresses. Pass the full list of guest groups you want recorded.',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
      guest_groups: z.array(z.object({
        guest_group_id: z.number().describe('Guest group ID from list_guests / get_card_project_guests'),
        enabled: z.boolean().describe('Whether to include this group in printed addressing'),
        guest_name_font_size_override: z.number().optional().describe('Override font size for the guest name (pt)'),
        address_font_size_override: z.number().optional().describe('Override font size for the address (pt)'),
      })).describe('Full list of guest groups to record. Omitted groups are not affected by this call.'),
    },
    annotations: { destructiveHint: false },
  }, (args) => setCardProjectGuests(client, args));

  server.registerTool('preview_card_template', {
    description: 'Render an invitation template preview with text substituted in. Use to see how a design would look with your couple\'s names and wedding date. Returns the template structure including page layouts.',
    inputSchema: {
      variation_uuids: z.array(z.string()).describe('One or more variation UUIDs to preview (e.g. a specific size+paper of an invitation)'),
      first_name: z.string().optional().describe('Substitute for {{first_name}} placeholders'),
      last_name: z.string().optional().describe('Substitute for {{last_name}}'),
      partner_first_name: z.string().optional().describe('Substitute for {{partner_first_name}}'),
      partner_last_name: z.string().optional().describe('Substitute for {{partner_last_name}}'),
      wedding_date: z.string().optional().describe('Substitute for {{wedding_date}}, YYYY-MM-DD. Defaults to the wedding date on file.'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => previewCardTemplate(client, args));

  server.registerTool('preview_qrcode', {
    description: 'Generate a QR-code PNG for an invitation. Returns the image so it can be inspected. Use set_card_project_qrcode to actually place it on a card.',
    inputSchema: {
      url: z.string().describe('URL the QR code will resolve to'),
      dimension: z.string().optional().describe('SMALL | MEDIUM (default) | LARGE'),
      url_type: z.string().optional().describe('CUSTOM (default) | WEDDING_WEBSITE | WEDDING_WEBSITE_RSVP'),
      enabled: z.boolean().optional().describe('Whether the QR code is enabled. Default: true.'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => previewQrcode(client, args));

  server.registerTool('set_card_project_qrcode', {
    description: 'Place (or update) a QR code on a specific page of an invitation project. The page UUID comes from get_card_project (look under the customization\'s pages array).',
    inputSchema: {
      project_uuid: z.string().describe('Project UUID from list_card_projects'),
      page_uuid: z.string().describe('Page UUID of the customization to put the QR on'),
      url: z.string().describe('URL the QR code will resolve to'),
      dimension: z.string().optional().describe('SMALL | MEDIUM (default) | LARGE'),
      url_type: z.string().optional().describe('CUSTOM (default) | WEDDING_WEBSITE | WEDDING_WEBSITE_RSVP'),
      color: z.string().optional().describe('Hex color (no #). Default: 000000'),
      enabled: z.boolean().optional().describe('Whether to enable the QR code. Default: true.'),
    },
    annotations: { destructiveHint: false },
  }, (args) => setCardProjectQrcode(client, args));
}
