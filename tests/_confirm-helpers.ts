import type { CallToolResult, ServerContext } from '@modelcontextprotocol/server';
import type { GatedResult } from '../src/tools/_confirm.js';

/**
 * A ServerContext for a caller that declares no elicitation capability — i.e.
 * a client that cannot be prompted (claude.ai, Claude Desktop), which under
 * the default MCP_CONFIRM_MODE=ask-user gets the two-phase confirm-token flow.
 */
export const NO_ELICIT_CTX = {
  mcpReq: { envelope: { 'io.modelcontextprotocol/clientCapabilities': {} } },
} as unknown as ServerContext;

export interface PhaseOne {
  status: string;
  confirmToken: string;
  preview: Record<string, unknown>;
  action: string;
}

type GatedCall = (ctx: ServerContext, confirmToken?: string) => Promise<GatedResult>;

/**
 * NO_ELICIT_CTX declares no elicitation capability, so the gate never answers
 * it with an InputRequiredResult — only a tool result.
 */
function asToolResult(result: GatedResult): CallToolResult {
  if (!('content' in result)) throw new Error(`expected a tool result, got ${JSON.stringify(result)}`);
  return result as CallToolResult;
}

/** Phase 1 only: the preview a gated tool returns without writing. */
export async function preview(call: GatedCall): Promise<PhaseOne> {
  const result = asToolResult(await call(NO_ELICIT_CTX));
  const parsed = JSON.parse((result.content[0] as { text: string }).text) as PhaseOne;
  if (parsed.status !== 'confirmation-required') {
    throw new Error(`expected a confirmation preview, got ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

/**
 * Drive a gated tool function through both phases — preview, then the repeat
 * call carrying its confirmToken — and return the phase-2 result.
 */
export async function confirmed(call: GatedCall): Promise<CallToolResult> {
  const { confirmToken } = await preview(call);
  return asToolResult(await call(NO_ELICIT_CTX, confirmToken));
}

/** The env the confirm layer reads; cleared per test so the default mode applies. */
export const CONFIRM_ENV_KEYS = ['MCP_CONFIRM_MODE', 'MCP_CONFIRM_TTL_SECONDS', 'MCP_CONFIRM_SECRET'] as const;

export function snapshotConfirmEnv(): Record<string, string | undefined> {
  const saved = Object.fromEntries(CONFIRM_ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of CONFIRM_ENV_KEYS) delete process.env[k];
  return saved;
}

export function restoreConfirmEnv(saved: Record<string, string | undefined>): void {
  for (const k of CONFIRM_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}
