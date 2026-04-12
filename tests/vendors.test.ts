import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listVendors, searchVendors, addVendor, updateVendor, removeVendor } from '../src/tools/vendors.js';

const MOCK_BOOKED_VENDOR = {
  id: 26135549,
  uuid: 'vendor-uuid-1',
  account_id: 7585875,
  vendor_type: 'VENUE',
  vendor_name: 'Doubletree by Hilton',
  booked: true,
  price_cents: 2456900,
  event_date: 1792271776000,
  vendor_card: {
    id: 1467337,
    storefront_id: null,
    storefront_uuid: null,
    vendor_name: 'Rooftop 230',
    taxonomy_node: { key: 'wedding-venues', label: 'Venues', singular_name: 'Venue' },
    city: 'Charlotte',
    state_province: 'NC',
    email: null,
    starting_price_cents: null,
  },
};

const MOCK_UNBOOKED_VENDOR = {
  id: 0,
  uuid: 'slot-uuid-1',
  account_id: 7585875,
  vendor_type: 'PHOTOGRAPHER',
  vendor_name: '',
  booked: false,
  price_cents: null,
  event_date: null,
  vendor_card: null,
};

const MOCK_LIST_RESPONSE = {
  data: {
    booked_vendors: [MOCK_BOOKED_VENDOR, MOCK_UNBOOKED_VENDOR],
  },
};

describe('vendor tools (mobile API)', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listVendors: POSTs to booked-list and returns vendors', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_LIST_RESPONSE as never);

    const result = await listVendors();

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/account-vendors/booked-list', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].vendor_name).toBe('Doubletree by Hilton');
    expect(parsed[0].booked).toBe(true);
  });

  it('searchVendors: POSTs typeahead search with query and taxonomy', async () => {
    const mockResults = {
      data: [
        { id: 513236, name: 'Zoom Wedding Studio', phone: '(305) 915-8857', email: 'zoom@example.com', address: { city: 'Charlotte', state_province_region: 'NC' } },
      ],
    };
    reqSpy.mockResolvedValueOnce(mockResults as never);

    const result = await searchVendors({ query: 'Zoom', taxonomy_key: 'wedding-photographers' });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/reference-vendors/typeahead-taxonomy', {
      query: 'Zoom',
      taxonomy_key: 'wedding-photographers',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Zoom Wedding Studio');
  });

  it('addVendor: finds unbooked slot and PUTs with id:0', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
      .mockResolvedValueOnce({ data: { budget_sync_resolution: {} } } as never);

    await addVendor({
      vendor_type: 'PHOTOGRAPHER',
      name: 'Zoom Wedding Studio',
      city: 'Charlotte',
      state_province: 'NC',
      reference_vendor_id: 513236,
    });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(2, 'PUT', '/v5/account-vendors/vendor', expect.objectContaining({
      uuid: 'slot-uuid-1',
      id: 0,
      vendor_type: 'PHOTOGRAPHER',
      booked: true,
      reference_vendor_request: expect.objectContaining({
        id: 513236,
        name: 'Zoom Wedding Studio',
      }),
    }));
  });

  it('addVendor: throws when no unbooked slot available', async () => {
    const noSlots = { data: { booked_vendors: [MOCK_BOOKED_VENDOR] } };
    reqSpy.mockResolvedValueOnce(noSlots as never);

    await expect(
      addVendor({ vendor_type: 'PHOTOGRAPHER', name: 'Test', city: 'NYC', state_province: 'NY' })
    ).rejects.toThrow('No unbooked slot for vendor type "PHOTOGRAPHER"');
  });

  it('updateVendor: loads current, merges fields, PUTs with existing id', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateVendor({ uuid: 'vendor-uuid-1', price_cents: 3000000 });

    expect(reqSpy).toHaveBeenNthCalledWith(2, 'PUT', '/v5/account-vendors/vendor', expect.objectContaining({
      uuid: 'vendor-uuid-1',
      id: 26135549,
      price_cents: 3000000,
      reference_vendor_request: expect.objectContaining({
        name: 'Doubletree by Hilton',
      }),
    }));
  });

  it('updateVendor: throws when uuid not found', async () => {
    reqSpy.mockResolvedValueOnce({ data: { booked_vendors: [] } } as never);

    await expect(
      updateVendor({ uuid: 'nonexistent' })
    ).rejects.toThrow('Vendor with UUID "nonexistent" not found');
  });

  it('removeVendor: POSTs unbook with uuid', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);

    const result = await removeVendor({ uuid: 'vendor-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/account-vendors/vendor/unbook', { uuid: 'vendor-uuid-1' });
    expect(result.content[0].text).toContain('vendor-uuid-1');
  });
});
