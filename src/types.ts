/**
 * Standard mobile API response envelope.
 * All mobile-api.zola.com responses wrap their payload in { data: T }.
 */
export interface MobileEnvelope<T> {
  data: T;
}

type TextContent = { type: 'text'; text: string };
type ImageContent = { type: 'image'; data: string; mimeType: string };
type Content = TextContent | ImageContent;

/**
 * Standard MCP tool return type.
 * Most handlers return a single text content block; the QR preview tool returns image content.
 */
export type ToolResult = { content: Content[] };

/** Wrap any value as the standard MCP text-content tool result with pretty-printed JSON. */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Wrap raw image bytes as an MCP image-content tool result. */
export function imageResult(bytes: Uint8Array, mimeType: string): ToolResult {
  return { content: [{ type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType }] };
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
