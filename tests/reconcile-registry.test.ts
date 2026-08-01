import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  flattenGiftTracker,
  joinTrackerToRegistry,
  reconcileRegistry,
  type TrackerLine,
} from '../src/tools/reconcile-registry.js';
import { projectRegistryItem, type RawRegistryItem } from '../src/registry-collection.js';
import { projectGiftTracker } from '../src/tools/events.js';
import { similarity, isSameProduct, normalizeProductName, tokenize } from '../src/name-match.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

const RAW_TRACKER = JSON.parse(readFixture('gift-tracker.raw.json'));
const RAW_ITEMS = JSON.parse(readFixture('registry-items.raw.json')) as RawRegistryItem[];
const ITEMS = RAW_ITEMS.map(projectRegistryItem);

const SQUARE_BAKER = 'Oven-to-Table Square Baking Dish with Trivet';
const PLAIN_BAKER = 'Oven-to-Table Baking Dish with Trivet';

describe('the two bakers must never merge', () => {
  it('scores below threshold, so they are DISTINCT products', () => {
    // We own one of each. Any matcher that merges them corrupts the reconcile
    // output by attributing one purchase to both.
    expect(similarity(SQUARE_BAKER, PLAIN_BAKER)).toBeLessThan(0.85);
    expect(isSameProduct(SQUARE_BAKER, PLAIN_BAKER)).toBe(false);
  });

  it('keeps "Oven-to-Table" as one token, which is what makes them separable', () => {
    // Split on the hyphen and the pair scores 7/8 = 0.875 and silently merges.
    expect(tokenize(SQUARE_BAKER)).toEqual([
      'oven-to-table', 'square', 'baking', 'dish', 'with', 'trivet',
    ]);
    expect(tokenize(PLAIN_BAKER)).toEqual(['oven-to-table', 'baking', 'dish', 'with', 'trivet']);
  });

  it('both survive projection as separate registry items', () => {
    const bakers = ITEMS.filter((i) => i.name.includes('Baking Dish with Trivet'));
    expect(bakers).toHaveLength(2);
    expect(new Set(bakers.map((b) => b.item_id)).size).toBe(2);
    expect(new Set(bakers.map((b) => normalizeProductName(b.name))).size).toBe(2);
  });

  it('an order for one never claims the other', () => {
    const lines: TrackerLine[] = [
      { ...blankLine(), product_name: PLAIN_BAKER },
    ];
    const { matches } = joinTrackerToRegistry(ITEMS, lines);
    const matched = matches.get(0);
    expect(matched?.name).toBe(PLAIN_BAKER);
    expect(matched?.name).not.toBe(SQUARE_BAKER);
  });

  it('two orders, one for each, resolve to two different items', () => {
    const lines: TrackerLine[] = [
      { ...blankLine(), product_name: SQUARE_BAKER },
      { ...blankLine(), product_name: PLAIN_BAKER },
    ];
    const { matches, orphanOrders } = joinTrackerToRegistry(ITEMS, lines);
    expect(orphanOrders).toHaveLength(0);
    expect(matches.get(0)!.name).toBe(SQUARE_BAKER);
    expect(matches.get(1)!.name).toBe(PLAIN_BAKER);
    expect(matches.get(0)).not.toBe(matches.get(1));
  });

  it('still matches the same mixer written two different ways', () => {
    // The counterpart risk: being so strict that real matches are missed.
    expect(
      isSameProduct(
        'KitchenAid ® Artisan® Plus Steel Blue 5-Quart Tilt-Head Stand Mixer',
        'KitchenAid Artisan Plus 5-Qt Stand Mixer, Steel Blue'
      )
    ).toBe(true);
  });
});

describe('gift tracker projection', () => {
  const { info_modules: _dropped, ...tracker } = RAW_TRACKER;
  const projected = projectGiftTracker(tracker as Record<string, unknown>);

  it('shrinks the payload by more than 10x', () => {
    const before = JSON.stringify(RAW_TRACKER).length;
    const after = JSON.stringify(projected).length;
    expect(after).toBeLessThan(before / 10);
  });

  it('drops the per-order THANK_YOU_CARDS_PROMO blocks', () => {
    // 26.5KB per order — the real bulk of this endpoint, not the image links.
    expect(JSON.stringify(RAW_TRACKER)).toContain('THANK_YOU_CARDS_PROMO');
    expect(JSON.stringify(projected)).not.toContain('THANK_YOU_CARDS_PROMO');
  });

  it('collapses image_links to a single image_url', () => {
    expect(JSON.stringify(RAW_TRACKER)).toContain('image_links');
    const text = JSON.stringify(projected);
    expect(text).not.toContain('image_links');
    expect(text).toContain('image_url');
  });

  it('keeps every field the reconciler reads', () => {
    const lines = flattenGiftTracker(projected as never);
    expect(lines).toHaveLength(flattenGiftTracker(RAW_TRACKER).length);
    for (const line of lines) {
      expect(line.giver_name).toBeTruthy();
      expect(line.product_name).toBeTruthy();
      expect(typeof line.price_cents).toBe('number');
      expect(typeof line.order_date).toBe('number');
    }
  });
});

describe('flattenGiftTracker', () => {
  const lines = flattenGiftTracker(RAW_TRACKER);

  it('produces one row per purchased item with the giver carried down', () => {
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line.giver_name).toBeTruthy();
  });

  it('keeps money as integer cents', () => {
    for (const line of lines) expect(Number.isInteger(line.price_cents)).toBe(true);
  });

  it('defaults a CASH line\'s null quantity to 1', () => {
    for (const line of lines.filter((l) => l.type === 'CASH')) expect(line.quantity).toBe(1);
  });

  it('handles an empty payload', () => {
    expect(flattenGiftTracker({})).toEqual([]);
  });
});

describe('joinTrackerToRegistry', () => {
  it('prefers an item id over a name', () => {
    const target = ITEMS.find((i) => i.name === 'Madeira Oak Flatware Caddy')!;
    const lines: TrackerLine[] = [{ ...blankLine(), product_name: 'something else entirely' }];
    const { matches, matchedBy } = joinTrackerToRegistry(ITEMS, lines, [[target.item_id!]]);
    expect(matches.get(0)).toBe(target);
    expect(matchedBy.get(0)).toBe('item_id');
  });

  it('falls back to the normalized product name', () => {
    const lines: TrackerLine[] = [
      { ...blankLine(), product_name: 'madeira  oak   flatware caddy' },
    ];
    const { matches, matchedBy } = joinTrackerToRegistry(ITEMS, lines);
    expect(matches.get(0)!.name).toBe('Madeira Oak Flatware Caddy');
    expect(matchedBy.get(0)).toBe('product_name');
  });

  it('reports an unmatchable order as an orphan', () => {
    const lines: TrackerLine[] = [{ ...blankLine(), product_name: 'Weber Kettle Grill' }];
    const { matches, orphanOrders } = joinTrackerToRegistry(ITEMS, lines);
    expect(matches.size).toBe(0);
    expect(orphanOrders).toHaveLength(1);
  });

  it('lets one cash fund absorb many contributions', () => {
    // A honeymoon fund is a single registry item with many contributors; the
    // second contributor must not fall out as an orphan.
    const cash = ITEMS.find((i) => i.cash_fund || i.type === 'CASH');
    expect(cash).toBeDefined();
    const lines: TrackerLine[] = [
      { ...blankLine(), product_name: cash!.name, type: 'CASH' },
      { ...blankLine(), product_name: cash!.name, type: 'CASH' },
    ];
    const { matches, orphanOrders } = joinTrackerToRegistry(ITEMS, lines);
    expect(matches.size).toBe(2);
    expect(orphanOrders).toHaveLength(0);
  });

  it('does not let two orders claim one physical item', () => {
    const lines: TrackerLine[] = [
      { ...blankLine(), product_name: 'Madeira Oak Flatware Caddy' },
      { ...blankLine(), product_name: 'Madeira Oak Flatware Caddy' },
    ];
    const { matches, orphanOrders } = joinTrackerToRegistry(ITEMS, lines);
    expect(matches.size).toBe(1);
    expect(orphanOrders).toHaveLength(1);
  });
});

describe('bucketing against the real fixtures', () => {
  const lines = flattenGiftTracker(RAW_TRACKER);
  const { matches } = joinTrackerToRegistry(ITEMS, lines);
  const attributed = new Set(matches.values());
  for (const item of ITEMS) item.purchase_state.attributed = attributed.has(item);

  it('finds the purchased-but-unattributed items', () => {
    const unattributed = ITEMS.filter(
      (i) => i.purchase_state.purchased_qty > 0 && !i.purchase_state.attributed && !i.cash_fund
    );
    const names = unattributed.map((i) => i.name);
    expect(names).toContain(SQUARE_BAKER);
    expect(names).toContain(PLAIN_BAKER);
    expect(names).toContain('Set of 3 Baking Dishes with Bamboo Lids');
    // Both bakers appear separately — never collapsed into one entry.
    expect(names.filter((n) => n.includes('Baking Dish with Trivet'))).toHaveLength(2);
  });

  it('does not flag an item an order accounts for', () => {
    const caddy = ITEMS.find((i) => i.name === 'Madeira Oak Flatware Caddy')!;
    expect(caddy.purchase_state.purchased_qty).toBe(1);
    expect(caddy.purchase_state.attributed).toBe(true);
  });

  it('reports DUPLICATE_RISK strictly from the flag/count disagreement', () => {
    const risky = ITEMS.filter((i) => i.purchase_state.inconsistent);
    for (const item of risky) {
      expect(item.purchase_state.marked_fulfilled).toBe(true);
      expect(item.purchase_state.purchased_qty).toBe(0);
    }
  });

  it('would flag DUPLICATE_RISK if an item were marked fulfilled with no purchase', () => {
    const synthetic = projectRegistryItem({
      item_id: 'x',
      name: 'Ghost Item',
      requested_quantity: 1,
      contributions: { completed_units: 0, mark_fulfilled: true },
    });
    expect(synthetic.purchase_state.inconsistent).toBe(true);
    expect(synthetic.purchase_state.availability).toBe('AVAILABLE');
  });
});

function blankLine(): TrackerLine {
  return {
    order_id: null,
    order_number: null,
    order_item_id: null,
    giver_name: null,
    giver_email: null,
    order_date: null,
    gift_message: null,
    product_name: null,
    store_name: null,
    price_cents: null,
    quantity: 1,
    product_url: null,
    type: 'EXTERNAL',
    confirmed_at: null,
  };
}

describe('reconcile reads the whole registry, never a page', () => {
  /**
   * Paging the join while the tracker stayed unpaged turned every order whose
   * item fell outside the page into a fabricated ORPHAN_ORDER, while
   * totals.registry_items still reported the full count — a partial run that
   * read as a complete one. reconcileRegistry now always reads everything.
   */
  const PAGE_HTML = readFixture('registry-page.html');

  function stubbedClient() {
    return {
      getContext: vi.fn().mockResolvedValue({ registryId: 'registry-1' }),
      requestMobile: vi.fn(async (_m: string, path: string) => {
        if (path.startsWith('/v3/registries/')) return { data: { key: 'k', public: true } };
        if (path.startsWith('/v3/gift_tracker/')) return { data: RAW_TRACKER };
        throw new Error(`unexpected path ${path}`);
      }),
    } as never;
  }

  async function runReconcile() {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, text: async () => PAGE_HTML } as Response);
    try {
      const result = await reconcileRegistry(stubbedClient());
      return JSON.parse(result.content[0].text as string);
    } finally {
      fetchSpy.mockRestore();
    }
  }

  it('reconciles against the full 75-item collection', async () => {
    const report = await runReconcile();
    expect(report.totals.registry_items).toBe(ITEMS.length);
    expect(report.totals.registry_items).toBe(75);
  });

  it('fabricates no orphan orders when every ordered item is in the registry', async () => {
    const report = await runReconcile();
    expect(report.buckets.ORPHAN_ORDER).toEqual([]);
  });

  it('accounts for every tracker line exactly once', async () => {
    const report = await runReconcile();
    const accounted = report.buckets.MATCHED + report.buckets.ORPHAN_ORDER.length;
    expect(accounted).toBe(report.totals.tracker_lines);
    expect(report.totals.tracker_lines).toBe(flattenGiftTracker(RAW_TRACKER).length);
  });

  it('reports both bakers separately in UNATTRIBUTED, never merged', async () => {
    const report = await runReconcile();
    const names = report.buckets.UNATTRIBUTED.map((u: { name: string }) => u.name);
    expect(names).toContain(SQUARE_BAKER);
    expect(names).toContain(PLAIN_BAKER);
  });

  it('excludes the cash fund from UNATTRIBUTED', async () => {
    // isCashFund() governs both the join and this bucket; they disagreed before.
    const report = await runReconcile();
    const names = report.buckets.UNATTRIBUTED.map((u: { name: string }) => u.name);
    expect(names.some((n: string) => n.includes('Kilimanjaro'))).toBe(false);
  });
});
