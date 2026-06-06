import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';

// ─── Shapes (FLAT guest shape, as returned by the mobile-api directory) ────────
//
// Event invitations are tracked per *guest* inside the guest-group directory.
// Writes go through the same `bulk/directory` endpoint the iOS app uses
// (verified by proxy capture, May 2026): a full read-modify-write of each
// affected group. See docs/zola-api-quirks.md §5.

interface EventInvitation {
  id: number | null; // server-assigned; null when creating a new invitation
  event_id: number; // == event_entity_id from list_events
  meal_option_id?: number | null;
  rsvp_type: string; // stays "NO_RESPONSE" — inviting is not responding
  rsvp_at?: string | null;
}

interface DirGuest {
  guest_id: number;
  first_name: string;
  family_name: string;
  relationship_type: string;
  rsvp?: string;
  event_invitations: EventInvitation[];
  tags?: unknown[];
  [key: string]: unknown;
}

interface DirGroup {
  guest_group_id: number;
  guest_group_uuid: string;
  wedding_account_id: number;
  envelope_recipient: string | null;
  addressing_style: string;
  guest_group_affiliation: string;
  guest_group_tier: string;
  invited: boolean;
  invitation_sent: boolean;
  save_the_date_sent: boolean;
  rsvp_question_answers?: unknown[];
  gift_count?: number;
  gift_group?: unknown;
  thank_you_note_status?: string;
  guests: DirGuest[];
  [key: string]: unknown;
}

interface DirectoryResponse {
  guest_groups: DirGroup[];
}

interface WeddingEventLite {
  event_entity_id: number;
  name: string;
}
interface EventGroupLite {
  events: WeddingEventLite[];
}

// ─── Live reads ────────────────────────────────────────────────────────────────

async function fetchDirectory(acct: number): Promise<DirGroup[]> {
  const resp = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${acct}`,
    { sort_by_name_asc: true }
  );
  return resp.data.guest_groups;
}

async function fetchEvents(acct: number): Promise<WeddingEventLite[]> {
  const resp = await client.requestMobile<MobileEnvelope<EventGroupLite[]>>(
    'GET',
    `/v3/websites/events/wedding-accounts/${acct}/groups`
  );
  return resp.data.flatMap((group) => group.events);
}

// ─── Read-modify-write helpers ──────────────────────────────────────────────────

/**
 * Compute the new `event_invitations` array for one guest.
 * Add → append `{ event_id, id: null, rsvp_type: "NO_RESPONSE" }` (idempotent).
 * Remove → drop every element matching the event. Existing invitations to other
 * events are preserved verbatim (id + rsvp intact) — this is what prevents the
 * partial-update wipe.
 */
function computeNext(
  existing: EventInvitation[],
  eventId: number,
  invited: boolean
): EventInvitation[] {
  const current = existing ?? [];
  if (invited) {
    if (current.some((e) => e.event_id === eventId)) return current;
    return [...current, { event_id: eventId, id: null, rsvp_type: 'NO_RESPONSE' }];
  }
  return current.filter((e) => e.event_id !== eventId);
}

/** Send each guest back as received (read-modify-write), with the new invitations. */
function toWriteGuest(guest: DirGuest, invitations: EventInvitation[]): DirGuest {
  return { ...guest, event_invitations: invitations, tags: guest.tags ?? [] };
}

/**
 * Build the per-group payload the `bulk/directory` endpoint expects.
 * Spread the group as read (faithful round-trip) and supply safe defaults for
 * the few fields the endpoint requires non-null.
 */
function buildWriteGroup(group: DirGroup, guests: DirGuest[], acct: number) {
  return {
    ...group,
    wedding_account_id: group.wedding_account_id ?? acct,
    envelope_recipient: group.envelope_recipient ?? '',
    gift_group: group.gift_group ?? {
      gift_count: 0,
      modules: [],
      gift_groups: [],
      guest_group_uuid: '',
    },
    thank_you_note_status: group.thank_you_note_status ?? 'NOT_STARTED',
    rsvp_question_answers: group.rsvp_question_answers ?? [],
    gift_count: group.gift_count ?? 0,
    guests,
  };
}

async function writeGroups(acct: number, groups: unknown[]): Promise<void> {
  await client.requestMobile(
    'PUT',
    `/v3/guestlists/groups/wedding-accounts/${acct}/bulk/directory`,
    { updated_guest_groups: groups }
  );
}

async function requireEvent(acct: number, eventId: number): Promise<void> {
  const events = await fetchEvents(acct);
  if (!events.some((e) => e.event_entity_id === eventId)) {
    throw new Error(`Event with ID ${eventId} not found`);
  }
}

// ─── Tool: set_event_guests (bulk) ──────────────────────────────────────────────

export async function setEventGuests(args: {
  event_id: number;
  guest_groups: Array<{ guest_group_id: number; invited: boolean }>;
}): Promise<ToolResult> {
  const { weddingAccountId: acct } = await client.getContext();
  await requireEvent(acct, args.event_id);

  const byId = new Map(
    (await fetchDirectory(acct)).map((group) => [group.guest_group_id, group])
  );

  const updatedGroups: unknown[] = [];
  const summary: Array<{ guest_group_id: number; invited: boolean; guests_changed: number }> = [];

  for (const req of args.guest_groups) {
    const group = byId.get(req.guest_group_id);
    if (!group) throw new Error(`Guest group with ID ${req.guest_group_id} not found`);

    let changed = 0;
    const newGuests = group.guests.map((guest) => {
      const before = (guest.event_invitations ?? []).length;
      const next = computeNext(guest.event_invitations ?? [], args.event_id, req.invited);
      if (next.length !== before) changed++;
      return toWriteGuest(guest, next);
    });

    updatedGroups.push(buildWriteGroup(group, newGuests, acct));
    summary.push({ guest_group_id: req.guest_group_id, invited: req.invited, guests_changed: changed });
  }

  await writeGroups(acct, updatedGroups);
  return jsonResult({ event_id: args.event_id, groups: summary });
}

// ─── Tools: invite_guest_to_event / remove_event_invitation (single) ─────────────

async function mutateOne(opts: {
  event_id: number;
  invited: boolean;
  guest_group_id?: number;
  guest_id?: number;
}): Promise<ToolResult> {
  const hasGroup = opts.guest_group_id !== undefined;
  const hasGuest = opts.guest_id !== undefined;
  if (hasGroup === hasGuest) {
    throw new Error('Provide exactly one of guest_group_id or guest_id');
  }

  const { weddingAccountId: acct } = await client.getContext();
  await requireEvent(acct, opts.event_id);
  const groups = await fetchDirectory(acct);

  let target: DirGroup | undefined;
  let appliesTo: (guest: DirGuest) => boolean;
  if (hasGroup) {
    target = groups.find((g) => g.guest_group_id === opts.guest_group_id);
    if (!target) throw new Error(`Guest group with ID ${opts.guest_group_id} not found`);
    appliesTo = () => true;
  } else {
    target = groups.find((g) => g.guests.some((gu) => gu.guest_id === opts.guest_id));
    if (!target) throw new Error(`Guest with ID ${opts.guest_id} not found`);
    appliesTo = (guest) => guest.guest_id === opts.guest_id;
  }

  let changed = 0;
  const newGuests = target.guests.map((guest) => {
    const existing = guest.event_invitations ?? [];
    if (!appliesTo(guest)) return toWriteGuest(guest, existing);
    const next = computeNext(existing, opts.event_id, opts.invited);
    if (next.length !== existing.length) changed++;
    return toWriteGuest(guest, next);
  });

  await writeGroups(acct, [buildWriteGroup(target, newGuests, acct)]);
  return jsonResult({
    event_id: opts.event_id,
    invited: opts.invited,
    guest_group_id: target.guest_group_id,
    guests_changed: changed,
  });
}

export async function inviteGuestToEvent(args: {
  event_id: number;
  guest_group_id?: number;
  guest_id?: number;
}): Promise<ToolResult> {
  return mutateOne({ ...args, invited: true });
}

export async function removeEventInvitation(args: {
  event_id: number;
  guest_group_id?: number;
  guest_id?: number;
}): Promise<ToolResult> {
  return mutateOne({ ...args, invited: false });
}

// ─── MCP registration ────────────────────────────────────────────────────────

export function registerEventInvitationTools(server: McpServer): void {
  server.registerTool(
    'set_event_guests',
    {
      description:
        'Set which guest groups are invited to an event (bulk). For each group, invited:true ensures every guest in the group is invited to the event; invited:false removes the invitation. Other events’ invitations are preserved. Idempotent. Use this to assign guests to events in bulk (e.g. by tier/affiliation/location).',
      inputSchema: {
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_groups: z
          .array(
            z.object({
              guest_group_id: z.number().describe('Guest group ID from list_guests'),
              invited: z.boolean().describe('true = invite the whole group; false = uninvite'),
            })
          )
          .describe('Guest groups to set for this event. Only the listed groups are affected.'),
      },
      annotations: { destructiveHint: false },
    },
    setEventGuests
  );

  server.registerTool(
    'invite_guest_to_event',
    {
      description:
        'Invite a single guest or guest group to an event (additive — does not affect other events). Pass exactly one of guest_group_id (invites all guests in the group) or guest_id (invites just that guest). Idempotent.',
      inputSchema: {
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_group_id: z.number().optional().describe('Guest group ID — invites every guest in the group'),
        guest_id: z.number().optional().describe('Single guest ID — invites just that guest'),
      },
      annotations: { destructiveHint: false },
    },
    inviteGuestToEvent
  );

  server.registerTool(
    'remove_event_invitation',
    {
      description:
        'Remove an event invitation for a single guest or guest group. Pass exactly one of guest_group_id (removes for all guests in the group) or guest_id (removes for just that guest). Other events’ invitations are preserved. Idempotent.',
      inputSchema: {
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_group_id: z.number().optional().describe('Guest group ID — removes for every guest in the group'),
        guest_id: z.number().optional().describe('Single guest ID — removes for just that guest'),
      },
      annotations: { destructiveHint: false },
    },
    removeEventInvitation
  );
}
