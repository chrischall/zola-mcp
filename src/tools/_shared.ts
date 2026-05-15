export interface MobileEnvelope<T> {
  data: T;
}

export type ToolResult = { content: [{ type: 'text'; text: string }] };

/** Wrap any value as the standard MCP text-content tool result with pretty-printed JSON. */
export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
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
