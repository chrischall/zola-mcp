import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listGuests, addGuest, updateGuestAddress, removeGuest } from '../src/tools/guests.js';

const MOCK_GUEST_ENTRY = {
  guest: {
    guest_id: 280379459,
    uuid: 'guest-uuid-1',
    first_name: 'Jennifer',
    middle_name: null,
    family_name: 'Acerra',
    relationship_type: 'PRIMARY',
    email_address: null,
    mobile_phone: null,
    address1: '3839 N Alta Vista Terrace',
    address2: null,
    city: 'Chicago',
    state_province: 'IL',
    postal_code: '60613',
    country_code: 'US',
    affiliation: 'PRIMARY_FRIEND',
    tier: 'A',
    rsvp: 'NO_RESPONSE',
  },
  seating_chart_seat: null,
};

const MOCK_DIRECTORY = {
  data: {
    num_invited_guests: 193,
    num_guests: 193,
    num_addresses_missing: 0,
    guest_groups: [
      {
        guest_group_id: 152644475,
        guest_group_uuid: 'group-uuid-1',
        wedding_account_id: 4664323,
        envelope_recipient: 'Jennifer Acerra and Jason Shuba',
        addressing_style: 'SEMI_FORMAL',
        guest_group_affiliation: 'PRIMARY_FRIEND',
        guest_group_tier: 'A',
        invited: true,
        invitation_sent: false,
        save_the_date_sent: false,
        guests: [MOCK_GUEST_ENTRY],
      },
    ],
  },
};

describe('guest tools (mobile API)', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    vi.spyOn(client, 'getContext').mockResolvedValue({
      weddingAccountId: 4664323,
      registryId: 'reg-1',
      userId: 'user-1',
      weddingDate: '2026-10-17',
      weddingSlug: 'chrismer26',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listGuests: POSTs to directory and returns stats + groups', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_DIRECTORY as never);

    const result = await listGuests();

    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/guestlists/directory/wedding-accounts/4664323',
      { sort_by_name_asc: true }
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.stats.num_guests).toBe(193);
    expect(parsed.guest_groups).toHaveLength(1);
    expect(parsed.guest_groups[0].guests[0].guest.first_name).toBe('Jennifer');
  });

  it('addGuest: POSTs to groups with correct body', async () => {
    reqSpy.mockResolvedValueOnce({ data: { guest_group_id: 999 } } as never);

    await addGuest({ first_name: 'Test', last_name: 'Guest', affiliation: 'PRIMARY_FRIEND' });

    expect(reqSpy).toHaveBeenCalledWith(
      'POST',
      '/v3/guestlists/groups',
      expect.objectContaining({
        wedding_account_id: 4664323,
        invited: true,
        guests: [expect.objectContaining({
          first_name: 'Test',
          family_name: 'Guest',
          relationship_type: 'PRIMARY',
        })],
      })
    );
  });

  it('addGuest: includes plus-one with PARTNER relationship', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);

    await addGuest({
      first_name: 'Jennifer',
      last_name: 'Acerra',
      plus_one_first_name: 'Jason',
      plus_one_last_name: 'Shuba',
    });

    const body = reqSpy.mock.calls[0][2] as { guests: Record<string, unknown>[] };
    expect(body.guests).toHaveLength(2);
    expect(body.guests[1]).toEqual(expect.objectContaining({
      first_name: 'Jason',
      family_name: 'Shuba',
      relationship_type: 'PARTNER',
    }));
  });

  it('updateGuestAddress: loads directory, merges fields, PUTs suite', async () => {
    reqSpy
      .mockResolvedValueOnce(MOCK_DIRECTORY as never)
      .mockResolvedValueOnce({ data: {} } as never);

    await updateGuestAddress({ guest_group_id: 152644475, city: 'Evanston' });

    expect(reqSpy).toHaveBeenCalledTimes(2);
    expect(reqSpy).toHaveBeenNthCalledWith(
      2,
      'PUT',
      '/v3/guestlists/groups/wedding-accounts/id/4664323/suite',
      expect.objectContaining({
        guest_group_request: expect.objectContaining({
          guest_group_id: 152644475,
          guests: [expect.objectContaining({
            city: 'Evanston',
            address1: '3839 N Alta Vista Terrace',
          })],
        }),
      })
    );
  });

  it('updateGuestAddress: throws when group not found', async () => {
    const empty = { data: { num_invited_guests: 0, num_guests: 0, num_addresses_missing: 0, guest_groups: [] } };
    reqSpy.mockResolvedValueOnce(empty as never);

    await expect(updateGuestAddress({ guest_group_id: 999 })).rejects.toThrow(
      'Guest group with ID 999 not found'
    );
  });

  it('removeGuest: PUTs to delete endpoint with guest_group_ids', async () => {
    reqSpy.mockResolvedValueOnce({ data: {} } as never);

    const result = await removeGuest({ guest_group_id: 152644475 });

    expect(reqSpy).toHaveBeenCalledWith(
      'PUT',
      '/v3/guestlists/groups/wedding-accounts/4664323/delete',
      { wedding_account_id: 4664323, guest_group_ids: [152644475] }
    );
    expect(result.content[0].text).toContain('152644475');
  });
});
