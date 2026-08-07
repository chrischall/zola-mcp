import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  extractItemsFromHtml,
  projectRegistryItem,
  derivePurchaseState,
  dollarsToCents,
  canonicalImageUrl,
  fetchRegistryCollection,
  RegistryReadError,
  type RawRegistryItem,
} from '../src/registry-collection.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

const RAW_ITEMS = JSON.parse(readFixture('registry-items.raw.json')) as RawRegistryItem[];
const PAGE_HTML = readFixture('registry-page.html');
const SHOP_PAYLOAD = JSON.parse(readFixture('shop-registry.sample.json'));

/** A client stub: only `getContext` and `requestMobile` are consulted. */
function stubClient(meta: { key: string | null; public: boolean | null }) {
  return {
    getContext: vi.fn().mockResolvedValue({ registryId: 'registry-1' }),
    requestMobile: vi.fn().mockResolvedValue({ data: meta }),
  } as never;
}

function okResponse(body: string) {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

describe('the endpoint that never worked', () => {
  it('the shop-browse payload contains no registry items at all', () => {
    // GET /v4/shop/registry returns HTTP 200 and ~4MB of this. It is why
    // get_registry failed 100% of the time: the request succeeded, and the
    // oversized result then died at the MCP boundary.
    const text = JSON.stringify(SHOP_PAYLOAD);
    for (const marker of ['marked_fulfilled', 'num_purchased', 'collection_item_id', 'completed_units']) {
      expect(text).not.toContain(marker);
    }
    const types = SHOP_PAYLOAD.groups[0].modules.map((m: { type: string }) => m.type);
    expect(types).toContain('SEARCH');
    expect(types).toContain('PARTNER_RETAILERS');
  });
});

describe('extractItemsFromHtml', () => {
  it('pulls the collection out of a real registry page', () => {
    const items = extractItemsFromHtml(PAGE_HTML);
    expect(items).toHaveLength(75);
    expect(items.some((i) => i.name === 'Madeira Oak Flatware Caddy')).toBe(true);
  });

  it('names the step that broke rather than returning nothing', () => {
    // Each of these must throw — an empty read is indistinguishable from
    // "nothing was purchased", which is the worst possible wrong answer here.
    expect(() => extractItemsFromHtml('<html><body>nope</body></html>')).toThrow(
      /__NEXT_DATA__/
    );
    expect(() =>
      extractItemsFromHtml('<script id="__NEXT_DATA__" type="application/json">{bad</script>')
    ).toThrow(/not valid JSON/);
    expect(() =>
      extractItemsFromHtml(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>'
      )
    ).toThrow(/initialReduxState/);
    expect(() =>
      extractItemsFromHtml(
        `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: { pageProps: { initialReduxState: JSON.stringify({ manageRegistry: {} }) } },
        })}</script>`
      )
    ).toThrow(/default_collection/);
  });

  it('names a passcode gate as a gate, not a shape change', () => {
    // resolve:public is a pre-check on the API flag; Zola can still gate the
    // page while reporting public: true, and "the page shape changed" would
    // point at the wrong cause.
    try {
      extractItemsFromHtml('<html><body>Enter the passcode to view this registry</body></html>');
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as RegistryReadError).step).toBe('fetch:gated');
      expect((e as Error).message).toMatch(/passcode/);
    }
  });

  it('carries the failing step on the error', () => {
    try {
      extractItemsFromHtml('<html></html>');
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(RegistryReadError);
      expect((e as RegistryReadError).step).toBe('extract:__NEXT_DATA__');
    }
  });
});

describe('dollarsToCents', () => {
  it('converts without floating-point error', () => {
    // 59.95 * 100 is 5994.999999999999 in IEEE-754.
    expect(dollarsToCents(59.95)).toBe(5995);
    expect(dollarsToCents(599.95)).toBe(59995);
    expect(dollarsToCents(34.96)).toBe(3496);
    expect(dollarsToCents(8000)).toBe(800000);
    expect(dollarsToCents('4.2')).toBe(420);
    expect(dollarsToCents(0)).toBe(0);
  });

  it('returns null for absent or unparseable values', () => {
    expect(dollarsToCents(null)).toBeNull();
    expect(dollarsToCents(undefined)).toBeNull();
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('n/a')).toBeNull();
  });

  it('every fixture price converts to an integer number of cents', () => {
    for (const raw of RAW_ITEMS) {
      const cents = dollarsToCents(raw.price ?? null);
      if (cents !== null) expect(Number.isInteger(cents)).toBe(true);
    }
  });
});

describe('canonicalImageUrl', () => {
  it('picks one URL from the variant map', () => {
    expect(
      canonicalImageUrl([{ full: 'https://x/full', large: 'https://x/large', thumb: null }])
    ).toBe('https://x/full');
  });

  it('falls through to a smaller variant when full is absent', () => {
    expect(canonicalImageUrl([{ full: null, medium: 'https://x/med' }])).toBe('https://x/med');
  });

  it('falls back to any URL when variant keys are unrecognised', () => {
    expect(canonicalImageUrl([{ xl_2x: 'https://x/unknown-key' }])).toBe('https://x/unknown-key');
  });

  it('handles missing images', () => {
    expect(canonicalImageUrl(null)).toBeNull();
    expect(canonicalImageUrl([])).toBeNull();
  });
});

describe('derivePurchaseState', () => {
  it('keeps marked_fulfilled and purchased_qty as independent signals', () => {
    const state = derivePurchaseState({
      requested_quantity: 1,
      contributions: { completed_units: 0, mark_fulfilled: true },
    });
    // Collapsing these into one "purchased" field would destroy the only
    // evidence that the item is still for sale.
    expect(state.marked_fulfilled).toBe(true);
    expect(state.purchased_qty).toBe(0);
    expect(state.inconsistent).toBe(true);
    expect(state.availability).toBe('AVAILABLE');
  });

  it('is not inconsistent when a fulfilled flag is backed by a purchase', () => {
    const state = derivePurchaseState({
      requested_quantity: 1,
      contributions: { completed_units: 1, mark_fulfilled: true },
    });
    expect(state.inconsistent).toBe(false);
    expect(state.availability).toBe('FULLY_CLAIMED');
  });

  it.each([
    [0, 1, 'AVAILABLE'],
    [1, 1, 'FULLY_CLAIMED'],
    [1, 2, 'PARTIALLY_CLAIMED'],
    [2, 2, 'FULLY_CLAIMED'],
    [3, 2, 'FULLY_CLAIMED'],
  ])('completed=%i of %i -> %s', (completed, requested, expected) => {
    const state = derivePurchaseState({
      requested_quantity: requested,
      contributions: { completed_units: completed },
    });
    expect(state.availability).toBe(expected);
  });

  it('defaults a missing requested quantity to 1 and a missing count to 0', () => {
    const state = derivePurchaseState({});
    expect(state.requested_qty).toBe(1);
    expect(state.purchased_qty).toBe(0);
    expect(state.marked_fulfilled).toBe(false);
    expect(state.inconsistent).toBe(false);
  });

  it('measures a cash fund against its money goal, not a unit count', () => {
    // requested_quantity is a meaningless 1 on a cash fund; goal_units is the
    // real target. Using the former reported a 6%-funded honeymoon fund as
    // FULLY_CLAIMED.
    //
    // Driven from the REAL fixture rather than a hand-built object, and through
    // the whole extract -> derive path: a synthetic input asserts that the
    // function is right about a shape we invented, which is exactly what would
    // keep passing if Zola's payload moved and the fixture moved with it.
    const cash = extractItemsFromHtml(PAGE_HTML).find((item) => item.cash_fund);
    expect(cash, 'the fixture must keep a cash fund, or this guards nothing').toBeDefined();
    expect(cash!.requested_quantity).toBe(1);

    const state = derivePurchaseState(cash!);
    expect(state.requested_qty).toBe(800000);
    expect(state.purchased_qty).toBe(50000);
    expect(state.availability).toBe('PARTIALLY_CLAIMED');
    // The bug in one line: the fund is 6% funded, so anything reporting it as
    // fully claimed is reading requested_quantity again.
    expect(state.availability).not.toBe('FULLY_CLAIMED');
  });

  it('still measures a physical item from the fixture by unit count', () => {
    const physical = extractItemsFromHtml(PAGE_HTML).find((item) => !item.cash_fund);
    expect(physical).toBeDefined();
    const state = derivePurchaseState(physical!);
    expect(state.requested_qty).toBe(physical!.requested_quantity);
  });

  it('still uses requested_quantity for a physical item', () => {
    const state = derivePurchaseState({
      type: 'EXTERNAL',
      requested_quantity: 2,
      contributions: { completed_units: 1, goal_units: 2 },
    });
    expect(state.requested_qty).toBe(2);
    expect(state.availability).toBe('PARTIALLY_CLAIMED');
  });

  it('leaves attribution to the reconciler', () => {
    expect(derivePurchaseState({}).attributed).toBe(false);
  });
});

describe('projection', () => {
  const projected = RAW_ITEMS.map(projectRegistryItem);

  it('shrinks the payload substantially', () => {
    // Measured on this fixture: 156.5 KB -> 47.1 KB, a 3.3x reduction. The
    // larger win is upstream — the endpoint this replaces returned 4 MB.
    const before = JSON.stringify(RAW_ITEMS).length;
    const after = JSON.stringify(projected).length;
    expect(after).toBeLessThan(before / 3);
  });

  it('keeps every field the reconciler reads', () => {
    for (const item of projected) {
      expect(item).toHaveProperty('item_id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('price_cents');
      expect(item.purchase_state).toMatchObject({
        requested_qty: expect.any(Number),
        purchased_qty: expect.any(Number),
        marked_fulfilled: expect.any(Boolean),
        attributed: expect.any(Boolean),
        availability: expect.stringMatching(/^(AVAILABLE|PARTIALLY_CLAIMED|FULLY_CLAIMED)$/),
        inconsistent: expect.any(Boolean),
      });
    }
  });

  it('preserves the purchase counts exactly', () => {
    const rawPurchased = RAW_ITEMS.filter((i) => (i.contributions?.completed_units ?? 0) > 0).length;
    expect(projected.filter((i) => i.purchase_state.purchased_qty > 0)).toHaveLength(rawPurchased);
  });

  it('collapses the 5-variant image array to one URL', () => {
    const withImages = projected.filter((i) => i.image_url !== null);
    expect(withImages.length).toBeGreaterThan(0);
    for (const item of withImages) expect(typeof item.image_url).toBe('string');
    expect(JSON.stringify(projected)).not.toContain('"thumb"');
  });

  it('never emits a fractional price', () => {
    for (const item of projected) {
      if (item.price_cents !== null) expect(Number.isInteger(item.price_cents)).toBe(true);
    }
  });
});

describe('fetchRegistryCollection', () => {
  it('reads, projects and pages the collection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(PAGE_HTML));
    const result = await fetchRegistryCollection(stubClient({ key: 'couple-registry', public: true }), {
      limit: 10,
      offset: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.total).toBe(75);
    expect(result.items).toHaveLength(10);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
    expect(result.registry_key).toBe('couple-registry');
    expect(fetchImpl.mock.calls[0][0]).toContain('/registry/couple-registry');
  });

  it('pages without dropping or duplicating items', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(PAGE_HTML));
    const client = stubClient({ key: 'couple-registry', public: true });
    const seen: string[] = [];
    for (let offset = 0; offset < 75; offset += 25) {
      const page = await fetchRegistryCollection(client, {
        limit: 25,
        offset,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      seen.push(...page.items.map((i) => i.name));
    }
    expect(seen).toHaveLength(75);
    expect(new Set(seen).size).toBe(new Set(RAW_ITEMS.map((i) => i.name)).size);
  });

  it('fails loudly when the registry has no public key', async () => {
    await expect(
      fetchRegistryCollection(stubClient({ key: null, public: true }), {
        fetchImpl: vi.fn() as unknown as typeof fetch,
      })
    ).rejects.toThrow(/no public key/);
  });

  it('fails loudly when the registry is not public', async () => {
    await expect(
      fetchRegistryCollection(stubClient({ key: 'k', public: false }), {
        fetchImpl: vi.fn() as unknown as typeof fetch,
      })
    ).rejects.toThrow(/not public/);
  });

  it('fails loudly on an HTTP error, never as an empty collection', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'upstream down' });
    await expect(
      fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffBaseMs: 0,
      })
    ).rejects.toThrow(/HTTP 503/);
  });

  it('fails loudly when the page shape changes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('<html>redesigned</html>'));
    await expect(
      fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toThrow(RegistryReadError);
  });
});

describe('the intermittent 403', () => {
  /**
   * The page is public and unauthenticated, so a 403 is CloudFront
   * bot-detection or rate-limiting, not authorization — and it is
   * intermittent: the same URL that 403'd twice in a row served 200 to a bare
   * Node `fetch` minutes later. So it is retried, and the final message says
   * what it actually is.
   */
  const ok = (body: string) => ({ ok: true, status: 200, text: async () => body }) as Response;
  const fail = (status: number) =>
    ({ ok: false, status, text: async () => 'blocked' }) as Response;

  it('recovers when a later attempt succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(ok(PAGE_HTML));

    const result = await fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result.total).toBe(75);
  });

  it('diagnoses an exhausted 403 as throttling, not auth, and names the lack of a fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(403));
    const err = await fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 0,
    }).catch((e) => e as RegistryReadError);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(err.step).toBe('fetch:blocked');
    expect(err.message).toMatch(/bot-detection or rate-limiting rather than an auth failure/);
    // The next person's instinct is "point it at mobile-api"; say why that fails.
    expect(err.message).toMatch(/no mobile-api fallback/);
    expect(err.message).toMatch(/no registry items/);
  });

  it('does not retry a status that will not change', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(404));
    await expect(
      fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        backoffBaseMs: 0,
      })
    ).rejects.toThrow(/HTTP 404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially between attempts', async () => {
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number) => {
      delays.push(ms ?? 0);
      return realSetTimeout(fn as () => void, 0);
    }) as typeof setTimeout);

    const fetchImpl = vi.fn().mockResolvedValue(fail(429));
    await fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 100,
    }).catch(() => {});

    expect(delays).toEqual([100, 200]);
    vi.restoreAllMocks();
  });

  it('retries a transport failure too', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(ok(PAGE_HTML));

    const result = await fetchRegistryCollection(stubClient({ key: 'k', public: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffBaseMs: 0,
    });
    expect(result.total).toBe(75);
  });
});
