import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  searchRegistryProducts,
  addRegistryItem,
  updateRegistryItem,
  removeRegistryItem,
  _resetRegistryCollectionCache,
} from '../src/tools/registry-items.js';
import { setupClientMocks } from './_fixtures.js';

/**
 * `GET /v3/registries/{id}` — the real shape, from the live account.
 *
 * The previous fixture mocked `/v4/shop/registry` returning a
 * `default_collection_id` and a `COLLECTION` module. That response contains
 * neither, so the old test passed against data the API never produces and the
 * lookup was broken in production the whole time.
 */
const MOCK_REGISTRY_META = {
  data: {
    id: 'registry-1',
    key: 'couple-registry',
    public: true,
    default_collection_id: 'col-1',
    collection_ids: [],
  },
};

describe('registry-items tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
    _resetRegistryCollectionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchRegistryProducts: POSTs offset+limit+registry_id', async () => {
    reqSpy.mockResolvedValueOnce({ data: { entities: [] } } as never);
    await searchRegistryProducts(client, { category_id: 544 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/categories/544/entities', {
      offset: 0,
      limit: 50,
      registry_id: 'registry-1',
    });
  });

  it('searchRegistryProducts: honors pagination args', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);
    await searchRegistryProducts(client, { category_id: 544, offset: 100, limit: 25 });
    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/categories/544/entities', {
      offset: 100,
      limit: 25,
      registry_id: 'registry-1',
    });
  });

  it('addRegistryItem: when collection_id provided, POSTs directly', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { collection_item_id: 'item-99', sku_id: 'sku-1' },
    } as never);
    await addRegistryItem(client, {
      sku_id: 'sku-1',
      collection_id: 'col-1',
      quantity: 2,
      most_wanted: true,
      enable_group_gifting: false,
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/registries/registry-1/collections/col-1',
      { sku_id: 'sku-1', quantity: 2, most_wanted: true, enable_group_gifting: false }
    );
  });

  it('addRegistryItem: when collection_id omitted, looks it up from /v3/registries/{id}', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_META as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);

    await addRegistryItem(client, { sku_id: 'sku-1' });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'GET', '/v3/registries/registry-1');
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'POST',
      '/v3/registries/registry-1/collections/col-1',
      { sku_id: 'sku-1', quantity: 1, most_wanted: false, enable_group_gifting: false }
    );
  });

  it('addRegistryItem: caches collection_id across calls', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_META as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'a' } } as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'b' } } as never);

    await addRegistryItem(client, { sku_id: 'sku-1' });
    await addRegistryItem(client, { sku_id: 'sku-2' });

    const getCalls = reqSpy.mock.calls.filter((c) => c[0] === 'GET');
    expect(getCalls).toHaveLength(1);
  });

  it('updateRegistryItem: PUTs to /items/{id}', async () => {
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);
    await updateRegistryItem(client, {
      collection_item_id: 'item-1',
      collection_id: 'col-1',
      quantity: 3,
      personal_note: 'For the kitchen',
      most_wanted: true,
      group_gift: false,
      marked_fulfilled: false,
    });
    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/registries/registry-1/items/item-1',
      {
        quantity: 3,
        group_gift: false,
        marked_fulfilled: false,
        personal_note: 'For the kitchen',
        most_wanted: true,
        collection_id: 'col-1',
      }
    );
  });

  it('removeRegistryItem: DELETEs /items/{id}', async () => {
    reqSpy.mockResolvedValueOnce({ data: null } as never);
    await removeRegistryItem(client, { collection_item_id: 'item-1' });
    expect(reqSpy).toHaveBeenCalledWith('DELETE', '/v3/registries/registry-1/items/item-1');
  });

  it('addRegistryItem: falls back to collection_ids[0] when default_collection_id is absent', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { default_collection_id: null, collection_ids: ['col-found'] },
    } as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);

    await addRegistryItem(client, { sku_id: 'sku-1' });

    const postCall = reqSpy.mock.calls.find((c) => c[0] === 'POST');
    expect(postCall![1]).toContain('/collections/col-found');
  });

  it('addRegistryItem: never consults the shop-browse endpoint', async () => {
    // Regression guard. GET /v4/shop/registry returns ~4MB of merchandising
    // with no default_collection_id and no COLLECTION module, so the old lookup
    // threw on every call while downloading 4MB to do it.
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_META as never);
    reqSpy.mockResolvedValueOnce({ data: { collection_item_id: 'item-1' } } as never);

    await addRegistryItem(client, { sku_id: 'sku-1' });

    for (const [, path] of reqSpy.mock.calls as unknown as [string, string][]) {
      expect(path).not.toContain('/v4/shop/registry');
    }
  });

  it('addRegistryItem: says which endpoint failed when no collection id is resolvable', async () => {
    reqSpy.mockResolvedValueOnce({ data: { collection_ids: [] } } as never);

    await expect(addRegistryItem(client, { sku_id: 'sku-1' })).rejects.toThrow(
      /GET \/v3\/registries\/registry-1 returned no default_collection_id/
    );
  });

  it('addRegistryItem: throws when no collection can be discovered', async () => {
    reqSpy.mockResolvedValueOnce({
      data: { default_collection_id: undefined, collection_ids: null },
    } as never);
    await expect(addRegistryItem(client, { sku_id: 'sku-1' })).rejects.toThrow(
      /Could not determine the default collection ID for registry registry-1/
    );
  });
});
