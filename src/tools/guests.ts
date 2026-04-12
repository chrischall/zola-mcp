import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

import { MobileEnvelope, ToolResult } from '../types.js';

interface GuestEntry {
  guest: {
    guest_id: number;
    uuid: string;
    first_name: string;
    middle_name: string | null;
    family_name: string;
    relationship_type: string;
    email_address: string | null;
    mobile_phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state_province: string | null;
    postal_code: string | null;
    country_code: string | null;
    affiliation: string;
    tier: string;
    rsvp: string;
  };
  seating_chart_seat: unknown;
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
  guests: GuestEntry[];
}

interface DirectoryResponse {
  num_invited_guests: number;
  num_guests: number;
  num_addresses_missing: number;
  guest_groups: GuestGroup[];
}

export async function listGuests(): Promise<ToolResult> {
  const { weddingAccountId } = await client.getContext();
  const response = await client.requestMobile<MobileEnvelope<DirectoryResponse>>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${weddingAccountId}`,
    { sort_by_name_asc: true }
  );
  const { guest_groups, ...stats } = response.data;
  return {
    content: [{ type: 'text', text: JSON.stringify({ stats, guest_groups }, null, 2) }],
  };
}

export async function addGuest(args: {
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
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export async function updateGuestAddress(args: {
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

  const updatedGuests = group.guests.map((entry) => ({
    ...entry.guest,
    guest_id: entry.guest.guest_id,
    address1: args.address1 ?? entry.guest.address1 ?? '',
    address2: args.address2 !== undefined ? args.address2 : entry.guest.address2 ?? '',
    city: args.city ?? entry.guest.city ?? '',
    state_province: args.state_province ?? entry.guest.state_province ?? '',
    postal_code: args.postal_code ?? entry.guest.postal_code ?? '',
    country_code: args.country_code ?? entry.guest.country_code ?? 'US',
    event_invitations: [],
    tags: [],
  }));

  const body = {
    guest_group_request: {
      wedding_account_id: weddingAccountId,
      guest_group_id: args.guest_group_id,
      guest_group_uuid: group.guest_group_uuid,
      guest_group_affiliation: group.guest_group_affiliation,
      guest_group_tier: group.guest_group_tier,
      invited: group.invited,
      invitation_sent: group.invitation_sent,
      save_the_date_sent: group.save_the_date_sent,
      envelope_recipient: group.envelope_recipient ?? '',
      addressing_style: group.addressing_style,
      guests: updatedGuests,
      gift_count: 0,
    },
  };

  const result = await client.requestMobile<MobileEnvelope<unknown>>(
    'PUT',
    `/v3/guestlists/groups/wedding-accounts/id/${weddingAccountId}/suite`,
    body
  );
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
}

export async function removeGuest(args: { guest_group_id: number }): Promise<ToolResult> {
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

export function registerGuestTools(server: McpServer): void {
  server.registerTool('zola_list_guests', {
    description: 'List all guest groups with stats (total, invited, missing addresses)',
    annotations: { readOnlyHint: true },
  }, listGuests);

  server.registerTool('zola_add_guest', {
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
  }, addGuest);

  server.registerTool('zola_update_guest_address', {
    description: "Update a guest group's mailing address",
    inputSchema: {
      guest_group_id: z.number().describe('Guest group ID from zola_list_guests'),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
    },
    annotations: { destructiveHint: false },
  }, updateGuestAddress);

  server.registerTool('zola_remove_guest', {
    description: 'Remove a guest group from the guest list',
    inputSchema: { guest_group_id: z.number().describe('Guest group ID from zola_list_guests') },
    annotations: { destructiveHint: true },
  }, removeGuest);
}
