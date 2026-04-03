import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listGuests, addGuest, updateGuestAddress, removeGuest } from '../src/tools/guests.js';

const MOCK_GUEST_GROUP = {
  id: 152644475,
  uuid: 'group-uuid-1',
  wedding_account_id: 4664323,
  email_address: null,
  home_phone: null,
  mobile_phone: null,
  address_1: '3839 N Alta Vista Terrace',
  address_2: null,
  city: 'Chicago',
  state_province: 'IL',
  postal_code: '60613',
  country_code: 'US',
  affiliation: 'PRIMARY_FRIEND',
  tier: 'A',
  invited: true,
  invitation_sent: false,
  save_the_date_sent: false,
  envelope_recipient: 'Jennifer Acerra and Jason Shuba',
  envelope_recipient_override: 'Jennifer Acerra and Jason Shuba',
  addressing_style: 'SEMI_FORMAL',
  guests: [
    {
      id: 12345,
      guest_group_id: 152644475,
      relationship_type: 'PRIMARY',
      prefix: null,
      first_name: 'Jennifer',
      middle_name: null,
      family_name: 'Acerra',
      suffix: null,
      printed_name: null,
      source: 'MANUAL',
      rsvp: null,
      email_address: null,
      phone_number: null,
      event_invitations: [],
    },
  ],
  rsvp_question_answers: [],
};

const MOCK_LIST_RESPONSE = {
  guest_groups: [MOCK_GUEST_GROUP],
  facets: [],
  selected_facet_bucket_keys: [],
  global_stats: [
    { key: 'invited_guests', label: 'Definitely Invited', value: 193 },
    { key: 'guests', label: 'In List', value: 193 },
    { key: 'addresses_missing', label: 'Missing Addresses', value: 0 },
    { key: 'adults', label: 'Adults', value: 183 },
    { key: 'children', label: 'Children', value: 10 },
  ],
};

describe('guest tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'request'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'request');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listGuests: POSTs to list/all with empty body and returns stats + groups', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_LIST_RESPONSE as never);

    const result = await listGuests();

    expect(reqSpy).toHaveBeenCalledWith('POST', '/web-api/v1/guestgroup/list/all', {});
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stats.guests).toBe(193);
    expect(parsed.stats.adults).toBe(183);
    expect(parsed.stats.children).toBe(10);
    expect(parsed.guest_groups).toHaveLength(1);
    expect(parsed.guest_groups[0].id).toBe(152644475);
    expect(parsed.guest_groups[0].guests[0].first_name).toBe('Jennifer');
  });

  it('addGuest: builds correct body with primary guest only', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_GUEST_GROUP as never);

    const result = await addGuest({
      first_name: 'Jennifer',
      last_name: 'Acerra',
      affiliation: 'PRIMARY_FRIEND',
    });

    expect(reqSpy).toHaveBeenCalledWith('POST', '/web-api/v1/guestgroup', {
      guests: [{ first_name: 'Jennifer', family_name: 'Acerra', relationship_type: 'PRIMARY' }],
      email_address: null,
      mobile_phone: null,
      affiliation: 'PRIMARY_FRIEND',
      invited: true,
    });
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(152644475);
  });

  it('addGuest: includes plus one with CHILD relationship_type', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_GUEST_GROUP as never);

    await addGuest({
      first_name: 'Jennifer',
      last_name: 'Acerra',
      plus_one_first_name: 'Jason',
      plus_one_last_name: 'Shuba',
    });

    const body = reqSpy.mock.calls[0][2] as { guests: unknown[] };
    expect(body.guests).toHaveLength(2);
    expect(body.guests[1]).toEqual({
      first_name: 'Jason',
      family_name: 'Shuba',
      relationship_type: 'CHILD',
    });
  });

  it('updateGuestAddress: loads list, merges fields, PUTs to address endpoint', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
      .mockResolvedValueOnce(MOCK_GUEST_GROUP as never);

    const result = await updateGuestAddress({
      id: 152644475,
      city: 'Evanston',
      state_province: 'IL',
    });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'POST', '/web-api/v1/guestgroup/list/all', {});
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      '/web-api/v2/guestgroup/152644475/address',
      {
        address_1: '3839 N Alta Vista Terrace',
        address_2: null,
        city: 'Evanston',
        state_province: 'IL',
        postal_code: '60613',
        country_code: 'US',
      }
    );
    expect(result.content[0].text).toContain('152644475');
  });

  it('removeGuest: POSTs ids array to delete endpoint', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_LIST_RESPONSE as never)
      .mockResolvedValueOnce(undefined as never);

    const result = await removeGuest({ id: 152644475 });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(1, 'POST', '/web-api/v1/guestgroup/list/all', {});
    expect(reqSpy).toHaveBeenNthCalledWith(2, 'POST', '/web-api/v1/guestgroup/delete', {
      ids: [152644475],
    });
    expect(result.content[0].text).toContain('152644475');
  });
});
