import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { getWeddingDashboard, searchStorefronts, getStorefront, listFavorites } from '../src/tools/discover.js';

const MOCK_DASHBOARD = {
  data: {
    modules: [],
    groups: [
      {
        type: 'INVITATIONS',
        title: 'Invites & Paper',
        items: [
          { title: 'Your Favorites', subtitle: '4 favorited' },
          { title: 'Your Drafts', subtitle: '8 drafts in progress' },
        ],
      },
      {
        type: 'VENDORS',
        title: 'Vendors',
        items: [
          { title: 'Booked Vendors', subtitle: '1 booked' },
        ],
      },
    ],
  },
};

const MOCK_SEARCH_RESULT = {
  data: {
    storefronts: [
      {
        id: 27802,
        uuid: 'storefront-uuid-1',
        vendor_name: 'AAM Entertainment Group',
        taxonomy_node: { key: 'wedding-bands-djs', label: 'Bands & DJs' },
        city: 'Charlotte',
        state_province: 'NC',
        starting_price_cents: 100000,
        recommendations: 5,
        average_reviews_rate: 4.8,
      },
    ],
    total: 1,
  },
};

const MOCK_STOREFRONT = {
  data: {
    id: 27802,
    uuid: 'storefront-uuid-1',
    company_id: 25844,
    address: { city: 'Charlotte', state_province_region: 'NC' },
    vendor_name: 'AAM Entertainment Group',
    about: 'We provide entertainment services...',
  },
};

const MOCK_FAVORITES = {
  data: {
    uuid: 'favorites-uuid-1',
    vendor_cards: [
      {
        storefront_id: 27802,
        storefront_uuid: 'storefront-uuid-1',
        vendor_name: 'AAM Entertainment Group',
        city: 'Charlotte',
        state_province: 'NC',
      },
    ],
  },
};

describe('discover tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getWeddingDashboard: GETs your-wedding overview', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_DASHBOARD as never);

    const result = await getWeddingDashboard();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v4/your-wedding');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].type).toBe('INVITATIONS');
  });

  it('searchStorefronts: POSTs search with location and category', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_SEARCH_RESULT as never);

    const result = await searchStorefronts({ taxonomy_node_id: 9, city: 'Charlotte', state_province: 'NC' });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/storefronts/search', expect.objectContaining({
      taxonomy_node_id: 9,
      city: 'Charlotte',
      state: 'NC',
      limit: 24,
      offset: 0,
    }));
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.storefronts).toHaveLength(1);
    expect(parsed.storefronts[0].vendor_name).toBe('AAM Entertainment Group');
  });

  it('getStorefront: GETs full storefront details by UUID', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_STOREFRONT as never);

    const result = await getStorefront({ uuid: 'storefront-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/storefronts/storefront-uuid-1');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.vendor_name).toBe('AAM Entertainment Group');
  });

  it('listFavorites: GETs saved vendors', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_FAVORITES as never);

    const result = await listFavorites();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/favorites/');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.vendor_cards).toHaveLength(1);
  });
});
