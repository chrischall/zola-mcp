import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listGuests, addGuest, updateGuestAddress, removeGuest } from '../src/tools/guests.js';
import { setupClientMocks } from './_fixtures.js';
import { confirmed } from './_confirm-helpers.js';

// FLAT guest shape — matches the live /v3/guestlists/directory response.
// (Fields sit directly on the guest object; there is NO { guest: {...} } wrapper.)
const MOCK_GUEST = {
  guest_id: 4000001,
  relationship_type: 'PRIMARY',
  prefix: null,
  first_name: 'Pat',
  middle_name: null,
  family_name: 'Morgan',
  suffix: null,
  email_address: null,
  home_phone: '',
  mobile_phone: null,
  address1: '3839 N Alta Vista Terrace',
  address2: '',
  city: 'Chicago',
  state_province: 'IL',
  postal_code: '60613',
  country_code: 'US',
  latitude: null,
  longitude: null,
  affiliation: 'PRIMARY_FRIEND',
  tier: 'A',
  source: 'BULK_IMPORT',
  rsvp: 'NO_RESPONSE',
  meal_option: null,
  event_invitations: [
    { id: 111, event_id: 2000002, meal_option_id: null, rsvp_type: 'NO_RESPONSE', rsvp_at: null },
  ],
  tags: [],
};

const MOCK_DIRECTORY = {
  data: {
    num_invited_guests: 193,
    num_guests: 193,
    num_addresses_missing: 0,
    guest_groups: [
      {
        guest_group_id: 3000001,
        guest_group_uuid: 'group-uuid-1',
        wedding_account_id: 1000001,
        envelope_recipient: 'Pat Morgan and Sam Morgan',
        addressing_style: 'SEMI_FORMAL',
        guest_group_affiliation: 'PRIMARY_FRIEND',
        guest_group_tier: 'A',
        invited: true,
        invitation_sent: false,
        save_the_date_sent: false,
        rsvp_question_answers: [],
        gift_count: 0,
        gift_group: null,
        thank_you_note_status: 'NOT_STARTED',
        guests: [MOCK_GUEST],
      },
    ],
  },
};

describe('guest tools (mobile API)', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listGuests: POSTs to directory and returns stats + groups', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never);

    const result = await listGuests(client);

    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/guestlists/directory/wedding-accounts/1000001',
      { sort_by_name_asc: true }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stats.num_guests).toBe(193);
    expect(parsed.guest_groups).toHaveLength(1);
    expect(parsed.guest_groups[0].guests[0].first_name).toBe('Pat');
  });

  it('listGuests: the default view leaves out every contact detail (addresses, emails, phones)', async () => {
    const directory = structuredClone(MOCK_DIRECTORY);
    Object.assign(directory.data.guest_groups[0].guests[0], {
      email_address: 'pat@example.com',
      mobile_phone: '555-0100',
      home_phone: '555-0101',
      address2: 'Apt 2',
    });
    reqSpy.mockResolvedValueOnce(directory as never);

    const result = await listGuests(client);

    const text = result.content[0].text as string;
    for (const leaked of ['Alta Vista', 'Apt 2', 'Chicago', '60613', 'pat@example.com', '555-0100', '555-0101']) {
      expect(text).not.toContain(leaked);
    }
    const parsed = JSON.parse(text);
    expect(parsed.stats.num_addresses_missing).toBe(0);
    const group = parsed.guest_groups[0];
    expect(group).toMatchObject({
      guest_group_id: 3000001,
      envelope_recipient: 'Pat Morgan and Sam Morgan',
      tier: 'A',
      invited: true,
    });
    expect(group.guests[0]).toEqual({
      guest_id: 4000001,
      first_name: 'Pat',
      family_name: 'Morgan',
      relationship_type: 'PRIMARY',
      rsvp: 'NO_RESPONSE',
      has_address: true,
      event_invitations: [{ event_id: 2000002, rsvp_type: 'NO_RESPONSE' }],
    });
  });

  it('listGuests: view "full" returns the directory records untouched', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never);

    const result = await listGuests(client, { view: 'full' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.guest_groups).toEqual(MOCK_DIRECTORY.data.guest_groups);
  });

  it('removeGuest: refuses an unknown household without writing', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never);

    await expect(
      confirmed((ctx, confirmToken) => removeGuest(client, { guest_group_id: 999, confirmToken }, ctx))
    ).rejects.toThrow('Guest group with ID 999 not found');
    expect(reqSpy).toHaveBeenCalledTimes(1);
  });

  // The create response as the live API returned it (Nov 2026), anonymised to
  // the repo's synthetic ids/names. A group created through add_guest reads back
  // in exactly this shape.
  const CREATED_GROUP = {
    status: 'success',
    data: {
      guest_group_id: 3000099,
      guest_group_uuid: '00000000-0000-4000-8000-000000000099',
      wedding_account_id: 1000001,
      invitation_sent: false,
      invited: true,
      save_the_date_sent: false,
      envelope_recipient: 'Pat and Sam Morgan',
      addressing_style: 'SEMI_FORMAL',
      guest_group_affiliation: 'PARTNER_FAMILY_FRIEND',
      guest_group_tier: 'A',
      guests: [
        {
          guest_id: 4000099, relationship_type: 'PRIMARY', prefix: null, first_name: 'Pat', middle_name: null,
          family_name: 'Morgan', suffix: null, address1: '3839 N Alta Vista Terrace', address2: null,
          city: 'Chicago', state_province: 'IL', postal_code: '60613', country_code: 'US',
          affiliation: 'PARTNER_FAMILY_FRIEND', tier: 'A', source: 'IOS', rsvp: 'NO_RESPONSE',
          event_invitations: [{ id: 5000001, event_id: 2000001, meal_option_id: null, rsvp_type: 'NO_RESPONSE', rsvp_at: null }],
          tags: [],
        },
        {
          guest_id: 4000100, relationship_type: 'PARTNER', prefix: null, first_name: 'Sam', middle_name: null,
          family_name: 'Morgan', suffix: null, address1: '3839 N Alta Vista Terrace', address2: null,
          city: 'Chicago', state_province: 'IL', postal_code: '60613', country_code: 'US',
          affiliation: 'PARTNER_FAMILY_FRIEND', tier: 'A', source: 'IOS', rsvp: 'NO_RESPONSE',
          event_invitations: [{ id: 5000002, event_id: 2000001, meal_option_id: null, rsvp_type: 'NO_RESPONSE', rsvp_at: null }],
          tags: [],
        },
      ],
    },
  };

  const FULL_ARGS = {
    first_name: 'Pat',
    last_name: 'Morgan',
    plus_one_first_name: 'Sam',
    affiliation: 'PARTNER_FAMILY_FRIEND',
    event_ids: [2000001],
    address1: '3839 N Alta Vista Terrace',
    city: 'Chicago',
    state_province: 'IL',
    postal_code: '60613',
  };

  type AddBody = { guests: Record<string, unknown>[]; [k: string]: unknown };

  it('addGuest: sends the body shape the live API accepts (regression: every call 400d)', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, FULL_ARGS);

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/guestlists/groups', expect.anything());
    const body = reqSpy.mock.calls[0][2] as AddBody;
    expect(body).toEqual({
      wedding_account_id: 1000001,
      guest_group_affiliation: 'PARTNER_FAMILY_FRIEND',
      guest_group_tier: 'A',
      invited: true,
      invitation_sent: false,
      save_the_date_sent: false,
      guests: [
        expect.objectContaining({ first_name: 'Pat', family_name: 'Morgan', relationship_type: 'PRIMARY' }),
        expect.objectContaining({ first_name: 'Sam', family_name: 'Morgan', relationship_type: 'PARTNER' }),
      ],
    });
  });

  it('addGuest: never sends empty-string prefix/middle_name/suffix (the cause of the 400)', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, { first_name: 'Pat', last_name: 'Morgan' });

    const [guest] = (reqSpy.mock.calls[0][2] as AddBody).guests;
    for (const value of Object.values(guest)) expect(value).not.toBe('');
    expect(guest).not.toHaveProperty('prefix');
    expect(guest).not.toHaveProperty('middle_name');
    expect(guest).not.toHaveProperty('suffix');
  });

  it('addGuest: applies event_ids and the address to every guest', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, FULL_ARGS);

    const { guests } = reqSpy.mock.calls[0][2] as AddBody;
    for (const guest of guests) {
      expect(guest).toEqual(expect.objectContaining({
        address1: '3839 N Alta Vista Terrace',
        city: 'Chicago',
        state_province: 'IL',
        postal_code: '60613',
        country_code: 'US',
        affiliation: 'PARTNER_FAMILY_FRIEND',
        tier: 'A',
        event_invitations: [{ id: null, event_id: 2000001, rsvp_type: 'NO_RESPONSE' }],
      }));
    }
  });

  it('addGuest: no event_ids → no invitations, no address keys', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, { first_name: 'Pat', last_name: 'Morgan' });

    const [guest] = (reqSpy.mock.calls[0][2] as AddBody).guests;
    expect(guest.event_invitations).toEqual([]);
    expect(guest).not.toHaveProperty('address1');
    expect(guest).not.toHaveProperty('country_code');
  });

  it('addGuest: plus-one takes the primary surname unless given one', async () => {
    reqSpy
      .mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never)
      .mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, { first_name: 'Pat', last_name: 'Morgan', plus_one_first_name: 'Sam' });
    await addGuest(client, { first_name: 'Pat', last_name: 'Morgan', plus_one_first_name: 'Sam', plus_one_last_name: 'Lee' });

    expect((reqSpy.mock.calls[0][2] as AddBody).guests[1].family_name).toBe('Morgan');
    expect((reqSpy.mock.calls[1][2] as AddBody).guests[1].family_name).toBe('Lee');
  });

  it('addGuest: defaults affiliation to PRIMARY_FRIEND and tier to A', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    await addGuest(client, { first_name: 'Pat', last_name: 'Morgan' });

    const body = reqSpy.mock.calls[0][2] as AddBody;
    expect(body.guest_group_affiliation).toBe('PRIMARY_FRIEND');
    expect(body.guest_group_tier).toBe('A');
  });

  it('addGuest: returns the created group', async () => {
    reqSpy.mockResolvedValueOnce(structuredClone(CREATED_GROUP) as never);

    const result = await addGuest(client, FULL_ARGS);

    expect(JSON.parse(result.content[0].text)).toEqual(CREATED_GROUP.data);
  });

  it('addGuest: a 2xx without a created guest_group_id fails loudly with the body', async () => {
    const errorEnvelope = { code: 500, status: 'error', message: 'Internal Server Error', id: 'ABC123' };
    reqSpy.mockResolvedValueOnce(errorEnvelope as never);

    await expect(addGuest(client, FULL_ARGS)).rejects.toThrow(/did not create.*Internal Server Error.*ABC123/s);
  });

  it('addGuest: an empty 2xx body fails loudly', async () => {
    reqSpy.mockResolvedValueOnce(null as never);

    await expect(addGuest(client, FULL_ARGS)).rejects.toThrow(/did not create/);
  });

  it('updateGuestAddress: loads directory, merges fields, PUTs bulk/directory', async () => {
    reqSpy
      .mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateGuestAddress(client, { guest_group_id: 3000001, city: 'Evanston' });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      '/v3/guestlists/groups/wedding-accounts/1000001/bulk/directory',
      expect.objectContaining({
        updated_guest_groups: [
          expect.objectContaining({
            guest_group_id: 3000001,
            guests: [expect.objectContaining({
              city: 'Evanston',
              address1: '3839 N Alta Vista Terrace',
            })],
          }),
        ],
      })
    );
  });

  it('updateGuestAddress: preserves existing event_invitations (no wipe)', async () => {
    reqSpy
      .mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateGuestAddress(client, { guest_group_id: 3000001, city: 'Evanston' });

    const body = reqSpy.mock.calls[1][2] as {
      updated_guest_groups: Array<{ guests: Array<{ event_invitations: Array<{ event_id: number }> }> }>;
    };
    const invitations = body.updated_guest_groups[0].guests[0].event_invitations;
    expect(invitations).toContainEqual(expect.objectContaining({ id: 111, event_id: 2000002 }));
  });

  it('updateGuestAddress: throws when group not found', async () => {
    const empty = { data: { num_invited_guests: 0, num_guests: 0, num_addresses_missing: 0, guest_groups: [] } };
    reqSpy.mockResolvedValueOnce(empty as never);

    await expect(updateGuestAddress(client, { guest_group_id: 999 })).rejects.toThrow(
      'Guest group with ID 999 not found'
    );
  });

  it('removeGuest: PUTs to delete endpoint with guest_group_ids', async () => {
    // Each confirm phase reads the household it is about to delete; phase 2 then PUTs.
    reqSpy.mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never);
    reqSpy.mockResolvedValueOnce(structuredClone(MOCK_DIRECTORY) as never);
    reqSpy.mockResolvedValueOnce({ data: {} } as never);

    const result = await confirmed((ctx, confirmToken) =>
      removeGuest(client, { guest_group_id: 3000001, confirmToken }, ctx)
    );

    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/guestlists/groups/wedding-accounts/1000001/delete',
      { wedding_account_id: 1000001, guest_group_ids: [3000001] }
    );
    expect(result.content[0].text).toContain('3000001');
  });
});
