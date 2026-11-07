import { buildOptionalBody, minifiedResult } from '@chrischall/mcp-utils';
import type { CallToolResult } from '@modelcontextprotocol/server';

/**
 * Standard mobile API response envelope.
 * All mobile-api.zola.com responses wrap their payload in { data: T }.
 */
export interface MobileEnvelope<T> {
  data: T;
}

/**
 * Standard MCP tool return type.
 * Most handlers return a single text content block; the QR preview tool returns image content.
 */
export type ToolResult = CallToolResult;

/**
 * Wrap any value as the standard MCP text-content tool result with pretty-printed JSON.
 * Re-exported from `@chrischall/mcp-utils` (`minifiedResult`) under the repo's
 * historical `jsonResult` name so tool modules keep a single local import hub.
 */
export const jsonResult = minifiedResult;

/**
 * Build a partial-update body containing only keys from `args` that are not undefined.
 * Used by tools that send PATCH-style updates where omitting a key means "leave unchanged".
 * The undefined-dropping is the shared `buildOptionalBody` from `@chrischall/mcp-utils`;
 * this wrapper just merges the always-present `base` fields in front.
 */
export function pickDefined<T extends Record<string, unknown>>(
  base: Record<string, unknown>,
  args: T,
  keys: readonly (keyof T)[]
): Record<string, unknown> {
  return { ...base, ...buildOptionalBody(args, keys) };
}
