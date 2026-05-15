import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';

type ThemeLayoutType = 'MULTI_PAGE' | 'SINGLE_PAGE';

export async function getCurrentTheme(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>('GET', '/v3/themes/current');
  return jsonResult(response.data);
}

export async function getWebsiteCustomizations(): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/websites/website-customizations/context'
  );
  return jsonResult(response.data);
}

export async function searchThemes(args: {
  limit?: number;
  offset?: number;
  theme_layout_types?: ThemeLayoutType[];
}): Promise<ToolResult> {
  const body = {
    limit: args.limit ?? 50,
    offset: args.offset ?? 0,
    theme_layout_types: args.theme_layout_types ?? ['MULTI_PAGE'],
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/themes/search',
    body
  );
  return jsonResult(response.data);
}

export async function updateCurrentTheme(args: {
  theme_key: string;
  theme_layout_type?: ThemeLayoutType;
}): Promise<ToolResult> {
  const body = {
    theme_key: args.theme_key,
    theme_layout_type: args.theme_layout_type ?? 'MULTI_PAGE',
  };
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    '/v3/themes/current',
    body
  );
  return jsonResult(response.data);
}

export async function updateWebsiteCustomization(args: {
  accent_color?: string;
  background_color?: string;
  body_font_color?: string;
  navigation_background_color?: string;
  header_font_family_id?: number;
  body_font_family_id?: number;
}): Promise<ToolResult> {
  const body: Record<string, unknown> = {};
  if (args.accent_color !== undefined) body.accent_color = args.accent_color;
  if (args.background_color !== undefined) body.background_color = args.background_color;
  if (args.body_font_color !== undefined) body.body_font = { color: args.body_font_color };
  if (args.navigation_background_color !== undefined) {
    body.navigation_customization = { background_color: args.navigation_background_color };
  }
  if (args.header_font_family_id !== undefined) {
    body.header_font = { font_family_id: args.header_font_family_id };
  }
  if (args.body_font_family_id !== undefined) {
    const existing = (body.body_font as Record<string, unknown> | undefined) ?? {};
    body.body_font = { ...existing, font_family_id: args.body_font_family_id };
  }
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/websites/website-customizations/context',
    body
  );
  return jsonResult(response.data);
}

export function registerWebsiteThemeTools(server: McpServer): void {
  server.registerTool('get_current_theme', {
    description: 'Get the currently-selected website theme: key, name, swatch color, layout type',
    annotations: { readOnlyHint: true },
  }, getCurrentTheme);

  server.registerTool('get_website_customizations', {
    description: 'Get current website colors, font settings, and available font/color options',
    annotations: { readOnlyHint: true },
  }, getWebsiteCustomizations);

  server.registerTool('search_themes', {
    description: 'Browse the catalog of available wedding-website themes',
    annotations: { readOnlyHint: true },
    inputSchema: {
      limit: z.number().optional().describe('Default 50'),
      offset: z.number().optional().describe('Default 0'),
      theme_layout_types: z.array(z.enum(['MULTI_PAGE', 'SINGLE_PAGE'])).optional().describe('Default ["MULTI_PAGE"]'),
    },
  }, searchThemes);

  server.registerTool('update_current_theme', {
    description: 'Switch the wedding website to a different theme template',
    inputSchema: {
      theme_key: z.string().describe('Theme key from search_themes (e.g., "galata", "blake-cranberry")'),
      theme_layout_type: z.enum(['MULTI_PAGE', 'SINGLE_PAGE']).optional().describe('Default MULTI_PAGE'),
    },
  }, updateCurrentTheme);

  server.registerTool('update_website_customization', {
    description: 'Update website colors and fonts. Provide only what changes — accepts a partial update. Colors are 6-char hex without #.',
    inputSchema: {
      accent_color: z.string().optional().describe('6-char hex (no #)'),
      background_color: z.string().optional(),
      body_font_color: z.string().optional(),
      navigation_background_color: z.string().optional(),
      header_font_family_id: z.number().optional().describe('Font family ID — call get_website_customizations to see available font_family_ids'),
      body_font_family_id: z.number().optional(),
    },
  }, updateWebsiteCustomization);
}
