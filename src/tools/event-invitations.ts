import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';
import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';
import {
  CONFIRM_NOTE,
  confirmTokenParam,
  confirmWrite,
  guestName,
  householdLabel,
  type GatedResult,
  type ServerContext,
} from './_confirm.js';

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

async function fetchDirectory(client: ZolaClient, acct: number): Promise<DirGroup[]> {
  const resp = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${acct}`,
    { sort_by_name_asc: true }
  );
  return resp.data.guest_groups;
}

async function fetchEvents(client: ZolaClient, acct: number): Promise<WeddingEventLite[]> {
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

async function writeGroups(client: ZolaClient, acct: number, groups: unknown[]): Promise<void> {
  await client.requestMobile(
    'PUT',
    `/v3/guestlists/groups/wedding-accounts/${acct}/bulk/directory`,
    { updated_guest_groups: groups }
  );
}

async function requireEvent(client: ZolaClient, acct: number, eventId: number): Promise<WeddingEventLite> {
  const events = await fetchEvents(client, acct);
  const event = events.find((e) => e.event_entity_id === eventId);
  if (!event) throw new Error(`Event with ID ${eventId} not found`);
  return event;
}

/** A guest's current answer for one event, for the uninvite preview. */
function rsvpFor(guest: DirGuest, eventId: number): string {
  return (guest.event_invitations ?? []).find((e) => e.event_id === eventId)?.rsvp_type ?? 'not invited';
}

const BULK_DIRECTORY = (acct: number) => `/v3/guestlists/groups/wedding-accounts/${acct}/bulk/directory`;

// ─── Tool: set_event_guests (bulk) ──────────────────────────────────────────────

export async function setEventGuests(client: ZolaClient, args: {
  event_id: number;
  guest_groups: Array<{ guest_group_id: number; invited: boolean }>;
  confirmToken?: string;
}, ctx: ServerContext): Promise<GatedResult> {
  const { weddingAccountId: acct } = await client.getContext();
  const event = await requireEvent(client, acct, args.event_id);

  const byId = new Map(
    (await fetchDirectory(client, acct)).map((group) => [group.guest_group_id, group])
  );

  const updatedGroups: unknown[] = [];
  const affected: DirGroup[] = [];
  const summary: Array<{ guest_group_id: number; invited: boolean; guests_changed: number }> = [];
  const uninviting: Array<{ guest_group_id: number; household: string; guests: Array<{ name: string; rsvp: string }> }> = [];
  const inviting: Array<{ guest_group_id: number; household: string }> = [];

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
    affected.push(group);
    summary.push({ guest_group_id: req.guest_group_id, invited: req.invited, guests_changed: changed });
    const household = householdLabel(group);
    if (req.invited) {
      inviting.push({ guest_group_id: group.guest_group_id, household });
    } else {
      uninviting.push({
        guest_group_id: group.guest_group_id,
        household,
        guests: group.guests.map((g) => ({ name: guestName(g), rsvp: rsvpFor(g, args.event_id) })),
      });
    }
  }

  const body = { updated_guest_groups: updatedGroups };
  // Inviting is additive and reversible; removing an invitation discards the
  // guest's RSVP and meal choice for good, so only a call that uninvites
  // anyone is gated.
  if (uninviting.length > 0) {
    const gate = await confirmWrite(ctx, {
      tool: 'set_event_guests',
      action: 'zola.event.set_guests',
      label: `Uninvite ${uninviting.length} household${uninviting.length === 1 ? '' : 's'} from "${event.name}"` +
        (inviting.length > 0 ? ` and invite ${inviting.length}` : ''),
      method: 'PUT',
      path: BULK_DIRECTORY(acct),
      target: String(args.event_id),
      current: affected,
      body,
      showBody: false,
      about: {
        event: event.name,
        uninviting,
        ...(inviting.length > 0 ? { inviting } : {}),
        also_discarded: 'each uninvited guest’s RSVP and meal choice for this event; re-inviting does not restore them',
      },
      confirmToken: args.confirmToken,
    });
    if (gate) return gate;
  }

  await writeGroups(client, acct, updatedGroups);
  return jsonResult({ event_id: args.event_id, groups: summary });
}

// ─── Tools: invite_guest_to_event / remove_event_invitation (single) ─────────────

async function mutateOne(client: ZolaClient, opts: {
  event_id: number;
  invited: boolean;
  guest_group_id?: number;
  guest_id?: number;
  confirmToken?: string;
}, ctx?: ServerContext): Promise<GatedResult> {
  const hasGroup = opts.guest_group_id !== undefined;
  const hasGuest = opts.guest_id !== undefined;
  if (hasGroup === hasGuest) {
    throw new Error('Provide exactly one of guest_group_id or guest_id');
  }

  const { weddingAccountId: acct } = await client.getContext();
  const event = await requireEvent(client, acct, opts.event_id);
  const groups = await fetchDirectory(client, acct);

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

  const body = { updated_guest_groups: [buildWriteGroup(target, newGuests, acct)] };
  if (!opts.invited) {
    if (!ctx) throw new Error('remove_event_invitation requires the tool call context');
    const affectedGuests = target.guests.filter(appliesTo);
    const who = hasGroup
      ? `household "${householdLabel(target)}"`
      : `${guestName(affectedGuests[0] ?? {}) || 'guest'} (household "${householdLabel(target)}")`;
    const gate = await confirmWrite(ctx, {
      tool: 'remove_event_invitation',
      action: 'zola.event.uninvite',
      label: `Uninvite ${who} from "${event.name}"`,
      method: 'PUT',
      path: BULK_DIRECTORY(acct),
      target: `${opts.event_id}:${hasGroup ? `group-${opts.guest_group_id}` : `guest-${opts.guest_id}`}`,
      current: target,
      body,
      showBody: false,
      about: {
        event: event.name,
        household: householdLabel(target),
        guests: affectedGuests.map((g) => ({ name: guestName(g), rsvp: rsvpFor(g, opts.event_id) })),
        also_discarded: 'each guest’s RSVP and meal choice for this event; re-inviting does not restore them',
      },
      confirmToken: opts.confirmToken,
    });
    if (gate) return gate;
  }

  await writeGroups(client, acct, body.updated_guest_groups);
  return jsonResult({
    event_id: opts.event_id,
    invited: opts.invited,
    guest_group_id: target.guest_group_id,
    guests_changed: changed,
  });
}

export async function inviteGuestToEvent(client: ZolaClient, args: {
  event_id: number;
  guest_group_id?: number;
  guest_id?: number;
}): Promise<GatedResult> {
  // Inviting is additive, so mutateOne never gates it; the type is shared.
  return mutateOne(client, { ...args, invited: true });
}

export async function removeEventInvitation(client: ZolaClient, args: {
  event_id: number;
  guest_group_id?: number;
  guest_id?: number;
  confirmToken?: string;
}, ctx: ServerContext): Promise<GatedResult> {
  return mutateOne(client, { ...args, invited: false }, ctx);
}

// ─── MCP registration ────────────────────────────────────────────────────────

export function registerEventInvitationTools(server: McpServer, client: ZolaClient): void {
  server.registerTool(
    'set_event_guests',
    {
      description:
        'Set which guest groups are invited to an event (bulk). For each group, invited:true ensures every guest in the group is invited to the event; invited:false removes the invitation — and with it any RSVP the guest recorded for this event (response, meal choice), which cannot be restored. Other events’ invitations are preserved. Idempotent. Use this to assign guests to events in bulk (e.g. by tier/affiliation/location). ' +
        'A call that uninvites anyone asks the user to confirm first (a confirmation prompt where the client supports one; otherwise the first call returns a preview and a confirmToken, and only a repeat call with that token proceeds — see MCP_CONFIRM_MODE). A call that only invites runs immediately.',
      inputSchema: z.object({
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_groups: z
          .array(
            z.object({
              guest_group_id: z.number().describe('Guest group ID from list_guests'),
              invited: z.boolean().describe('true = invite the whole group; false = uninvite'),
            })
          )
          .describe('Guest groups to set for this event. Only the listed groups are affected.'),
        confirmToken: confirmTokenParam,
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (args, ctx) => setEventGuests(client, args, ctx)
  );

  server.registerTool(
    'invite_guest_to_event',
    {
      description:
        'Invite a single guest or guest group to an event (additive — does not affect other events). Pass exactly one of guest_group_id (invites all guests in the group) or guest_id (invites just that guest). Idempotent.',
      inputSchema: z.object({
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_group_id: z.number().optional().describe('Guest group ID — invites every guest in the group'),
        guest_id: z.number().optional().describe('Single guest ID — invites just that guest'),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    (args) => inviteGuestToEvent(client, args)
  );

  server.registerTool(
    'remove_event_invitation',
    {
      description:
        `Remove an event invitation for a single guest or guest group. Pass exactly one of guest_group_id (removes for all guests in the group) or guest_id (removes for just that guest). Removing an invitation discards the guest’s recorded RSVP for this event (response, meal choice); re-inviting does not restore it. Other events’ invitations are preserved. Idempotent. ${CONFIRM_NOTE}`,
      inputSchema: z.object({
        event_id: z.number().describe('Event entity ID from list_events (event_entity_id)'),
        guest_group_id: z.number().optional().describe('Guest group ID — removes for every guest in the group'),
        guest_id: z.number().optional().describe('Single guest ID — removes for just that guest'),
        confirmToken: confirmTokenParam,
      }),
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    (args, ctx) => removeEventInvitation(client, args, ctx)
  );
}
