import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The whole-collection invariant.
 *
 * `reconcileRegistry` asks for the entire registry, but "asks for" is a default
 * and defaults drift. This pins the assertion that turns it into a property the
 * report cannot be published without: a partial read must fail loudly rather
 * than produce a reconciliation that reads as complete while every order for a
 * truncated item is reported as a fabricated ORPHAN_ORDER.
 */
vi.mock('../src/registry-collection.js', async () => {
  const actual = await vi.importActual<typeof import('../src/registry-collection.js')>(
    '../src/registry-collection.js'
  );
  return { ...actual, fetchRegistryCollection: vi.fn() };
});

const { fetchRegistryCollection } = await import('../src/registry-collection.js');
const { reconcileRegistry } = await import('../src/tools/reconcile-registry.js');

const client = {
  getContext: vi.fn().mockResolvedValue({ registryId: 'r1' }),
  requestMobile: vi.fn(async (_m: string, path: string) =>
    path.startsWith('/v3/gift_tracker') ? { data: { order_groups: [] } } : { data: {} }
  ),
} as never;

function collection(itemCount: number, total: number) {
  return {
    items: Array.from({ length: itemCount }, (_, i) => ({
      item_id: `i${i}`, sku_id: null, name: `Item ${i}`, brand: null, store_name: null,
      product_url: null, price_cents: 100, image_url: null, type: 'EXTERNAL',
      cash_fund: false, most_wanted: false, personal_note: null, registry_import: false,
      purchase_state: {
        requested_qty: 1, purchased_qty: 0, marked_fulfilled: false,
        attributed: false, availability: 'AVAILABLE' as const, inconsistent: false,
      },
    })),
    total, limit: itemCount, offset: 0, registry_key: 'k', source: 's',
  };
}

describe('reconcile refuses a partial registry', () => {
  beforeEach(() => vi.mocked(fetchRegistryCollection).mockReset());

  it('throws when the read is truncated, naming both counts', async () => {
    vi.mocked(fetchRegistryCollection).mockResolvedValue(collection(500, 750));
    await expect(reconcileRegistry(client)).rejects.toThrow(/Refusing to reconcile a partial registry: read 500 of 750/);
  });

  it('proceeds when the whole collection was read', async () => {
    vi.mocked(fetchRegistryCollection).mockResolvedValue(collection(75, 75));
    const result = await reconcileRegistry(client);
    const report = JSON.parse(result.content[0].text as string);
    expect(report.totals.registry_items).toBe(75);
  });

  it('asks for the entire collection, not a page', async () => {
    vi.mocked(fetchRegistryCollection).mockResolvedValue(collection(75, 75));
    await reconcileRegistry(client);
    const [, opts] = vi.mocked(fetchRegistryCollection).mock.calls[0];
    expect(opts?.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(opts?.offset).toBeUndefined();
  });
});
