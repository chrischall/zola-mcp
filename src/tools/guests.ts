import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface Guest {
  id: number;
  guest_group_id: number;
  relationship_type: string;
  prefix: string | null;
  first_name: string;
  middle_name: string | null;
  family_name: string;
  suffix: string | null;
  printed_name: string | null;
  source: string;
  rsvp: string | null;
  email_address: string | null;
  phone_number: string | null;
  event_invitations: unknown[];
}

interface GuestGroup {
  id: number;
  uuid: string;
  wedding_account_id: number;
  email_address: string | null;
  home_phone: string | null;
  mobile_phone: string | null;
  address_1: string | null;
  address_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country_code: string | null;
  affiliation: string | null;
  tier: string | null;
  invited: boolean;
  invitation_sent: boolean;
  save_the_date_sent: boolean;
  envelope_recipient: string | null;
  envelope_recipient_override: string | null;
  addressing_style: string | null;
  guests: Guest[];
  rsvp_question_answers: unknown[];
}

interface GlobalStat {
  key: string;
  label: string;
  value: number;
}

interface ListResponse {
  guest_groups: GuestGroup[];
  facets: unknown[];
  selected_facet_bucket_keys: unknown[];
  global_stats: GlobalStat[];
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function listGuests(): Promise<ToolResult> {
  const response = await client.request<ListResponse>(
    'POST',
    '/web-api/v1/guestgroup/list/all',
    {}
  );
  const stats = Object.fromEntries(response.global_stats.map((s) => [s.key, s.value]));
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ stats, guest_groups: response.guest_groups }, null, 2),
      },
    ],
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
  const guests: { first_name: string; family_name: string; relationship_type: string }[] = [
    { first_name: args.first_name, family_name: args.last_name, relationship_type: 'PRIMARY' },
  ];
  if (args.plus_one_first_name && args.plus_one_last_name) {
    guests.push({
      first_name: args.plus_one_first_name,
      family_name: args.plus_one_last_name,
      relationship_type: 'CHILD', // Zola API term for any non-primary household member
    });
  }
  const body = {
    guests,
    email_address: args.email ?? null,
    mobile_phone: args.phone ?? null,
    affiliation: args.affiliation ?? 'PRIMARY_FRIEND',
    invited: true,
  };
  const created = await client.request<GuestGroup>('POST', '/web-api/v1/guestgroup', body);
  return { content: [{ type: 'text', text: JSON.stringify(created, null, 2) }] };
}

export async function updateGuestAddress(args: {
  id: number;
  address_1?: string;
  address_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country_code?: string;
}): Promise<ToolResult> {
  const response = await client.request<ListResponse>(
    'POST',
    '/web-api/v1/guestgroup/list/all',
    {}
  );
  const current = response.guest_groups.find((g) => g.id === args.id);
  if (!current) {
    throw new Error(`Guest group with ID ${args.id} not found`);
  }
  const addressBody = {
    address_1: args.address_1 ?? current.address_1,
    address_2: args.address_2 !== undefined ? args.address_2 : current.address_2,
    city: args.city ?? current.city,
    state_province: args.state_province ?? current.state_province,
    postal_code: args.postal_code ?? current.postal_code,
    country_code: args.country_code ?? current.country_code ?? 'US',
  };
  const updated = await client.request<GuestGroup>(
    'PUT',
    `/web-api/v2/guestgroup/${args.id}/address`,
    addressBody
  );
  return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
}

export async function removeGuest(args: { id: number }): Promise<ToolResult> {
  const response = await client.request<ListResponse>(
    'POST',
    '/web-api/v1/guestgroup/list/all',
    {}
  );
  const current = response.guest_groups.find((g) => g.id === args.id);
  if (!current) {
    throw new Error(`Guest group with ID ${args.id} not found`);
  }
  await client.request('POST', '/web-api/v1/guestgroup/delete', { ids: [args.id] });
  return {
    content: [{ type: 'text', text: `Deleted guest group ${args.id} (${current.envelope_recipient ?? 'unknown'})` }],
  };
}

export function registerGuestTools(server: McpServer): void {
  server.tool('list_guests', 'List all guest groups with stats (total, adults, children, missing addresses)', {}, listGuests);

  server.tool(
    'add_guest',
    'Add a new guest group (household) to the guest list',
    {
      first_name: z.string().describe('Primary guest first name'),
      last_name: z.string().describe('Primary guest last name'),
      plus_one_first_name: z.string().optional().describe('Plus-one first name'),
      plus_one_last_name: z.string().optional().describe('Plus-one last name'),
      email: z.string().optional().describe('Guest email address'),
      phone: z.string().optional().describe('Guest phone number'),
      affiliation: z.string().optional().describe('Affiliation (default: PRIMARY_FRIEND)'),
    },
    addGuest
  );

  server.tool(
    'update_guest_address',
    "Update a guest group's mailing address by numeric ID",
    {
      id: z.number().describe('Guest group numeric ID (from list_guests)'),
      address_1: z.string().optional(),
      address_2: z.string().optional(),
      city: z.string().optional(),
      state_province: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe('Default: US'),
    },
    updateGuestAddress
  );

  server.tool(
    'remove_guest',
    'Remove a guest group from the guest list by numeric ID',
    { id: z.number().describe('Guest group numeric ID (from list_guests)') },
    removeGuest
  );
}
