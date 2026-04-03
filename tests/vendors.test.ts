import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listVendors, searchVendors } from '../src/tools/vendors.js';

describe('vendor tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMarketplace'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMarketplace');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listVendors', () => {
    it('calls get-or-create-vendors and returns result as JSON text', async () => {
      const mockVendors = [
        {
          uuid: 'abc-123',
          vendorType: 'VENUE',
          vendorName: 'Rooftop 230',
          booked: true,
          bookedAt: 1769000000000,
          priceCents: 2456900,
          eventDate: null,
          priority: 0,
          referenceVendorId: 1467337,
          referenceVendorUuid: 'e2b40b42',
          vendorCard: { city: 'Charlotte', stateProvince: 'NC', email: null },
        },
      ];
      reqSpy.mockResolvedValueOnce(mockVendors as never);

      const result = await listVendors();

      expect(reqSpy).toHaveBeenCalledWith(
        'POST',
        '/v1/account/get-or-create-vendors'
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockVendors);
    });
  });

  describe('searchVendors', () => {
    it('passes prefix and returns search results as JSON text', async () => {
      const mockResults = [
        {
          id: '1',
          uuid: 'xyz-456',
          name: 'AAM Entertainment Group',
          email: 'aamentandpromotions@gmail.com',
          address: { city: 'Charlotte', stateProvince: 'NC' },
          storefrontUuid: '8b30a59f',
          taxonomyNodeId: null,
          websiteUrl: null,
          phone: null,
        },
      ];
      reqSpy.mockResolvedValueOnce(mockResults as never);

      const result = await searchVendors({ prefix: 'AAM' });

      expect(reqSpy).toHaveBeenCalledWith(
        'POST',
        '/v1/vendor-search/name-prefix-query',
        { prefix: 'AAM' }
      );
      expect(JSON.parse(result.content[0].text)).toEqual(mockResults);
    });
  });
});
