import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * This repo is PUBLIC, and its fixtures are real API captures from a live
 * wedding account. Redaction is therefore load-bearing, and doing it by hand
 * missed things twice: giver names and emails were replaced while two
 * `gift_message` bodies kept their original signatures, and the
 * `THANK_YOU_CARDS_PROMO` titles kept the giver's *first* name because the
 * redaction map keyed on full names.
 *
 * The guard must not publish what it guards. It first listed the live
 * account's names in plaintext, then as salted SHA-256 digests — but the salt
 * sat beside the digests and the values were names, so a first/last-name
 * dictionary recovered them in under a second. So the identifier denylist is
 * no longer committed in ANY form: it comes only from ZOLA_LEAK_DENYLIST
 * (comma-separated) or the gitignored tests/leak-denylist.local.txt (one entry
 * per line, `#` comments). What IS committed are the shape checks — emails and
 * phone numbers — which need no secret to run.
 *
 * It scans every fixture AND every test source, doc and source file, so a new
 * capture or a copy-pasted real value is covered without anyone opting in.
 */

const TESTS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TESTS, '..');
const FIXTURES = join(TESTS, 'fixtures');

const files = readdirSync(FIXTURES).filter((f) => /\.(json|html)$/.test(f));

/** Every tracked text file the guard scans, relative to the repo root. */
function scannedFiles(): string[] {
  const out: string[] = [];
  for (const dir of ['tests', 'docs', 'src', 'skills']) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { recursive: true }) as string[]) {
      if (/\.(ts|md|json|html|ya?ml)$/.test(entry) && !entry.endsWith('.local.txt')) {
        out.push(join(dir, entry));
      }
    }
  }
  for (const f of ['README.md', 'CLAUDE.md', 'AGENTS.md', 'CHANGELOG.md']) {
    if (existsSync(join(ROOT, f))) out.push(f);
  }
  return out;
}

/**
 * Plaintext identifiers supplied locally, never committed. An entry matches as
 * a whole word or phrase, ignoring case — except one written with a leading
 * `=`, which matches case-sensitively (a first name that is also a lowercase
 * brand word in the registry fixture, e.g. "=Kate" against "kate spade").
 */
function localDenylist(): string[] {
  const fromEnv = (process.env.ZOLA_LEAK_DENYLIST ?? '').split(',');
  const file = join(TESTS, 'leak-denylist.local.txt');
  const fromFile = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  return [...fromEnv, ...fromFile].map((t) => t.trim()).filter((t) => t !== '' && !t.startsWith('#'));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findLeaks(text: string, denylist: string[] = localDenylist()): string[] {
  const hits = new Set<string>();
  for (const entry of denylist) {
    const caseSensitive = entry.startsWith('=');
    const value = caseSensitive ? entry.slice(1) : entry;
    if (value === '') continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(value)}(?![A-Za-z0-9])`, caseSensitive ? '' : 'i');
    if (re.test(text)) hits.add(value);
  }
  return [...hits];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org'];
/** The maintainer's published contact address (manifest.json author) is not a leak. */
const MAINTAINER_EMAIL = (
  JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as { author?: { email?: string } }
).author?.email?.toLowerCase();

export function realEmails(text: string): string[] {
  return [...(text.match(EMAIL) ?? [])].filter((a) => {
    const lower = a.toLowerCase();
    if (lower === MAINTAINER_EMAIL) return false;
    return !ALLOWED_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d}`));
  });
}

/** A US phone number, with or without area code / punctuation. */
const PHONE = /(?:\(?\b\d{3}\)?[\s.-]?)?\b\d{3}-\d{4}\b/g;

describe('the leak guard itself', () => {
  it('commits no identifier list in any form — no plaintext, no digests', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    // A truncated hash of a name is dictionary-recoverable, so none belong here.
    expect(self.match(/['"][0-9a-f]{16}['"]/g) ?? []).toEqual([]);
    expect(self).not.toMatch(/from ['"](node:)?crypto['"]/);
  });

  it('matches a local entry as a whole word or phrase, ignoring case', () => {
    expect(findLeaks('a ZZsecret here', ['zzsecret'])).toEqual(['zzsecret']);
    expect(findLeaks('"Aunt ZZName"', ['aunt zzname'])).toEqual(['aunt zzname']);
    expect(findLeaks('zzsecretive', ['zzsecret'])).toEqual([]);
    expect(findLeaks('#zzcouple2026 on the site', ['#zzcouple2026'])).toEqual(['#zzcouple2026']);
  });

  it('matches an "="-prefixed entry case-sensitively (a lowercase brand word is not a capitalised name)', () => {
    expect(findLeaks('zelda brand', ['=Zelda'])).toEqual([]);
    expect(findLeaks('Love, Zelda', ['=Zelda'])).toEqual(['Zelda']);
  });

  it('flags a real email address and allows placeholders and the maintainer contact', () => {
    // Assembled at runtime so this file does not itself trip the scan below.
    const real = ['florist', 'gmail.com'].join('@');
    expect(realEmails(`write to ${real}`)).toEqual([real]);
    expect(realEmails('pat@example.com, a@example.org')).toEqual([]);
    if (MAINTAINER_EMAIL) expect(realEmails(`contact ${MAINTAINER_EMAIL}`)).toEqual([]);
  });
});

describe('the repo carries no live identifiers', () => {
  const scanned = scannedFiles();

  it('there are fixtures and sources to check', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(scanned.some((f) => f.startsWith('docs'))).toBe(true);
    expect(scanned.some((f) => f.endsWith('.test.ts'))).toBe(true);
  });

  it.each(scanned)('%s contains no locally denylisted identifier', (file) => {
    expect(findLeaks(readFileSync(join(ROOT, file), 'utf8'))).toEqual([]);
  });

  it.each(scanned)('%s contains no real email address', (file) => {
    expect(realEmails(readFileSync(join(ROOT, file), 'utf8'))).toEqual([]);
  });

  it.each(files)('fixture %s contains no phone number', (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    expect(text.match(PHONE) ?? []).toEqual([]);
  });
});

describe('gift messages are consistent with their synthetic givers', () => {
  /**
   * The specific failure this pins: a message body keeping its original
   * signature while the giver name around it was replaced. A signature naming
   * someone the giver field does not is the tell.
   */
  it('every non-empty gift_message is signed consistently with its giver', () => {
    const tracker = JSON.parse(readFileSync(join(FIXTURES, 'gift-tracker.raw.json'), 'utf8'));
    const groups = tracker.order_groups ?? [];
    expect(groups.length).toBeGreaterThan(0);

    const signed = groups.filter((g: { gift_message?: string | null }) => (g.gift_message ?? '') !== '');
    expect(signed.length).toBeGreaterThan(0);

    for (const group of signed) {
      const firstName = String(group.gift_giver_name ?? '').split(/[ ,]+/)[0];
      expect(firstName).not.toBe('');
      expect(group.gift_message).toContain(firstName);
    }
  });

  it('promo titles use the synthetic giver first name', () => {
    const text = readFileSync(join(FIXTURES, 'gift-tracker.raw.json'), 'utf8');
    const tracker = JSON.parse(text);
    const givenNames = new Set<string>(
      (tracker.order_groups ?? []).map((g: { gift_giver_name?: string }) =>
        String(g.gift_giver_name ?? '').split(/[ ,]+/)[0]
      )
    );
    // Titles look like "✏️ <First>! Thanks for the..."
    for (const [, name] of text.matchAll(/✏️ ([^!]+)! Thanks for the/g)) {
      expect(givenNames.has(name) || name === 'Guest').toBe(true);
    }
  });
});
