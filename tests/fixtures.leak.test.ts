import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
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
 * The guard must not publish what it guards. It used to list the live
 * account's names, street, ZIP and phone fragment in plaintext — so the
 * denylist below holds only salted SHA-256 digests of them, and the text being
 * scanned is hashed word-by-word (and pair-by-pair, for two-word identifiers)
 * against it. Values too short to hash safely (a 5-digit ZIP falls to brute
 * force in milliseconds) are not committed at all: phone numbers are caught by
 * shape, and anything else can be supplied locally via ZOLA_LEAK_DENYLIST or
 * the gitignored tests/leak-denylist.local.txt.
 *
 * It scans every fixture AND every test source, doc and source file, so a new
 * capture or a copy-pasted real name is covered without anyone opting in.
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

const SALT = 'zola-mcp/leak-guard/v1';
const digest = (token: string) =>
  createHash('sha256').update(`${SALT}:${token}`).digest('hex').slice(0, 16);

/**
 * Salted digests of live-account identifiers — the couple, the registry slug,
 * gift givers, guests and the street name — matched case-insensitively as a
 * whole word or a two-word pair. Add one with:
 *   node -e 'console.log(require("crypto").createHash("sha256").update("zola-mcp/leak-guard/v1:"+process.argv[1].toLowerCase()).digest("hex").slice(0,16))' "<token>"
 */
const FORBIDDEN_DIGESTS = new Set([
  'b488f172b85050e3', '3455cd2b0811f3eb', 'c755b30434baaa5d', '7a1e588f8b2d8227',
  'b0f68ffcd40ade5a', '4360e47cbdbedaf6', '9699932ca880eb5d', 'b7e39a156f034741',
  '3d795c0de772c942', '511cdbd16fce6a64', 'c05a9f1a8c11e85a', '30a80e51e44ac424',
  'b72358d1332eeb8c', 'd0f4ce0314c966f3',
]);

/**
 * Salted digests of first names matched CASE-SENSITIVELY as whole words:
 * lowercase "kate" is the brand "kate spade new york" in the registry fixture,
 * so only the capitalised name counts. Digest the token as written (no
 * lowercasing) to add one.
 */
const FORBIDDEN_NAME_DIGESTS = new Set([
  'b92e297bd0e885bb', 'c1bbddcc1fd51653', '95eb322ece7d9798',
  '9aa8ed3af5d38deb', '95a93b6b43965a7d', '9c26d6a77c7b5c45',
]);

/** Extra plaintext identifiers supplied locally, never committed. */
function localDenylist(): string[] {
  const fromEnv = (process.env.ZOLA_LEAK_DENYLIST ?? '').split(',');
  const file = join(TESTS, 'leak-denylist.local.txt');
  const fromFile = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
  return [...fromEnv, ...fromFile].map((t) => t.trim()).filter((t) => t !== '' && !t.startsWith('#'));
}

/** Words and adjacent word pairs, as the digests were computed over. */
function grams(text: string, lower: boolean): string[] {
  const words = (lower ? text.toLowerCase() : text).split(/[^A-Za-z0-9]+/).filter(Boolean);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]} ${words[i + 1]}`);
  return out;
}

export function findLeaks(
  text: string,
  digests: Set<string> = FORBIDDEN_DIGESTS,
  nameDigests: Set<string> = FORBIDDEN_NAME_DIGESTS,
  plaintext: string[] = localDenylist()
): string[] {
  const hits = new Set<string>();
  for (const g of grams(text, true)) if (digests.has(digest(g))) hits.add(g);
  for (const g of grams(text, false)) if (nameDigests.has(digest(g))) hits.add(g);
  const lower = text.toLowerCase();
  for (const t of plaintext) if (lower.includes(t.toLowerCase())) hits.add(t);
  return [...hits];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org'];

/** A US phone number, with or without area code / punctuation. */
const PHONE = /(?:\(?\b\d{3}\)?[\s.-]?)?\b\d{3}-\d{4}\b/g;

describe('the leak guard itself', () => {
  it('publishes no plaintext identifiers — only digests', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(findLeaks(self)).toEqual([]);
  });

  it('detects a digested word and a digested word pair', () => {
    const digests = new Set([digest('zzsecret'), digest('aunt zzname')]);
    expect(findLeaks('a ZZsecret here', digests, new Set(), [])).toEqual(['zzsecret']);
    expect(findLeaks('"Aunt ZZName"', digests, new Set(), [])).toEqual(['aunt zzname']);
    expect(findLeaks('zzsecretive', digests, new Set(), [])).toEqual([]);
  });

  it('matches names case-sensitively (a lowercase brand word is not a capitalised name)', () => {
    const names = new Set([digest('Zelda')]);
    expect(findLeaks('zelda brand', new Set(), names, [])).toEqual([]);
    expect(findLeaks('Love, Zelda', new Set(), names, [])).toEqual(['Zelda']);
  });

  it('honours a local plaintext denylist', () => {
    expect(findLeaks('zip 99999-1', new Set(), new Set(), ['99999'])).toEqual(['99999']);
  });
});

describe('the repo carries no live identifiers', () => {
  const scanned = scannedFiles();

  it('there are fixtures and sources to check', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(scanned.some((f) => f.startsWith('docs'))).toBe(true);
    expect(scanned.some((f) => f.endsWith('.test.ts'))).toBe(true);
  });

  it.each(scanned)('%s contains no forbidden identifier', (file) => {
    expect(findLeaks(readFileSync(join(ROOT, file), 'utf8'))).toEqual([]);
  });

  it.each(files)('fixture %s contains no real email address', (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    const addresses = [...(text.match(EMAIL) ?? [])];
    const real = addresses.filter(
      (a) => !ALLOWED_EMAIL_DOMAINS.some((d) => a.toLowerCase().endsWith(`@${d}`))
    );
    expect(real).toEqual([]);
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
