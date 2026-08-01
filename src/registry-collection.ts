import { truncateErrorMessage } from '@chrischall/mcp-utils';
import type { ZolaClient } from './client.js';
import { byteLength, formatBytes } from './client.js';
import { MobileEnvelope } from './types.js';

/**
 * Reading the couple's registry collection.
 *
 * ## Why this does not use the mobile API
 *
 * `GET /v4/shop/registry?registry_id=…` — what `get_registry` used to call —
 * returns HTTP 200 and ~4 MB of valid JSON that contains **no registry items**.
 * It is the Shop *browse* surface: SEARCH, CIRCLE_GRID, SHOP_ENTITIES_CAROUSEL,
 * FEATURED_STARTER_COLLECTIONS, PARTNER_RETAILERS. Measured 2026-08-01 against
 * the live account: zero occurrences of `marked_fulfilled`, `num_purchased` or
 * `collection_item_id`, and none of the couple's own products. Passing a bogus
 * `registry_id` returns 261 bytes, so the parameter *is* honoured — the endpoint
 * is registry-scoped, it just serves merchandising.
 *
 * The collection is not readable anywhere on `mobile-api.zola.com`. `OPTIONS`
 * settles it:
 *
 *     /v3/registries/{id}/collections        -> allow: POST, OPTIONS
 *     /v3/registries/{id}/collections/{cid}  -> allow: DELETE, POST, OPTIONS, PUT
 *
 * No GET. The collection is write-only on that host, which is why ~35 candidate
 * paths all returned 404 or 405.
 *
 * ## What it uses instead
 *
 * The couple's public registry page, `https://www.zola.com/registry/{key}`,
 * is server-rendered and embeds the full collection — 75 items with per-item
 * purchase state — in `__NEXT_DATA__` at
 * `props.pageProps.initialReduxState` (a JSON *string*) →
 * `manageRegistry.collection.default_collection`.
 *
 * `key` and `public` come from `GET /v3/registries/{registryId}`, which does
 * work on the mobile API and costs ~1.3 KB.
 *
 * This is an HTML surface, so it can change shape without notice. Every step
 * below therefore fails loudly with the specific step that broke. It must never
 * degrade to an empty list: "no items" and "we could not read the items" look
 * identical downstream, and the wrong one of those reads as "nothing was
 * purchased" — the most dangerous possible wrong answer here.
 */

const REGISTRY_WEB_BASE = 'https://www.zola.com/registry';

/** Thrown when the registry collection cannot be read. Never swallowed. */
export class RegistryReadError extends Error {
  readonly step: string;
  readonly detail: string | null;
  constructor(step: string, message: string, detail?: string | null) {
    super(message);
    this.name = 'RegistryReadError';
    this.step = step;
    this.detail = detail ?? null;
  }
}

/** Raw contribution block as the page serves it. */
interface RawContributions {
  completed_units?: number | null;
  goal_units?: number | null;
  fulfilled?: boolean | null;
  mark_fulfilled?: boolean | null;
  num_contributors?: number | null;
  percent_complete?: number | null;
  reserved?: boolean | null;
  still_needs?: string | null;
  group_gift?: boolean | null;
}

/** Raw registry item as the page serves it (only the fields we consume). */
export interface RawRegistryItem {
  item_id?: string | null;
  object_id?: string | null;
  sku_object_id?: string | null;
  name?: string | null;
  brand?: string | null;
  store_name?: string | null;
  product_url?: string | null;
  price?: number | string | null;
  requested_quantity?: number | null;
  most_wanted?: boolean | null;
  personal_note?: string | null;
  type?: string | null;
  cash_fund?: boolean | null;
  registry_import?: boolean | null;
  contributions?: RawContributions | null;
  images?: Array<Record<string, string | null>> | null;
  [key: string]: unknown;
}

/** How much of a request an item still has outstanding. */
export type Availability = 'AVAILABLE' | 'PARTIALLY_CLAIMED' | 'FULLY_CLAIMED';

/**
 * The derived purchase-state block.
 *
 * `marked_fulfilled` and `purchased_qty` are deliberately kept apart. Zola
 * models them independently — `mark_fulfilled` is the couple ticking "we got
 * this", `completed_units` is a real purchase — and their *disagreement* is the
 * signal this whole module exists to expose. Collapsing them into one
 * "purchased" boolean destroys the only evidence that an item is flagged as
 * handled while still sitting on the registry for sale.
 */
export interface PurchaseState {
  requested_qty: number;
  purchased_qty: number;
  marked_fulfilled: boolean;
  /** A gift_tracker order references this item. Filled in by the reconciler. */
  attributed: boolean;
  availability: Availability;
  /** Flagged fulfilled while nothing has actually been bought. */
  inconsistent: boolean;
}

/** Projected registry item: everything the reconciler needs, nothing else. */
export interface RegistryItem {
  item_id: string | null;
  sku_id: string | null;
  name: string;
  brand: string | null;
  store_name: string | null;
  product_url: string | null;
  /** Integer cents. Never a float — see {@link dollarsToCents}. */
  price_cents: number | null;
  /** One canonical URL, replacing the 5-variant `images` array. */
  image_url: string | null;
  type: string | null;
  cash_fund: boolean;
  most_wanted: boolean;
  personal_note: string | null;
  registry_import: boolean;
  purchase_state: PurchaseState;
}

/**
 * Convert a dollars value to integer cents without floating-point arithmetic.
 *
 * The page serves `price` as a JSON number (`59.95`), so it arrives as a
 * double. `59.95 * 100` is `5994.999999999999`; going through the decimal
 * *string* keeps the result exact.
 */
export function dollarsToCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const m = /^-?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return null;

  const whole = m[1] === '' ? '0' : m[1];
  let frac = m[2] ?? '';
  let roundUp = false;
  if (frac.length > 2) {
    roundUp = frac.charCodeAt(2) >= 53; // '5'
    frac = frac.slice(0, 2);
  }
  frac = frac.padEnd(2, '0');

  let cents = Number(whole) * 100 + Number(frac);
  if (roundUp) cents += 1;
  return text.startsWith('-') ? -cents : cents;
}

/**
 * Pick one canonical image URL from the 5-variant `images` array.
 *
 * Every variant is the same asset with different `w`/`h` query params, so all
 * five are redundant; keeping one is the bulk of the projection's savings.
 */
export function canonicalImageUrl(images: RawRegistryItem['images']): string | null {
  const first = images?.[0];
  if (!first) return null;
  for (const key of ['full', 'large', 'medium', 'small', 'thumb', 'base']) {
    const value = first[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  // Unknown variant key names: fall back to any URL-shaped value rather than
  // reporting "no image" for an item that plainly has one.
  for (const value of Object.values(first)) {
    if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

/**
 * Derive the purchase-state block from a raw item.
 *
 * `attributed` is left false here — only the reconciler, which has the gift
 * tracker in hand, can decide it.
 */
export function derivePurchaseState(raw: RawRegistryItem): PurchaseState {
  const contributions = raw.contributions ?? {};

  // A cash fund counts money, not units: `requested_quantity` is a meaningless 1
  // while `goal_units` carries the actual target. Reading the former made a
  // honeymoon fund 6% funded (50,000 of 800,000) report as FULLY_CLAIMED.
  const isCashFund = raw.cash_fund === true || raw.type === 'CASH';
  const requested = isCashFund
    ? toCount(contributions.goal_units ?? raw.requested_quantity, 1)
    : toCount(raw.requested_quantity ?? contributions.goal_units, 1);
  const purchased = toCount(contributions.completed_units, 0);
  const markedFulfilled = contributions.mark_fulfilled === true;

  let availability: Availability;
  if (purchased <= 0) availability = 'AVAILABLE';
  else if (purchased >= requested) availability = 'FULLY_CLAIMED';
  else availability = 'PARTIALLY_CLAIMED';

  return {
    requested_qty: requested,
    purchased_qty: purchased,
    marked_fulfilled: markedFulfilled,
    attributed: false,
    availability,
    inconsistent: markedFulfilled && purchased === 0,
  };
}

function toCount(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

/** Project one raw item down to the fields the reconciler needs. */
export function projectRegistryItem(raw: RawRegistryItem): RegistryItem {
  return {
    item_id: raw.item_id ?? raw.object_id ?? null,
    sku_id: raw.sku_object_id ?? null,
    name: (raw.name ?? '').toString(),
    brand: raw.brand ?? null,
    store_name: raw.store_name ?? null,
    product_url: raw.product_url ?? null,
    price_cents: dollarsToCents(raw.price ?? null),
    image_url: canonicalImageUrl(raw.images),
    type: raw.type ?? null,
    cash_fund: raw.cash_fund === true,
    most_wanted: raw.most_wanted === true,
    personal_note: raw.personal_note ?? null,
    registry_import: raw.registry_import === true,
    purchase_state: derivePurchaseState(raw),
  };
}

/**
 * Pull the raw item array out of a registry page's HTML.
 *
 * Split out from the fetch so tests can drive it from a committed fixture.
 * Each failure names the step that broke, because "the page changed" is a
 * different problem from "this registry is private".
 */
export function extractItemsFromHtml(html: string): RawRegistryItem[] {
  const script = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
    html
  );
  if (!script) {
    // `resolve:public` is a pre-check on the API's `public` flag. Zola can still
    // gate the page itself behind a passcode while reporting public: true, and
    // that lands here — where "the page shape changed" would point at the wrong
    // cause entirely. Cheap to tell apart, so tell them apart.
    const gated = /enter (?:the )?(?:passcode|password)|this registry is private|guest passcode/i.test(
      html
    );
    throw new RegistryReadError(
      gated ? 'fetch:gated' : 'extract:__NEXT_DATA__',
      gated
        ? 'Registry page is gated behind a passcode, so its items cannot be read. ' +
          'Remove the passcode in Zola, or the collection stays unreadable — the ' +
          'mobile API has no GET for it.'
        : 'Registry page did not contain a __NEXT_DATA__ block — the page shape changed, ' +
          'or the response was an error page rather than the registry.',
      `received ${formatBytes(byteLength(html))} of HTML`
    );
  }

  let nextData: unknown;
  try {
    nextData = JSON.parse(script[1]);
  } catch (cause) {
    throw new RegistryReadError(
      'parse:__NEXT_DATA__',
      'Registry page __NEXT_DATA__ was not valid JSON.',
      truncateErrorMessage(cause instanceof Error ? cause.message : String(cause))
    );
  }

  const reduxRaw = (nextData as { props?: { pageProps?: { initialReduxState?: unknown } } })?.props
    ?.pageProps?.initialReduxState;
  if (typeof reduxRaw !== 'string') {
    throw new RegistryReadError(
      'extract:initialReduxState',
      'Registry page had no props.pageProps.initialReduxState string — the page shape changed.',
      `found type ${typeof reduxRaw}`
    );
  }

  let redux: unknown;
  try {
    redux = JSON.parse(reduxRaw);
  } catch (cause) {
    throw new RegistryReadError(
      'parse:initialReduxState',
      'Registry page initialReduxState was not valid JSON.',
      truncateErrorMessage(cause instanceof Error ? cause.message : String(cause))
    );
  }

  const collection = (
    redux as { manageRegistry?: { collection?: { default_collection?: unknown } } }
  )?.manageRegistry?.collection?.default_collection;

  if (!Array.isArray(collection)) {
    throw new RegistryReadError(
      'extract:default_collection',
      'Registry page had no manageRegistry.collection.default_collection array — ' +
        'the page shape changed.',
      `found type ${Array.isArray(collection) ? 'array' : typeof collection}`
    );
  }

  return collection as RawRegistryItem[];
}

/**
 * Statuses worth retrying on the registry page.
 *
 * 403 is in here, which looks wrong until you know the page is public and
 * unauthenticated: there is no credential for CloudFront to reject, so a 403 is
 * bot-detection or rate-limiting, not authorization. It is also intermittent —
 * the same URL that returned 403 twice in a row returned 200 to a bare Node
 * `fetch` with no headers minutes later — so a retry genuinely clears it, while
 * header spoofing does not reliably help.
 */
const RETRYABLE_PAGE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

const PAGE_ATTEMPTS = 3;
const PAGE_BACKOFF_BASE_MS = 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch the registry page, retrying the statuses CloudFront uses for throttling.
 *
 * On exhaustion this throws a diagnosis that names the constraint, because the
 * obvious next move — "just point it at the mobile API like every other tool" —
 * does not work, and rediscovering that costs an afternoon. Re-verified
 * 2026-08-01: `GET /v4/shop/registry?registry_id=…` returns HTTP 200 and 4 MB
 * of Shop *browse* modules (SEARCH, CIRCLE_GRID, PARTNER_RETAILERS) with zero
 * registry items and zero purchase fields, and `OPTIONS` reports
 * `allow: POST, OPTIONS` on `/v3/registries/{id}/collections` — there is no GET
 * for the collection anywhere on mobile-api.
 */
async function fetchRegistryPage(
  url: string,
  fetchImpl: typeof fetch,
  opts: { attempts?: number; backoffBaseMs?: number; onAttempt?: (info: object) => void } = {}
): Promise<string> {
  const {
    attempts = PAGE_ATTEMPTS,
    backoffBaseMs = PAGE_BACKOFF_BASE_MS,
    onAttempt = () => {},
  } = opts;

  let lastStatus: number | null = null;
  let lastBody = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    onAttempt({ attempt, attempts, url });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
      });
    } catch (cause) {
      if (attempt < attempts) {
        await sleep(backoffBaseMs * 2 ** (attempt - 1));
        continue;
      }
      throw new RegistryReadError(
        'fetch:transport',
        `Could not reach the registry page ${url} after ${attempts} attempts.`,
        truncateErrorMessage(cause instanceof Error ? cause.message : String(cause))
      );
    }

    if (response.ok) return response.text();

    lastStatus = response.status;
    lastBody = await response.text().catch(() => '');

    if (RETRYABLE_PAGE_STATUS.has(response.status) && attempt < attempts) {
      await sleep(backoffBaseMs * 2 ** (attempt - 1));
      continue;
    }
    break;
  }

  const throttled = lastStatus !== null && RETRYABLE_PAGE_STATUS.has(lastStatus);
  throw new RegistryReadError(
    throttled ? 'fetch:blocked' : 'fetch:http',
    throttled
      ? `Registry page ${url} returned HTTP ${lastStatus} on all ${attempts} attempts. ` +
        'The page is public and unauthenticated, so this is CloudFront bot-detection or ' +
        'rate-limiting rather than an auth failure — it is usually transient, so retry later. ' +
        'There is no mobile-api fallback: GET /v4/shop/registry returns Shop browse content ' +
        'with no registry items, and OPTIONS reports no GET for /v3/registries/{id}/collections.'
      : `Registry page ${url} returned HTTP ${lastStatus}.`,
    truncateErrorMessage(lastBody, 300)
  );
}

/**
 * Read the couple's registry collection.
 *
 * @param client authenticated mobile-api client (used only to resolve the key)
 * @param opts `limit`/`offset` page the projected items; `fetchImpl` is for tests
 */
export async function fetchRegistryCollection(
  client: ZolaClient,
  opts: {
    limit?: number;
    offset?: number;
    fetchImpl?: typeof fetch;
    attempts?: number;
    backoffBaseMs?: number;
    onAttempt?: (info: object) => void;
  } = {}
): Promise<{
  items: RegistryItem[];
  total: number;
  limit: number;
  offset: number;
  registry_key: string;
  source: string;
}> {
  const { limit = 100, offset = 0, fetchImpl = fetch } = opts;
  const { registryId } = await client.getContext();

  // Step 1 — resolve the public key. This is a real mobile-api call and will
  // throw a ZolaApiError carrying status + path if it fails.
  const meta = await client.requestMobile<
    MobileEnvelope<{ key: string | null; public: boolean | null }>
  >('GET', `/v3/registries/${registryId}`);

  const key = meta.data?.key;
  if (!key) {
    throw new RegistryReadError(
      'resolve:key',
      `Registry ${registryId} has no public key, so its collection cannot be read. ` +
        'The mobile API exposes no GET for the collection (OPTIONS on ' +
        '/v3/registries/{id}/collections reports allow: POST, OPTIONS).'
    );
  }
  if (meta.data?.public === false) {
    throw new RegistryReadError(
      'resolve:public',
      `Registry ${key} is not public, so its collection page cannot be read. ` +
        'Make the registry public in Zola, or the collection stays unreadable — ' +
        'the mobile API has no GET for it.'
    );
  }

  // Step 2 — fetch the server-rendered registry page, with retry.
  const url = `${REGISTRY_WEB_BASE}/${encodeURIComponent(key)}`;
  const html = await fetchRegistryPage(url, fetchImpl, opts);
  const raw = extractItemsFromHtml(html);

  // An empty collection is legitimate (a brand-new registry), but it is not the
  // same as a failed read — the steps above throw rather than fall through, so
  // reaching here with zero items genuinely means zero items.
  const projected = raw.map(projectRegistryItem);
  const page = projected.slice(offset, offset + limit);

  return {
    items: page,
    total: projected.length,
    limit,
    offset,
    registry_key: key,
    source: url,
  };
}
