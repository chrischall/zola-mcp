/**
 * Standard mobile API response envelope.
 * All mobile-api.zola.com responses wrap their payload in { data: T }.
 */
export interface MobileEnvelope<T> {
  data: T;
}

/**
 * Standard MCP tool return type.
 * All tool handlers return a single text content block.
 */
export type ToolResult = { content: [{ type: 'text'; text: string }] };
