import { textResult, imageResult as imageResultBase64 } from '@chrischall/mcp-utils';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
 * Re-exported from `@chrischall/mcp-utils` (`textResult`) under the repo's
 * historical `jsonResult` name so tool modules keep a single local import hub.
 */
export const jsonResult = textResult;

/**
 * Wrap raw image bytes as an MCP image-content tool result.
 * Thin adapter over the shared `imageResult` (which takes a base64 string)
 * so call sites can keep passing raw bytes from the binary fetch path.
 */
export function imageResult(bytes: Uint8Array, mimeType: string): ToolResult {
  return imageResultBase64(Buffer.from(bytes).toString('base64'), mimeType);
}

/**
 * Build a partial-update body containing only keys from `args` that are not undefined.
 * Used by tools that send PATCH-style updates where omitting a key means "leave unchanged".
 */
export function pickDefined<T extends Record<string, unknown>>(
  base: Record<string, unknown>,
  args: T,
  keys: readonly (keyof T)[]
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...base };
  for (const key of keys) {
    if (args[key] !== undefined) body[key as string] = args[key];
  }
  return body;
}
