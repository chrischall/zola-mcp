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

export function registerWebsiteTools(server: McpServer): void {
  server.tool(
    'list_pages',
    'List all wedding-website pages with their IDs, types, display order, visibility, and theme info',
    {},
    listPages
  );
}
