import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listVendors, searchVendors, addVendor } from '../src/tools/vendors.js';

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

  describe('addVendor', () => {
    it('finds the first unbooked slot of the given type and PUTs with booked: true', async () => {
      const slots = [
        {
          uuid: 'slot-phot-1',
          vendorType: 'PHOTOGRAPHER',
          vendorName: null,
          booked: false,
          bookedAt: null,
          priceCents: null,
          eventDate: null,
          priority: 1,
          referenceVendorId: null,
          referenceVendorUuid: null,
          vendorCard: null,
        },
      ];
      const updated = { ...slots[0], vendorName: 'Smith Photos', booked: true, bookedAt: Date.now() };
      reqSpy
        .mockResolvedValueOnce(slots as never)
        .mockResolvedValueOnce({ accountVendor: updated } as never);

      const result = await addVendor({
        vendorType: 'PHOTOGRAPHER',
        name: 'Smith Photos',
        city: 'Charlotte',
        stateProvince: 'NC',
      });

      expect(reqSpy).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/v2/account/vendor/slot-phot-1',
        expect.objectContaining({
          vendorType: 'PHOTOGRAPHER',
          booked: true,
          bookingSource: 'BOOKED_VENDORS',
          referenceVendorRequest: expect.objectContaining({
            name: 'Smith Photos',
            address: { city: 'Charlotte', stateProvince: 'NC' },
          }),
          priceCents: null,
          facetKeys: [],
        })
      );
      expect(JSON.parse(result.content[0].text)).toEqual(updated);
    });

    it('passes optional fields when provided', async () => {
      const slot = {
        uuid: 'slot-flor-1',
        vendorType: 'FLORIST',
        vendorName: null,
        booked: false,
        bookedAt: null,
        priceCents: null,
        eventDate: null,
        priority: 2,
        referenceVendorId: null,
        referenceVendorUuid: null,
        vendorCard: null,
      };
      const updated = { ...slot, booked: true };
      reqSpy
        .mockResolvedValueOnce([slot] as never)
        .mockResolvedValueOnce({ accountVendor: updated } as never);

      await addVendor({
        vendorType: 'FLORIST',
        name: 'Petal & Bloom',
        city: 'Raleigh',
        stateProvince: 'NC',
        email: 'hello@petalbloom.com',
        priceCents: 350000,
        eventDate: '2026-10-16',
      });

      expect(reqSpy).toHaveBeenNthCalledWith(
        2,
        'PUT',
        '/v2/account/vendor/slot-flor-1',
        expect.objectContaining({
          priceCents: 350000,
          referenceVendorRequest: expect.objectContaining({
            email: 'hello@petalbloom.com',
          }),
        })
      );
    });

    it('throws when no unbooked slot exists for the given type', async () => {
      reqSpy.mockResolvedValueOnce([
        {
          uuid: 'slot-phot-1',
          vendorType: 'PHOTOGRAPHER',
          vendorName: 'Already Booked',
          booked: true,
          bookedAt: 1234567890,
          priceCents: null,
          eventDate: null,
          priority: 1,
          referenceVendorId: null,
          referenceVendorUuid: null,
          vendorCard: null,
        },
      ] as never);

      await expect(
        addVendor({ vendorType: 'PHOTOGRAPHER', name: 'Smith Photos', city: 'Charlotte', stateProvince: 'NC' })
      ).rejects.toThrow('No unbooked slot found for vendor type "PHOTOGRAPHER"');
    });
  });
});
