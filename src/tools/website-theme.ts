import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';

type ThemeLayoutType = 'MULTI_PAGE' | 'SINGLE_PAGE';

export async function getCurrentTheme(client: ZolaClient): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>('GET', '/v3/themes/current');
  return jsonResult(response.data);
}

export async function getWebsiteCustomizations(client: ZolaClient): Promise<ToolResult> {
  const response = await client.requestMobile<MobileEnvelope<unknown>>(
    'GET',
    '/v3/websites/website-customizations/context'
  );
  return jsonResult(response.data);
}

export async function searchThemes(client: ZolaClient, args: {
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

export async function updateCurrentTheme(client: ZolaClient, args: {
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

// Only these two font_family_id values work for the body font; sending any other
// (even ones valid for the header) yields a generic "tool execution failed" error.
// See docs/zola-api-quirks.md for the empirical evidence.
const ALLOWED_BODY_FONT_FAMILY_IDS = [68, 198] as const;

// These fields exist on the web-api endpoint (POST www.zola.com/web-api/v1/
// websiteCustomization/update) but NOT on the mobile-api endpoint this MCP
// currently uses. Until web-api support is added, callers passing these get a
// clear pointer at the only paths that work today.
const WEB_API_ONLY_FIELDS = ['header_color', 'nav_font_color'] as const;

// Captured from the live mobile-api response. Note `body` is singular (not
// `body_font`) and `header` mirrors that shape — the write body uses
// `body_font` / `header_font` instead. See docs/zola-api-quirks.md.
interface CustomizationsReadShape {
  current_style_customizations?: {
    accent_color?: string | null;
    background_color?: string | null;
    body?: { color?: string | null; id?: number | null };
    header?: { color?: string | null; id?: number | null };
    navigation_customization?: { background_color?: string | null; font_color?: string | null };
  };
}

export async function updateWebsiteCustomization(client: ZolaClient, args: {
  accent_color?: string;
  background_color?: string;
  body_font_color?: string;
  navigation_background_color?: string;
  header_font_family_id?: number;
  body_font_family_id?: number;
  // Accepted only so we can reject them with a clear, actionable error.
  // The Zola API does not support writes to these fields.
  header_color?: string;
  nav_font_color?: string;
}): Promise<ToolResult> {
  for (const field of WEB_API_ONLY_FIELDS) {
    if ((args as Record<string, unknown>)[field] !== undefined) {
      throw new Error(
        `${field} is not writable via the mobile-api endpoint this MCP uses. ` +
          `The Zola web UI sets it via POST www.zola.com/web-api/v1/websiteCustomization/update ` +
          `(cookie + CSRF auth), which this MCP does not yet support. ` +
          `For now, change it in the Zola web UI under Website > Design.`
      );
    }
  }

  if (
    args.body_font_family_id !== undefined &&
    !ALLOWED_BODY_FONT_FAMILY_IDS.includes(args.body_font_family_id as 68 | 198)
  ) {
    throw new Error(
      `body_font_family_id must be one of [${ALLOWED_BODY_FONT_FAMILY_IDS.join(
        ', '
      )}] (68=Libre Baskerville, 198=Circular). The header font catalog does not apply to the body font.`
    );
  }

  // Partial-update wipe defence: when header_font_family_id changes the server
  // resets every other active customization to null unless we resend them.
  let preserved: CustomizationsReadShape['current_style_customizations'] | undefined;
  if (args.header_font_family_id !== undefined) {
    const current = await client.requestMobile<MobileEnvelope<CustomizationsReadShape>>(
      'GET',
      '/v3/websites/website-customizations/context'
    );
    preserved = current.data.current_style_customizations;
  }

  const body: Record<string, unknown> = {};

  if (preserved) {
    if (preserved.accent_color != null) body.accent_color = preserved.accent_color;
    if (preserved.background_color != null) body.background_color = preserved.background_color;
    if (preserved.body?.color != null) body.body_font = { color: preserved.body.color };
    if (preserved.navigation_customization?.background_color != null) {
      body.navigation_customization = {
        background_color: preserved.navigation_customization.background_color,
      };
    }
  }

  if (args.accent_color !== undefined) body.accent_color = args.accent_color;
  if (args.background_color !== undefined) body.background_color = args.background_color;
  if (args.body_font_color !== undefined) {
    const existing = (body.body_font as Record<string, unknown> | undefined) ?? {};
    body.body_font = { ...existing, color: args.body_font_color };
  }
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

export function registerWebsiteThemeTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('get_current_theme', {
    description: 'Get the currently-selected website theme: key, name, swatch color, layout type',
    annotations: { readOnlyHint: true },
  }, () => getCurrentTheme(client));

  server.registerTool('get_website_customizations', {
    description: 'Get current website colors, font settings, and available font/color options',
    annotations: { readOnlyHint: true },
  }, () => getWebsiteCustomizations(client));

  server.registerTool('search_themes', {
    description: 'Browse the catalog of available wedding-website themes',
    inputSchema: {
      limit: z.number().optional().describe('Default 50'),
      offset: z.number().optional().describe('Default 0'),
      theme_layout_types: z.array(z.enum(['MULTI_PAGE', 'SINGLE_PAGE'])).optional().describe('Default ["MULTI_PAGE"]'),
    },
    annotations: { readOnlyHint: true },
  }, (args) => searchThemes(client, args));

  server.registerTool('update_current_theme', {
    description: 'Switch the wedding website to a different theme template',
    inputSchema: {
      theme_key: z.string().describe('Theme key from search_themes (e.g., "galata", "blake-cranberry")'),
      theme_layout_type: z.enum(['MULTI_PAGE', 'SINGLE_PAGE']).optional().describe('Default MULTI_PAGE'),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateCurrentTheme(client, args));

  server.registerTool('update_website_customization', {
    description:
      'Update website colors and fonts. Provide only what changes. Colors are 6-char hex without #. ' +
      'Note: when header_font_family_id changes, the wrapper auto-fetches current state and re-sends all active colors ' +
      'to defend against a Zola partial-update wipe bug. body_font_family_id is restricted to [68, 198]. ' +
      'header_color and nav_font_color exist on Zola\'s web-api endpoint but are NOT writable via the mobile-api ' +
      'this MCP uses — change them in the Zola web UI for now.',
    inputSchema: {
      accent_color: z.string().optional().describe('6-char hex (no #)'),
      background_color: z.string().optional(),
      body_font_color: z.string().optional(),
      navigation_background_color: z.string().optional(),
      header_font_family_id: z.number().optional().describe('Font family ID — call get_website_customizations to see available font_family_ids'),
      body_font_family_id: z.number().optional().describe('Restricted to 68 (Libre Baskerville) or 198 (Circular). Other IDs return a generic API error.'),
      header_color: z.string().optional().describe('Writable only via Zola\'s web-api (cookie+CSRF), not the mobile-api this MCP uses. Passing this throws.'),
      nav_font_color: z.string().optional().describe('Writable only via Zola\'s web-api (cookie+CSRF), not the mobile-api this MCP uses. Passing this throws.'),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateWebsiteCustomization(client, args));
}
