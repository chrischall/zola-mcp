/**
 * Context-group hints, published on each tool as `_meta.mint` (the mcp-host
 * context-groups contract, `mintHintSchema`). Inert data: a host that does not
 * read them sees an extra `_meta` key and nothing else. The shape is fixed by
 * the host's contract, so it is restated here rather than imported — this
 * server takes no dependency on mcp-host.
 *
 * Zola holds ONE wedding per account, so there is no listable set of subjects
 * (no children, properties or systems) and no tool declares `subject`. None of
 * the canonical reads takes a date range, so none declares `when` either.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'family';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  /** The words a person says: lowercase, at most 8, each at most 40 chars. */
  aliases?: string[];
}

/** `_meta` for a Zola tool: every tool here is in the `family` group. */
export function familyMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'family', intent, ...extra } };
}

/** The `view` argument a canonical read takes. */
export const BRIEF_VIEW_NOTE =
  '"full" (default) returns the usual JSON; "brief" returns one line per item: title — <ISO date or "no date"> — <status>.';

const BRIEF_MAX = 120;

/**
 * One brief line, `title — <date | no date> — <status>`, at most 120 chars.
 * The title is what gets shortened, so the date and status always survive.
 */
export function briefLine(title: string, date: string | null | undefined, status: string): string {
  const tail = ` — ${date || 'no date'} — ${status}`;
  const room = BRIEF_MAX - tail.length;
  const name = title.trim() || '(untitled)';
  const shown = name.length > room ? `${name.slice(0, Math.max(room - 1, 0))}…` : name;
  return `${shown}${tail}`;
}

/** An epoch-milliseconds timestamp as ISO 8601, or null when absent/invalid. */
export function isoFromMillis(ms: number | null | undefined, dateOnly = false): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}

/** The brief view's text result. */
export function briefResult(lines: string[]): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
