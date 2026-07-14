import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import {
  setEventGuests,
  inviteGuestToEvent,
  removeEventInvitation,
} from '../src/tools/event-invitations.js';
import { setupClientMocks } from './_fixtures.js';

// ─── Fixtures (FLAT guest shape — matches the live mobile-api directory) ───────

interface Inv {
  id: number | null;
  event_id: number;
  meal_option_id?: number | null;
  rsvp_type: string;
  rsvp_at?: string | null;
}

function guest(guestId: number, firstName: string, relationship: string, invitations: Inv[]) {
  return {
    guest_id: guestId,
    relationship_type: relationship,
    prefix: null,
    first_name: firstName,
    middle_name: null,
    family_name: 'Acerra',
    suffix: null,
    email_address: '',
    home_phone: '',
    mobile_phone: '',
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
    event_invitations: invitations,
    tags: [],
  };
}

function group(
  groupId: number,
  recipient: string,
  guests: ReturnType<typeof guest>[]
) {
  return {
    guest_group_id: groupId,
    guest_group_uuid: `uuid-${groupId}`,
    wedding_account_id: 4664323,
    envelope_recipient: recipient,
    envelope_recipient_override: null,
    addressing_style: 'SEMI_FORMAL',
    guest_group_affiliation: 'PRIMARY_FRIEND',
    guest_group_tier: 'A',
    invited: true,
    invitation_sent: false,
    save_the_date_sent: false,
    collect_addresses_message_sent_at: null,
    rsvp_question_answers: [],
    gift_count: 0,
    gift_group: null,
    thank_you_note_status: 'NOT_STARTED',
    thank_you_note: null,
    gift_groups: [],
    guests,
  };
}

const CEREMONY = 5108473;
const RECEPTION = 5108495;

function directory(groups: ReturnType<typeof group>[]) {
  return {
    data: {
      num_invited_guests: groups.length,
      num_guests: groups.length,
      num_addresses_missing: 0,
      guest_groups: groups,
    },
  };
}

const EVENTS = {
  data: [
    {
      start_date: '2026-10-17',
      events: [
        { event_entity_id: CEREMONY, uuid: 'c-uuid', name: 'Ceremony', type: 'CEREMONY' },
        { event_entity_id: RECEPTION, uuid: 'r-uuid', name: 'Reception', type: 'RECEPTION' },
      ],
    },
  ],
};

/**
 * Smart mock: routes by method+path so tests don't depend on call order.
 * `dirGroups` is a factory so each call returns a fresh (cloned) directory —
 * guards against cross-test mutation.
 */
function wire(
  reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>,
  dirGroups: () => ReturnType<typeof group>[]
) {
  reqSpy.mockImplementation((async (method: string, path: string) => {
    if (method === 'GET' && path.includes('/websites/events/')) return EVENTS;
    if (method === 'POST' && path.includes('/guestlists/directory/')) {
      return structuredClone(directory(dirGroups()));
    }
    if (method === 'PUT' && path.includes('/bulk/directory')) return { data: {} };
    throw new Error(`unexpected request ${method} ${path}`);
  }) as never);
}

/** Find the single bulk/directory PUT body the handler sent. */
function putBody(reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>) {
  const call = reqSpy.mock.calls.find(
    (c) => c[0] === 'PUT' && String(c[1]).includes('/bulk/directory')
  );
  if (!call) throw new Error('no bulk/directory PUT was made');
  return { path: call[1] as string, body: call[2] as { updated_guest_groups: any[] } };
}

describe('event-invitation tools (mobile API)', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = setupClientMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── set_event_guests ───────────────────────────────────────────────────────

  it('setEventGuests: invites a group — appends invitation to every guest via bulk/directory', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', []),
        guest(280379460, 'Jason', 'PARTNER', []),
      ]),
    ]);

    await setEventGuests(client, {
      event_id: CEREMONY,
      guest_groups: [{ guest_group_id: 152644475, invited: true }],
    });

    const { path, body } = putBody(reqSpy);
    expect(path).toBe('/v3/guestlists/groups/wedding-accounts/4664323/bulk/directory');
    expect(body.updated_guest_groups).toHaveLength(1);
    const g = body.updated_guest_groups[0];
    expect(g.guest_group_id).toBe(152644475);
    expect(g.guests).toHaveLength(2);
    for (const gu of g.guests) {
      const inv = gu.event_invitations.filter((e: Inv) => e.event_id === CEREMONY);
      expect(inv).toHaveLength(1);
      expect(inv[0]).toMatchObject({ event_id: CEREMONY, id: null, rsvp_type: 'NO_RESPONSE' });
    }
  });

  it('setEventGuests: uninviting removes that event but preserves others (no wipe)', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', [
          { id: 111, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' },
          { id: 222, event_id: RECEPTION, rsvp_type: 'NO_RESPONSE' },
        ]),
      ]),
    ]);

    await setEventGuests(client, {
      event_id: CEREMONY,
      guest_groups: [{ guest_group_id: 152644475, invited: false }],
    });

    const { body } = putBody(reqSpy);
    const inv = body.updated_guest_groups[0].guests[0].event_invitations;
    expect(inv.some((e: Inv) => e.event_id === CEREMONY)).toBe(false);
    // The other invitation survives, with its server id intact.
    expect(inv).toContainEqual(
      expect.objectContaining({ id: 222, event_id: RECEPTION })
    );
  });

  it('setEventGuests: idempotent — inviting an already-invited guest does not duplicate', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', [
          { id: 111, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' },
        ]),
      ]),
    ]);

    await setEventGuests(client, {
      event_id: CEREMONY,
      guest_groups: [{ guest_group_id: 152644475, invited: true }],
    });

    const { body } = putBody(reqSpy);
    const inv = body.updated_guest_groups[0].guests[0].event_invitations;
    expect(inv.filter((e: Inv) => e.event_id === CEREMONY)).toHaveLength(1);
    // existing invitation kept with its id (not replaced by a null-id duplicate)
    expect(inv[0].id).toBe(111);
  });

  it('setEventGuests: does not touch the guest rsvp field', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', []),
      ]),
    ]);

    await setEventGuests(client, {
      event_id: CEREMONY,
      guest_groups: [{ guest_group_id: 152644475, invited: true }],
    });

    const { body } = putBody(reqSpy);
    expect(body.updated_guest_groups[0].guests[0].rsvp).toBe('NO_RESPONSE');
  });

  it('setEventGuests: batches multiple groups into a single PUT', async () => {
    wire(reqSpy, () => [
      group(1, 'Group One', [guest(10, 'A', 'PRIMARY', [])]),
      group(2, 'Group Two', [guest(20, 'B', 'PRIMARY', [])]),
    ]);

    await setEventGuests(client, {
      event_id: CEREMONY,
      guest_groups: [
        { guest_group_id: 1, invited: true },
        { guest_group_id: 2, invited: false },
      ],
    });

    const puts = reqSpy.mock.calls.filter(
      (c) => c[0] === 'PUT' && String(c[1]).includes('/bulk/directory')
    );
    expect(puts).toHaveLength(1);
    const { body } = putBody(reqSpy);
    expect(body.updated_guest_groups).toHaveLength(2);
  });

  it('setEventGuests: rejects an unknown event_id', async () => {
    wire(reqSpy, () => [group(152644475, 'X', [guest(1, 'A', 'PRIMARY', [])])]);
    await expect(
      setEventGuests(client, { event_id: 99999, guest_groups: [{ guest_group_id: 152644475, invited: true }] })
    ).rejects.toThrow(/99999/);
  });

  it('setEventGuests: rejects an unknown guest_group_id', async () => {
    wire(reqSpy, () => [group(152644475, 'X', [guest(1, 'A', 'PRIMARY', [])])]);
    await expect(
      setEventGuests(client, { event_id: CEREMONY, guest_groups: [{ guest_group_id: 999, invited: true }] })
    ).rejects.toThrow(/999/);
  });

  // ─── invite_guest_to_event ────────────────────────────────────────────────────

  it('inviteGuestToEvent: by guest_id mutates only that guest', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', []),
        guest(280379460, 'Jason', 'PARTNER', []),
      ]),
    ]);

    await inviteGuestToEvent(client, { event_id: CEREMONY, guest_id: 280379459 });

    const { body } = putBody(reqSpy);
    const guests = body.updated_guest_groups[0].guests;
    const jennifer = guests.find((g: any) => g.guest_id === 280379459);
    const jason = guests.find((g: any) => g.guest_id === 280379460);
    expect(jennifer.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(true);
    expect(jason.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(false);
  });

  it('inviteGuestToEvent: by guest_group_id invites all guests in the group', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', []),
        guest(280379460, 'Jason', 'PARTNER', []),
      ]),
    ]);

    await inviteGuestToEvent(client, { event_id: CEREMONY, guest_group_id: 152644475 });

    const { body } = putBody(reqSpy);
    for (const gu of body.updated_guest_groups[0].guests) {
      expect(gu.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(true);
    }
  });

  it('inviteGuestToEvent: requires exactly one of guest_group_id / guest_id', async () => {
    wire(reqSpy, () => [group(1, 'X', [guest(10, 'A', 'PRIMARY', [])])]);
    await expect(inviteGuestToEvent(client, { event_id: CEREMONY })).rejects.toThrow();
    await expect(
      inviteGuestToEvent(client, { event_id: CEREMONY, guest_group_id: 1, guest_id: 10 })
    ).rejects.toThrow();
  });

  // ─── remove_event_invitation ──────────────────────────────────────────────────

  it('removeEventInvitation: by guest_group_id removes the event from every guest', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', [
          { id: 111, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' },
          { id: 112, event_id: RECEPTION, rsvp_type: 'NO_RESPONSE' },
        ]),
        guest(280379460, 'Jason', 'PARTNER', [
          { id: 113, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' },
        ]),
      ]),
    ]);

    await removeEventInvitation(client, { event_id: CEREMONY, guest_group_id: 152644475 });

    const { body } = putBody(reqSpy);
    for (const gu of body.updated_guest_groups[0].guests) {
      expect(gu.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(false);
    }
    // Reception invite on Jennifer survives.
    const jennifer = body.updated_guest_groups[0].guests.find((g: any) => g.guest_id === 280379459);
    expect(jennifer.event_invitations).toContainEqual(
      expect.objectContaining({ id: 112, event_id: RECEPTION })
    );
  });

  it('removeEventInvitation: by guest_id removes only that guest’s invitation', async () => {
    wire(reqSpy, () => [
      group(152644475, 'Jennifer Acerra and Jason Shuba', [
        guest(280379459, 'Jennifer', 'PRIMARY', [{ id: 111, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' }]),
        guest(280379460, 'Jason', 'PARTNER', [{ id: 113, event_id: CEREMONY, rsvp_type: 'NO_RESPONSE' }]),
      ]),
    ]);

    await removeEventInvitation(client, { event_id: CEREMONY, guest_id: 280379459 });

    const { body } = putBody(reqSpy);
    const guests = body.updated_guest_groups[0].guests;
    const jennifer = guests.find((g: any) => g.guest_id === 280379459);
    const jason = guests.find((g: any) => g.guest_id === 280379460);
    expect(jennifer.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(false);
    expect(jason.event_invitations.some((e: Inv) => e.event_id === CEREMONY)).toBe(true);
  });
});
