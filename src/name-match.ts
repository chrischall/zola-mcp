/**
 * Product-name matching, used only as a fallback when the two sources share no
 * item id.
 *
 * One decision drives the whole file: **a hyphenated compound is a single
 * token.** "Oven-to-Table" and "Tilt-Head" are single lexical units in product
 * copy, and splitting them on the hyphen is what makes a matcher merge two
 * genuinely different SKUs.
 *
 * The pair this must get right, because we own one of each:
 *
 *   "Oven-to-Table Square Baking Dish with Trivet"
 *     -> [oven-to-table, square, baking, dish, with, trivet]   (6 tokens)
 *   "Oven-to-Table Baking Dish with Trivet"
 *     -> [oven-to-table, baking, dish, with, trivet]           (5 tokens)
 *   5 of 6 align -> 0.833, below the 0.85 threshold. DISTINCT.
 *
 * Split "Oven-to-Table" into three tokens and the same pair scores 7/8 = 0.875
 * and silently merges. Character-level Levenshtein is worse still: it scores
 * this pair 0.837 while scoring the *same* stand mixer written two ways only
 * 0.833 — i.e. it ranks the distinct pair as the more similar one. Comparing
 * token sets, with Levenshtein used only *within* a token pair to absorb
 * abbreviations and plurals, is what puts them in the right order.
 */

/** Default auto-merge bar. */
export const DEFAULT_THRESHOLD = 0.85;

/** Two tokens count as the same word at or above this Levenshtein ratio. */
const TOKEN_MATCH_MIN = 0.8;

const MARKS = /[®™©℠]/g;
const TYPOGRAPHIC: Array<[RegExp, string]> = [
  [/[‘’ʼ]/g, "'"],
  [/[“”]/g, '"'],
  [/[‐‑‒–—―]/g, '-'],
];

/** Size aliases, applied before punctuation is stripped so 5-Quart == 5-Qt. */
const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:quarts?|qts?)\b/g, '$1qt'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:ounces?|ozs?)\b/g, '$1oz'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:pounds?|lbs?)\b/g, '$1lb'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:inch(?:es)?|in)\b/g, '$1in'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:pieces?|pcs?)\b/g, '$1pc'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:gallons?|gals?)\b/g, '$1gal'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:liters?|litres?|ltrs?)\b/g, '$1l'],
  [/(\d+(?:\.\d+)?)\s*-?\s*(?:cups?)\b/g, '$1cup'],
];

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);
const SEPARATORS = /[^\p{L}\p{N}-]+/gu;

/** Normalize a product name to a canonical space-joined string. */
export function normalizeProductName(raw: string | null | undefined): string {
  return tokenize(raw).join(' ');
}

/** Normalize and split a product name into comparison tokens. */
export function tokenize(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];

  // Strip marks *before* NFKC: compatibility folding expands ™ to "TM".
  let s = String(raw).replace(MARKS, ' ').normalize('NFKC');
  for (const [pattern, replacement] of TYPOGRAPHIC) s = s.replace(pattern, replacement);
  s = s.toLowerCase().replace(/'/g, '');
  for (const [pattern, replacement] of UNIT_ALIASES) s = s.replace(pattern, replacement);
  s = s.replace(SEPARATORS, ' ');

  const tokens: string[] = [];
  for (const rawToken of s.split(' ')) {
    // A hyphen holds a compound together only *between* characters; where it is
    // acting as a dash it should not survive.
    const token = rawToken.replace(/^-+/, '').replace(/-+$/, '');
    if (token !== '') tokens.push(token);
  }
  while (tokens.length > 1 && LEADING_ARTICLES.has(tokens[0])) tokens.shift();
  return tokens;
}

/** Crude singular stem so "dish"/"dishes" and "glass"/"glasses" agree. */
export function singularize(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && /(?:ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  // "-us"/"-is"/"-ss" are not plural markers: "plus" must not stem to "plu".
  if (token.length > 3 && token.endsWith('s') && !/(?:us|is|ss)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

/** Levenshtein edit distance, two-row dynamic programming. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Levenshtein similarity in [0, 1]. */
export function ratio(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Similarity between two product names in [0, 1].
 *
 * Each token of the longer name claims its best unclaimed partner in the
 * shorter one, contributing its own ratio rather than a flat 1. Dividing by the
 * longer token count means an unmatched token on *either* side pulls the score
 * down — which is exactly what makes a lone distinguishing qualifier
 * ("Square") decisive on a short name.
 */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.length === tb.length && ta.every((t, i) => t === tb[i])) return 1;

  const [long, short] = ta.length >= tb.length ? [ta, tb] : [tb, ta];
  const longStems = long.map(singularize);
  const shortStems = short.map(singularize);
  const claimed = new Array<boolean>(short.length).fill(false);
  let credit = 0;

  for (let i = 0; i < long.length; i++) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let j = 0; j < short.length; j++) {
      if (claimed[j]) continue;
      const score = longStems[i] === shortStems[j] ? 1 : ratio(longStems[i], shortStems[j]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = j;
      }
    }
    if (bestIndex >= 0 && bestScore >= TOKEN_MATCH_MIN) {
      claimed[bestIndex] = true;
      credit += bestScore;
    }
  }
  return credit / long.length;
}

/** Whether two names may be treated as the same product without review. */
export function isSameProduct(
  a: string | null | undefined,
  b: string | null | undefined,
  threshold = DEFAULT_THRESHOLD
): boolean {
  return similarity(a, b) >= threshold;
}
