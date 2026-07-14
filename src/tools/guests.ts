import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ZolaClient } from '../client.js';

import { MobileEnvelope, ToolResult, jsonResult } from '../types.js';

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

export async function listGuests(client: ZolaClient): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${weddingAccountId}`,
    { sort_by_name_asc: true }
  );
  const { guest_groups, ...stats } = response.data;
  return jsonResult({ stats, guest_groups });
}

export async function addGuest(client: ZolaClient, args: {
  first_name: string;
  last_name: string;
  plus_one_first_name?: string;
  plus_one_last_name?: string;
  email?: string;
  phone?: string;
  affiliation?: string;
}): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const guests: Record<string, unknown>[] = [
    {
      first_name: args.first_name,
      family_name: args.last_name,
      relationship_type: 'PRIMARY',
      source: 'IOS',
      email_address: args.email ?? '',
      mobile_phone: args.phone ?? '',
      affiliation: args.affiliation ?? 'PRIMARY_FRIEND',
      tier: 'A',
      country_code: 'US',
      prefix: '',
      middle_name: '',
      suffix: '',
      home_phone: '',
      address1: '',
      address2: '',
      city: '',
      state_province: '',
      postal_code: '',
      event_invitations: [],
      tags: [],
    },
  ];
  if (args.plus_one_first_name && args.plus_one_last_name) {
    guests.push({
      first_name: args.plus_one_first_name,
      family_name: args.plus_one_last_name,
      relationship_type: 'PARTNER',
      source: 'IOS',
      email_address: '',
      mobile_phone: '',
      affiliation: args.affiliation ?? 'PRIMARY_FRIEND',
      tier: 'A',
      country_code: 'US',
      prefix: '',
      middle_name: '',
      suffix: '',
      home_phone: '',
      address1: '',
      address2: '',
      city: '',
      state_province: '',
      postal_code: '',
      event_invitations: [],
      tags: [],
    });
  }
  const body = {
    wedding_account_id: weddingAccountId,
    guests,
    guest_group_affiliation: args.affiliation ?? 'PRIMARY_FRIEND',
    guest_group_tier: 'A',
    guest_group_uuid: '',
    envelope_recipient: '',
    invited: true,
    invitation_sent: false,
    save_the_date_sent: false,
    rsvp_question_answers: [],
    gift_count: 0,
  };
  const result = await client.requestMobile<MobileEnvelope<unknown>>(
    'POST',
    '/v3/guestlists/groups',
    body
  );
  return jsonResult(result.data);
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

export async function removeGuest(client: ZolaClient, args: { guest_group_id: number }): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  await client.requestMobile(
    'PUT',
    `/v3/guestlists/groups/wedding-accounts/${weddingAccountId}/delete`,
    {
      wedding_account_id: weddingAccountId,
      guest_group_ids: [args.guest_group_id],
    }
  );
  return {
    content: [{ type: 'text', text: `Deleted guest group ${args.guest_group_id}` }],
  };
}

export function registerGuestTools(server: McpServer, client: ZolaClient): void {
  server.registerTool('list_guests', {
    description: 'List all guest groups with stats (total, invited, missing addresses)',
    annotations: { readOnlyHint: true },
  }, () => listGuests(client));

  server.registerTool('add_guest', {
    description: 'Add a new guest group (household) to the guest list',
    inputSchema: {
      first_name: z.string().describe('Primary guest first name'),
      last_name: z.string().describe('Primary guest last name'),
      plus_one_first_name: z.string().optional().describe('Plus-one first name'),
      plus_one_last_name: z.string().optional().describe('Plus-one last name'),
      email: z.string().optional().describe('Guest email address'),
      phone: z.string().optional().describe('Guest phone number'),
      affiliation: z.string().optional().describe('Affiliation (default: PRIMARY_FRIEND)'),
    },
    annotations: { destructiveHint: false },
  }, (args) => addGuest(client, args));

  server.registerTool('update_guest_address', {
    description: "Update a guest group's mailing address",
    inputSchema: {
      guest_group_id: z.number().describe('Guest group ID from list_guests'),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
    },
    annotations: { destructiveHint: false },
  }, (args) => updateGuestAddress(client, args));

  server.registerTool('remove_guest', {
    description: 'Remove a guest group from the guest list',
    inputSchema: { guest_group_id: z.number().describe('Guest group ID from list_guests') },
    annotations: { destructiveHint: true },
  }, (args) => removeGuest(client, args));
}
