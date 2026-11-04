import { McpServer } from '@modelcontextprotocol/server';
import { resolveView, viewParam } from '@chrischall/mcp-utils';
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
import { familyMeta } from './hints.js';

// The live /v3/guestlists/directory response returns a FLAT guest shape:
// fields sit directly on each guest object (no `{ guest: {...} }` wrapper).
// See docs/zola-api-quirks.md §5.
interface DirectoryGuest {
  guest_id: number;
  first_name: string;
  family_name: string;
  relationship_type: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country_code: string | null;
  rsvp: string;
  event_invitations: unknown[];
  tags?: unknown[];
  [key: string]: unknown;
}

interface GuestGroup {
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
  guests: DirectoryGuest[];
  [key: string]: unknown;
}

interface DirectoryResponse {
  num_invited_guests: number;
  num_guests: number;
  num_addresses_missing: number;
  guest_groups: GuestGroup[];
}

/**
 * The rungs `list_guests` honours. This is the one read in the repo with a
 * `view` parameter, and it exists for privacy rather than size (CLAUDE.md,
 * "Response shape"): the directory is the whole third-party guest list, and
 * the default answer must not put every household's street address, email and
 * phone number into the transcript when the question was "who has not RSVP'd".
 */
const GUEST_VIEWS = ['compact', 'full'] as const;

const GUEST_VIEW_NOTE =
  'compact keeps ids, names, tier, invited/RSVP state, per-event invitations and whether an address is on file; ' +
  'it leaves out street addresses, emails and phone numbers. Ask for "full" only when you need contact details.';

/** A guest's directory record without its contact details. */
function compactGuest(guest: DirectoryGuest) {
  const invitations = Array.isArray(guest.event_invitations) ? guest.event_invitations : [];
  return {
    guest_id: guest.guest_id,
    first_name: guest.first_name,
    family_name: guest.family_name,
    relationship_type: guest.relationship_type,
    rsvp: guest.rsvp,
    has_address: Boolean(guest.address1 || guest.city || guest.postal_code),
    event_invitations: invitations.map((inv) => {
      const { event_id, rsvp_type } = (inv ?? {}) as { event_id?: unknown; rsvp_type?: unknown };
      return { event_id, rsvp_type };
    }),
  };
}

/** A household with its guests projected by {@link compactGuest}. */
function compactGroup(group: GuestGroup) {
  return {
    guest_group_id: group.guest_group_id,
    envelope_recipient: group.envelope_recipient,
    tier: group.guest_group_tier,
    affiliation: group.guest_group_affiliation,
    invited: group.invited,
    invitation_sent: group.invitation_sent,
    save_the_date_sent: group.save_the_date_sent,
    guests: group.guests.map(compactGuest),
  };
}

export async function listGuests(client: ZolaClient, args: { view?: string } = {}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${weddingAccountId}`,
    { sort_by_name_asc: true }
  );
  const { guest_groups, ...stats } = response.data;
  const rung = resolveView(args.view, GUEST_VIEWS);
  return jsonResult({ stats, guest_groups: rung === 'full' ? guest_groups : guest_groups.map(compactGroup) });
}

/**
 * Guest-group affiliations seen in the live directory's RELATIONSHIP facet
 * (Nov 2026). Relative to the account: `PRIMARY_*` is the side of whoever owns
 * the Zola account, `PARTNER_*` the other partner's. Advisory only — observed
 * on one account, not a published list — so the tool input stays a free string
 * and these are named in its description rather than enforced.
 */
export const KNOWN_AFFILIATIONS = [
  'PRIMARY_FRIEND',
  'PRIMARY_FAMILY',
  'PRIMARY_FAMILY_FRIEND',
  'PARTNER_FRIEND',
  'PARTNER_FAMILY',
  'PARTNER_FAMILY_FRIEND',
  'BOTH',
  'UNKNOWN',
] as const;

export interface AddGuestArgs {
  first_name: string;
  last_name: string;
  plus_one_first_name?: string;
  plus_one_last_name?: string;
  email?: string;
  phone?: string;
  affiliation?: string;
  tier?: string;
  event_ids?: number[];
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
}

/** Drop unset and blank values: the API rejects some of them as `""`. */
function present(fields: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value?.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

/**
 * Create a guest group via `POST /v3/guestlists/groups`.
 *
 * Every optional field is OMITTED when unset rather than sent as `""`. The
 * previous body sent `prefix: ""`, `middle_name: ""`, `suffix: ""` on every
 * guest and the API answered every call with a bare 400 "Bad Request"
 * (bisected live, Nov 2026 — dropping those three keys alone made the same body
 * succeed). Empty `email_address` / `mobile_phone` / `home_phone` are accepted,
 * but omitting them is just as valid, so nothing is sent that is not set.
 */
export async function addGuest(client: ZolaClient, args: AddGuestArgs): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const affiliation = args.affiliation?.trim().toUpperCase() || 'PRIMARY_FRIEND';
  const tier = args.tier ?? 'A';

  const address = present({
    address1: args.address1,
    address2: args.address2,
    city: args.city,
    state_province: args.state_province,
    postal_code: args.postal_code,
  });
  if (Object.keys(address).length > 0) address.country_code = args.country_code?.trim() || 'US';

  const shared = {
    source: 'IOS',
    affiliation,
    tier,
    ...address,
    event_invitations: [] as unknown[],
    tags: [] as unknown[],
  };
  const invitations = () =>
    (args.event_ids ?? []).map((event_id) => ({ id: null, event_id, rsvp_type: 'NO_RESPONSE' }));

  const guests: Record<string, unknown>[] = [
    {
      first_name: args.first_name.trim(),
      family_name: args.last_name.trim(),
      relationship_type: 'PRIMARY',
      ...present({ email_address: args.email, mobile_phone: args.phone }),
      ...shared,
      event_invitations: invitations(),
    },
  ];
  if (args.plus_one_first_name?.trim()) {
    guests.push({
      first_name: args.plus_one_first_name.trim(),
      family_name: args.plus_one_last_name?.trim() || args.last_name.trim(),
      relationship_type: 'PARTNER',
      ...shared,
      event_invitations: invitations(),
    });
  }

  const body = {
    wedding_account_id: weddingAccountId,
    guest_group_affiliation: affiliation,
    guest_group_tier: tier,
    invited: true,
    invitation_sent: false,
    save_the_date_sent: false,
    guests,
  };
  const result = await client.requestMobile<MobileEnvelope<GuestGroup> | null>('POST', '/v3/guestlists/groups', body);

  // A 2xx is not proof of creation: the endpoint has answered 200 with an error
  // envelope (`{"code":500,"status":"error",…}`) and created nothing. Only a
  // returned guest_group_id counts.
  const created = result?.data;
  if (!created || typeof created.guest_group_id !== 'number') {
    throw new Error(
      `Zola did not create the guest group (POST /v3/guestlists/groups returned no guest_group_id): ` +
        (result === null ? '<empty body>' : JSON.stringify(result).slice(0, 500))
    );
  }
  return jsonResult(created);
}

export async function updateGuestAddress(client: ZolaClient, args: {
  guest_group_id: number;
  address1?: string;
  address2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const dirResponse = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${weddingAccountId}`,
    { sort_by_name_asc: true }
  );
  const group = dirResponse.data.guest_groups.find(
    (g) => g.guest_group_id === args.guest_group_id
  );
  if (!group) {
    throw new Error(`Guest group with ID ${args.guest_group_id} not found`);
  }

  // Full read-modify-write through the verified bulk/directory endpoint
  // (docs/zola-api-quirks.md §5). Crucially, preserve each guest's existing
  // event_invitations — blanking them here would wipe the group's invitations.
  const updatedGuests = group.guests.map((guest) => ({
    ...guest,
    address1: args.address1 ?? guest.address1 ?? '',
    address2: args.address2 !== undefined ? args.address2 : guest.address2 ?? '',
    city: args.city ?? guest.city ?? '',
    state_province: args.state_province ?? guest.state_province ?? '',
    postal_code: args.postal_code ?? guest.postal_code ?? '',
    country_code: args.country_code ?? guest.country_code ?? 'US',
    event_invitations: guest.event_invitations ?? [],
    tags: guest.tags ?? [],
  }));

  const body = {
    updated_guest_groups: [
      {
        ...group,
        wedding_account_id: group.wedding_account_id ?? weddingAccountId,
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
        guests: updatedGuests,
      },
    ],
  };

  const result = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/guestlists/groups/wedding-accounts/${weddingAccountId}/bulk/directory`,
    body
  );
  return jsonResult(result.data);
}

export async function removeGuest(
  client: ZolaClient,
  args: { guest_group_id: number; confirmToken?: string },
  ctx: ServerContext
): Promise<GatedResult> {
  const { weddingAccountId } = await client.getContext();
  // Read the household first: the preview names who is about to be deleted,
  // and the token binds to the household as it was read, so a group edited in
  // the meantime is refused rather than deleted blind.
  const dirResponse = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${weddingAccountId}`,
    { sort_by_name_asc: true }
  );
  const group = dirResponse.data.guest_groups.find((g) => g.guest_group_id === args.guest_group_id);
  if (!group) {
    throw new Error(`Guest group with ID ${args.guest_group_id} not found`);
  }

  const path = `/v3/guestlists/groups/wedding-accounts/${weddingAccountId}/delete`;
  const body = { wedding_account_id: weddingAccountId, guest_group_ids: [args.guest_group_id] };
  const household = householdLabel(group);
  const gate = await confirmWrite(ctx, {
    tool: 'remove_guest',
    action: 'zola.guest.remove',
    label: `Delete guest household "${household}" (${group.guests.length} guest${group.guests.length === 1 ? '' : 's'})`,
    method: 'PUT',
    path,
    target: String(args.guest_group_id),
    current: group,
    body,
    about: {
      household,
      guests: group.guests.map((g) => ({ name: guestName(g), relationship_type: g.relationship_type, rsvp: g.rsvp })),
      invited: group.invited,
      also_deleted: 'every RSVP, event invitation and seat assignment for these guests; there is no trash to restore from',
    },
    args,
    confirmToken: args.confirmToken,
  });
  if (gate) return gate;

  await client.requestMobile('PUT', path, body);
  return {
    content: [{ type: 'text', text: `Deleted guest group ${args.guest_group_id} ("${household}")` }],
  };
}

export function registerGuestTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('list_guests', {
    description:
      'List all guest groups (households) with stats (total, invited, missing addresses). ' +
      'The default view carries names, ids, tier, invited/RSVP state and per-event invitations but no contact details; ' +
      'pass view:"full" for addresses, emails and phone numbers.',
    inputSchema: z.object({
      view: viewParam(GUEST_VIEWS, { note: GUEST_VIEW_NOTE }),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    _meta: familyMeta('lookup', { aliases: ['guest list', 'guests', 'households'] }),
  }, (args) => listGuests(client, args));

  server.registerTool('add_guest', {
    description:
      'Add a new guest group (household) to the guest list, optionally with a partner/plus-one, mailing address and ' +
      'event invitations, so one call creates a fully set-up household. Affiliation is relative to the Zola account ' +
      'owner: PRIMARY_* is the account owner\'s side, PARTNER_* is the other partner\'s side (the web UI labels ' +
      'PARTNER_* with the partner\'s name, e.g. "<partner>\'s Family Friend"). Check list_guests for duplicates first. ' +
      'Guests are invited only to the events in event_ids — none when omitted. Adds to the list only: no invitation, ' +
      'save-the-date or email is sent.',
    inputSchema: z.object({
      first_name: z.string().min(1).describe('Primary guest first name'),
      last_name: z.string().min(1).describe('Primary guest last (family) name'),
      plus_one_first_name: z.string().optional().describe('Partner / plus-one first name'),
      plus_one_last_name: z.string().optional().describe('Partner / plus-one last name (default: the primary guest\'s last name)'),
      email: z.string().optional().describe('Primary guest email address'),
      phone: z.string().optional().describe('Primary guest mobile phone'),
      affiliation: z.string().optional().describe(
        'Relationship to the couple (default PRIMARY_FRIEND). PRIMARY_* = the account owner\'s side; PARTNER_* = the other partner\'s side. ' +
          `Known values: ${KNOWN_AFFILIATIONS.join(', ')}. Case-insensitive.`
      ),
      tier: z.string().optional().describe('Guest-list tier (default: A)'),
      event_ids: z.array(z.number()).optional().describe(
        'Event ids from list_events to invite every guest in the household to. Omit to invite to none.'
      ),
      address1: z.string().optional().describe('Street address (applied to every guest in the household)'),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional().describe('State / province code, e.g. FL'),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US (only sent with an address)'),
    }),
    annotations: { destructiveHint: false, openWorldHint: true },
    _meta: familyMeta('change', { aliases: ['add a guest'] }),
  }, (args) => addGuest(client, args));

  server.registerTool('update_guest_address', {
    description: "Update a guest group's mailing address",
    inputSchema: z.object({
      guest_group_id: z.number().describe('Guest group ID from list_guests'),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
    }),
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    _meta: familyMeta('change'),
  }, (args) => updateGuestAddress(client, args));

  server.registerTool('remove_guest', {
    description:
      'Remove a guest group (household) from the guest list. This permanently deletes the household with every RSVP, ' +
      `event invitation and seat assignment its guests had; there is no trash. ${CONFIRM_NOTE}`,
    inputSchema: z.object({
      guest_group_id: z.number().describe('Guest group ID from list_guests'),
      confirmToken: confirmTokenParam,
    }),
    annotations: { destructiveHint: true, openWorldHint: true },
    _meta: familyMeta('change'),
  }, (args, ctx) => removeGuest(client, args, ctx));
}
