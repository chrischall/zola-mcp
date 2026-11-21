import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZolaClient } from '../src/client.js';
import { getGiftTracker, getRegistry, listEvents } from '../src/tools/events.js';
import {
  addRegistryItem,
  removeRegistryItem,
  searchRegistryProducts,
  updateRegistryItem,
} from '../src/tools/registry-items.js';
import { reconcileRegistry } from '../src/tools/reconcile-registry.js';
import { NO_ELICIT_CTX } from './_confirm-helpers.js';

/**
 * Zola returns `registry: null` for an account that has not created a registry.
 * That used to throw `Cannot read properties of null (reading 'id')` inside
 * `getContext()`, so a wedding tool such as `list_events` died before it ever
 * reached its own endpoint. Context must record the absence, and only the
 * tools that need a registry may fail — with this sentence, and before they
 * call the API.
 */
const NO_REGISTRY = /No registry is associated with this Zola account/;

function contextBody(registry: { id: string } | null) {
  return {
    data: {
      user: { id: 'user-1' },
      wedding_account: { wedding_account_id: 1000001 },
      wedding: {
        wedding_id: 7000001,
        wedding_date: '2026-10-17',
        slug: 'alexjordan2026',
      },
      registry,
    },
  };
}

/** A client whose only successful request is the context read. */
function account(registry: { id: string } | null) {
  const zola = new ZolaClient();
  const req = vi.spyOn(zola, 'requestMobile').mockImplementation(async (method, path) => {
    if (path === '/v3/users/me/context') return contextBody(registry) as never;
    throw new Error(`downstream ${method} ${path}`);
  });
  return { zola, req };
}

describe('accounts without a registry', () => {
  beforeEach(() => {
    delete process.env.ZOLA_ACCOUNT_ID;
    delete process.env.ZOLA_REGISTRY_ID;
    delete process.env.ZOLA_WEDDING_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ZOLA_ACCOUNT_ID;
    delete process.env.ZOLA_REGISTRY_ID;
    delete process.env.ZOLA_WEDDING_ID;
  });

  it('records a null registry and an existing one', async () => {
    const missing = account(null);
    const none = await missing.zola.getContext();
    expect(none.registryId).toBeNull();
    expect(none.weddingAccountId).toBe(1000001);
    expect(none.weddingId).toBe(7000001);
    await expect(missing.zola.getRegistryId()).rejects.toThrow(NO_REGISTRY);

    const present = account({ id: 'registry-1' });
    const ctx = await present.zola.getContext();
    expect(ctx.registryId).toBe('registry-1');
    await expect(present.zola.getRegistryId()).resolves.toBe('registry-1');
  });

  it('caches context whether or not a registry exists', async () => {
    for (const registry of [null, { id: 'registry-1' }] as const) {
      const { zola, req } = account(registry);
      const first = await zola.getContext();
      const second = await zola.getContext();
      expect(second).toBe(first);
      expect(first.registryId).toBe(registry?.id ?? null);
      expect(req).toHaveBeenCalledTimes(1);
      expect(req).toHaveBeenCalledWith('GET', '/v3/users/me/context');
    }
  });

  it('lists events when the account has no registry', async () => {
    const zola = new ZolaClient();
    const req = vi.spyOn(zola, 'requestMobile').mockImplementation(async (method, path) => {
      if (path === '/v3/users/me/context') return contextBody(null) as never;
      if (path === '/v3/websites/events/wedding-accounts/1000001/groups') {
        return {
          data: [
            {
              start_date: '2026-10-17T00:00:00Z',
              events: [
                {
                  event_entity_id: 2000001,
                  name: 'Reception',
                  start_at: '2026-10-17T18:30:00Z',
                },
              ],
            },
          ],
        } as never;
      }
      throw new Error(`downstream ${method} ${path}`);
    });

    const result = await listEvents(zola);
    const events = JSON.parse(result.content[0].text as string) as Array<{ name: string }>;

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('Reception');
    expect(req.mock.calls.map((call) => call[1])).toEqual([
      '/v3/users/me/context',
      '/v3/websites/events/wedding-accounts/1000001/groups',
    ]);
  });

  it('lets ZOLA_REGISTRY_ID override a null registry from the API', async () => {
    process.env.ZOLA_REGISTRY_ID = 'registry-env';
    const { zola, req } = account(null);

    expect((await zola.getContext()).registryId).toBe('registry-env');
    await expect(zola.getRegistryId()).resolves.toBe('registry-env');
    expect(req).toHaveBeenCalledTimes(1);
    expect(req).toHaveBeenCalledWith('GET', '/v3/users/me/context');
  });

  it('lets ZOLA_REGISTRY_ID override a registry id on the response', async () => {
    process.env.ZOLA_REGISTRY_ID = 'registry-env';
    const { zola } = account({ id: 'registry-1' });
    expect((await zola.getContext()).registryId).toBe('registry-env');
  });

  it('skips the context call when account, registry and wedding ids are all set', async () => {
    process.env.ZOLA_ACCOUNT_ID = '1000001';
    process.env.ZOLA_REGISTRY_ID = 'registry-env';
    process.env.ZOLA_WEDDING_ID = '7000001';
    const zola = new ZolaClient();
    const req = vi.spyOn(zola, 'requestMobile');

    const ctx = await zola.getContext();

    expect(req).not.toHaveBeenCalled();
    expect(ctx.weddingAccountId).toBe(1000001);
    expect(ctx.weddingId).toBe(7000001);
    expect(ctx.registryId).toBe('registry-env');
    await expect(zola.getRegistryId()).resolves.toBe('registry-env');
  });

  it('keeps environment wedding ids when the API registry is null', async () => {
    process.env.ZOLA_ACCOUNT_ID = '1000001';
    process.env.ZOLA_WEDDING_ID = '7000001';
    const { zola, req } = account(null);

    const ctx = await zola.getContext();

    expect(ctx.weddingAccountId).toBe(1000001);
    expect(ctx.weddingId).toBe(7000001);
    expect(ctx.registryId).toBeNull();
    expect(req).toHaveBeenCalledWith('GET', '/v3/users/me/context');
    await expect(zola.getRegistryId()).rejects.toThrow(NO_REGISTRY);
  });

  describe('registry tools', () => {
    // Omitting collection_id is the path that would otherwise look the
    // collection up. The guard has to win before that request, and before
    // remove_registry_item builds a confirmation for a null id.
    const update = {
      collection_item_id: 'item-1',
      collection_id: 'col-1',
      quantity: 1,
      group_gift: false,
      marked_fulfilled: false,
      personal_note: '',
      most_wanted: false,
    };

    const ops: Array<[string, (client: ZolaClient) => Promise<unknown>]> = [
      ['get_gift_tracker', (client) => getGiftTracker(client)],
      ['get_registry', (client) => getRegistry(client)],
      ['search_registry_products', (client) => searchRegistryProducts(client, { category_id: 544 })],
      ['add_registry_item', (client) => addRegistryItem(client, { sku_id: 'sku-1' })],
      ['update_registry_item', (client) => updateRegistryItem(client, update)],
      [
        'remove_registry_item',
        (client) => removeRegistryItem(client, { collection_item_id: 'item-1' }, NO_ELICIT_CTX),
      ],
      ['reconcile_registry', (client) => reconcileRegistry(client)],
    ];

    it.each(ops)('%s fails before any registry request', async (_name, run) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const { zola, req } = account(null);

      await expect(run(zola)).rejects.toThrow(NO_REGISTRY);

      expect(req.mock.calls.map((call) => call[1])).toEqual(['/v3/users/me/context']);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
