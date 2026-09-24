import type { CallToolResult, InputRequiredResult, ServerContext } from '@modelcontextprotocol/server';
import {
  confirmationFromEnv,
  confirmTokenParam,
  hashConfirmPayload,
  requireConfirmationWithFallback,
} from '@chrischall/mcp-utils';

export { confirmTokenParam };
export type { ServerContext };

/**
 * What a gated tool returns: its normal result, or — from the confirm gate — a
 * preview / refusal (CallToolResult) or an elicitation request (InputRequiredResult).
 */
export type GatedResult = CallToolResult | InputRequiredResult;

/** Appended to every gated tool's description. */
export const CONFIRM_NOTE =
  'Asks the user to confirm first: a confirmation prompt where the client supports one; otherwise the first call ' +
  'returns a preview and a confirmToken, and only a repeat call with that token proceeds (see MCP_CONFIRM_MODE).';

export interface ConfirmWriteOptions {
  /** The tool name the token is bound to. */
  tool: string;
  /** `zola.<noun>.<verb>` action id. */
  action: string;
  /**
   * One line naming the target the way the user knows it — the household, the
   * event, the FAQ question, the old and new slug. Never only a numeric id.
   */
  label: string;
  method: string;
  path: string;
  /** The primary id acted on. */
  target: string;
  /**
   * The target exactly as just read. Its hash is bound into the token as the
   * revision, so a target edited between the preview and the confirmed call is
   * refused as DRAFT_CHANGED instead of being deleted or overwritten blind.
   */
  current?: unknown;
  /** Request body exactly as it will be sent. Hashed into the token. */
  body?: unknown;
  /** Human-readable facts shown beside the label: names, old -> new values. */
  about?: Record<string, unknown>;
  /**
   * Whether the preview echoes `body` as `willSend`. Off for the guest-directory
   * round-trips, whose body carries every guest's address, email and phone —
   * the preview names the guests instead.
   */
  showBody?: boolean;
  /** The phase-2 token from the tool's input. */
  confirmToken: string | undefined;
}

/**
 * Confirm-gate for a mutating tool. A client that can show a confirmation
 * prompt is asked; one that cannot gets the two-phase token flow (governed by
 * `MCP_CONFIRM_MODE`): phase 1 makes no write and returns a preview of exactly
 * what would change plus a `confirmToken`, and only a repeat call with that
 * token proceeds. The token is bound to the tool, the target, the target's
 * current state and the body, so a changed argument — or a concurrent edit of
 * the target — is refused as DRAFT_CHANGED with a fresh preview.
 *
 * Returns `undefined` to proceed with the write, otherwise the result to return
 * unchanged.
 */
export function confirmWrite(
  ctx: ServerContext,
  opts: ConfirmWriteOptions
): Promise<InputRequiredResult | CallToolResult | undefined> {
  const showBody = opts.showBody ?? true;
  const preview: Record<string, unknown> = {
    action: opts.label,
    ...(opts.about ?? {}),
    method: opts.method,
    path: opts.path,
    ...(showBody && opts.body !== undefined ? { willSend: opts.body } : {}),
  };
  const payload = { method: opts.method, path: opts.path, body: opts.body };
  return requireConfirmationWithFallback(
    ctx,
    confirmationFromEnv({
      action: opts.action,
      message: 'Review and confirm this Zola change:',
      details: preview,
      tool: opts.tool,
      confirmToken: opts.confirmToken,
      subject: () => ({
        target: opts.target,
        ...(opts.current !== undefined ? { revision: hashConfirmPayload(opts.current) } : {}),
        payload,
        preview,
      }),
    })
  );
}

/**
 * `{ field: { from, to } }` for every key in `keys` whose value differs between
 * `current` and `next` — the "what changes" block of an update preview.
 */
export function diffFields(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  keys: readonly string[]
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of keys) {
    const from = current[key] ?? null;
    const to = next[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) out[key] = { from, to };
  }
  return out;
}

/** "Pat Morgan" from a directory guest record. */
export function guestName(guest: { first_name?: unknown; family_name?: unknown }): string {
  return [guest.first_name, guest.family_name]
    .filter((part) => typeof part === 'string' && part !== '')
    .join(' ');
}

/** The household as it is addressed, falling back to its guests' names. */
export function householdLabel(group: {
  envelope_recipient?: string | null;
  guests: Array<{ first_name?: unknown; family_name?: unknown }>;
}): string {
  if (group.envelope_recipient) return group.envelope_recipient;
  return group.guests.map(guestName).filter(Boolean).join(' and ') || 'unnamed household';
}
