import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listVendors, searchVendors, addVendor, updateVendor, removeVendor } from '../src/tools/vendors.js';
import { setupClientMocks } from './_fixtures.js';

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
    reqSpy = setupClientMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listVendors: POSTs to booked-list and returns vendors', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_LIST_RESPONSE as never);

    const result = await listVendors(client);

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

    const result = await searchVendors(client, { query: 'Zoom', taxonomy_key: 'wedding-photographers' });

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

    await addVendor(client, {
      vendor_type: 'PHOTOGRAPHER',
      name: 'Zoom Wedding Studio',
      city: 'Charlotte',
      state: 'NC',
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
      addVendor(client, { vendor_type: 'PHOTOGRAPHER', name: 'Test', city: 'NYC', state: 'NY' })
    ).rejects.toThrow('No unbooked slot for vendor type "PHOTOGRAPHER"');
  });

  it('updateVendor: loads current, merges fields, PUTs with existing id', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateVendor(client, { uuid: 'vendor-uuid-1', price_cents: 3000000 });

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
      updateVendor(client, { uuid: 'nonexistent' })
    ).rejects.toThrow('Vendor with UUID "nonexistent" not found');
  });

  describe('event_date parsing (fleet-audit #815)', () => {
    function putBody() {
      return reqSpy.mock.calls[1][2] as Record<string, unknown>;
    }

    it('updateVendor: rejects an unparseable event_date instead of sending null and erasing the stored date', async () => {
      reqSpy.mockResolvedValueOnce(MOCK_LIST_RESPONSE as never);
      await expect(
        updateVendor(client, { uuid: 'vendor-uuid-1', event_date: 'Oct 17th' })
      ).rejects.toThrow(/event_date/);
      expect(reqSpy).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
    });

    it('addVendor: rejects an unparseable event_date', async () => {
      reqSpy.mockResolvedValueOnce(MOCK_LIST_RESPONSE as never);
      await expect(
        addVendor(client, { vendor_type: 'PHOTOGRAPHER', name: 'X', city: 'C', state_province: 'NC', event_date: '17/10/2026' })
      ).rejects.toThrow(/event_date/);
      expect(reqSpy).not.toHaveBeenCalledWith('PUT', expect.anything(), expect.anything());
    });

    it('updateVendor: a date-only value lands on that calendar day in every US timezone (UTC noon, not UTC midnight)', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', event_date: '2026-10-17' });
      const ms = putBody().event_date as number;
      expect(ms).toBe(Date.UTC(2026, 9, 17, 12));
      for (const timeZone of ['America/New_York', 'America/Los_Angeles', 'Pacific/Honolulu']) {
        expect(new Date(ms).toLocaleDateString('en-CA', { timeZone })).toBe('2026-10-17');
      }
    });

    it('updateVendor: a full ISO timestamp is passed through as-is', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', event_date: '2026-10-17T18:30:00Z' });
      expect(putBody().event_date).toBe(Date.parse('2026-10-17T18:30:00Z'));
    });

    it('updateVendor: keeps the stored date when event_date is omitted', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', name: 'Renamed' });
      expect(putBody().event_date).toBe(MOCK_BOOKED_VENDOR.event_date);
    });
  });

  describe('updateVendor preserves fields it is not asked to change (fleet-audit #815)', () => {
    function vendorRequest() {
      return (reqSpy.mock.calls[1][2] as { reference_vendor_request: Record<string, unknown> })
        .reference_vendor_request;
    }

    it('sends a new phone when one is given', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', phone: '(704) 555-0100' });
      expect(vendorRequest().phone).toBe('(704) 555-0100');
    });

    it('carries the current phone through when the vendor card has one', async () => {
      const withPhone = {
        data: {
          booked_vendors: [
            { ...MOCK_BOOKED_VENDOR, vendor_card: { ...MOCK_BOOKED_VENDOR.vendor_card, phone: '(704) 555-0199' } },
          ],
        },
      };
      reqSpy
        .mockResolvedValueOnce(withPhone as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', price_cents: 1 });
      expect(vendorRequest().phone).toBe('(704) 555-0199');
    });

    it('does not send phone: null when no phone is known (never wipes it)', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'vendor-uuid-1', price_cents: 1 });
      expect(vendorRequest()).not.toHaveProperty('phone');
    });

    it('keeps the current booked flag instead of forcing booked: true', async () => {
      reqSpy
        .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
        .mockResolvedValueOnce({ data: {} } as never);
      await updateVendor(client, { uuid: 'slot-uuid-1', price_cents: 1 });
      expect((reqSpy.mock.calls[1][2] as { booked: boolean }).booked).toBe(false);
    });
  });

  it('removeVendor: POSTs unbook with uuid', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);

    const result = await removeVendor(client, { uuid: 'vendor-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/account-vendors/vendor/unbook', { uuid: 'vendor-uuid-1' });
    expect(result.content[0].text).toContain('vendor-uuid-1');
  });
});
