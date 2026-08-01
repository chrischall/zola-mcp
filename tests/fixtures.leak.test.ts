import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Fixtures are real API captures from a live wedding account, committed to a
 * public repo. Redaction is therefore load-bearing, and doing it by hand missed
 * things twice: giver names and emails were replaced while two `gift_message`
 * bodies kept their original signatures ("…Love Aunt Sally"), and the
 * `THANK_YOU_CARDS_PROMO` titles kept the giver's *first* name because the
 * redaction map keyed on full names.
 *
 * This test is the check that would have caught both. It runs over every
 * fixture, so a newly added capture is covered without anyone remembering to
 * opt in.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const files = readdirSync(FIXTURES).filter((f) => /\.(json|html)$/.test(f));

/** Identifiers from the live account. None may appear in any fixture. */
const FORBIDDEN = [
  // Couple and registry
  'Meredith', 'Suffron', 'merchris26',
  // Givers, as they appear upstream
  'Wojtas', 'McDougal', 'Blodgett', 'Frate',
  'Aunt Sally', 'Jason Blodgett',
  // Address / contact details from GET /v3/registries/{id}
  'Trent St', '28209', '305-3465',
];

/**
 * Case-insensitive substrings are checked separately from whole words: "kate"
 * legitimately appears inside the brand "kate spade new york", and "liz" inside
 * "pearlized", so those are matched with word boundaries instead.
 */
const FORBIDDEN_WORDS = ['Sally', 'Kate', 'Jennifer', 'Liz', 'Chandler', 'Christopher'];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org'];

describe('fixtures carry no live identifiers', () => {
  it('there are fixtures to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s contains no forbidden identifier', (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    for (const needle of FORBIDDEN) {
      expect(text.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  it.each(files)('%s contains no forbidden name as a whole word', (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    for (const word of FORBIDDEN_WORDS) {
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it.each(files)('%s contains no real email address', (file) => {
    const text = readFileSync(join(FIXTURES, file), 'utf8');
    const addresses = [...(text.match(EMAIL) ?? [])];
    const real = addresses.filter(
      (a) => !ALLOWED_EMAIL_DOMAINS.some((d) => a.toLowerCase().endsWith(`@${d}`))
    );
    expect(real).toEqual([]);
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
