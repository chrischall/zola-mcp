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
import { UNTRUSTED_CONTENT_RULE, untrustedEnvelope } from '@chrischall/mcp-utils';

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
/** The shortest a title is cut to before the status gives way too. */
const TITLE_FLOOR = 24;

/** Collapses every run of whitespace (CR/LF included) to one space, then trims. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, Math.max(n - 1, 0))}…` : s);

/**
 * One brief line, `title — <date | no date> — <status>`, cut to ≤ 120 chars
 * as a WHOLE, title first: the title shortens until the line fits, and if the
 * status alone would still overflow once the title is at its floor, the
 * status is cut as well (the consolidated brief-view contract). Newlines and
 * other whitespace runs in any field collapse to one space first. A title that
 * is `--` or starts with `-- ` or `\` is escaped with one leading `\`, so an item can
 * never read as a note line — the host strips that one backslash after its
 * note check.
 */
export function briefLine(title: string, date: string | null | undefined, rawStatus: string): string {
  // One item is ONE line: any run of whitespace (CR and LF included) becomes a
  // single space before the trim, the escape check and the cut — otherwise a
  // title like `Party\n-- error: x` would split into a second, note-like line.
  const name = oneLine(title) || '(untitled)';
  const status = oneLine(rawStatus);
  // The rule is about the LINE: a bare `--` title becomes `-- — …` once the
  // separator supplies the space, so it is escaped too.
  const escaped = name === '--' || name.startsWith('-- ') || name.startsWith('\\') ? `\\${name}` : name;
  const sep = ` — ${oneLine(date ?? '') || 'no date'} — `;
  const room = BRIEF_MAX - sep.length;
  if (escaped.length + status.length <= room) return `${escaped}${sep}${status}`;
  const titleRoom = Math.max(room - status.length, Math.min(escaped.length, TITLE_FLOOR));
  const shown = cut(escaped, titleRoom);
  return `${shown}${sep}${cut(status, room - shown.length)}`;
}

/** The note line a brief view answers when there is nothing to list. */
export const BRIEF_NONE = '-- none';

/** The lines, or the single `-- none` note when there are none. */
function orNone(lines: string[]): string[] {
  return lines.length === 0 ? [BRIEF_NONE] : lines;
}

/** An epoch-milliseconds timestamp as ISO 8601, or null when absent/invalid. */
export function isoFromMillis(ms: number | null | undefined, dateOnly = false): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return dateOnly ? iso.slice(0, 10) : iso;
}

/** The brief view's text result, for lines whose every field is the account's own or a date/status. */
export function briefResult(lines: string[]): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: orNone(lines).join('\n') }] };
}

/**
 * The brief view for lines carrying text other people wrote (vendor names):
 * the fleet's untrusted-data envelope, `{ untrusted_content, note, data:
 * string[] }`, minified, note first — mcp-host's intent tools unwrap it and
 * take `data` as the lines.
 */
export function untrustedBriefResult(lines: string[], whoWrote: string): { content: [{ type: 'text'; text: string }] } {
  const payload = untrustedEnvelope(orNone(lines), { note: `${whoWrote} ${UNTRUSTED_CONTENT_RULE}` });
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
