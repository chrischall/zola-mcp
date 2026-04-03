import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface SeatOccupant {
  display_name: string;
  initials: string;
  affiliation: string;
  relationship_type: string;
  rsvp_type: string;
  guest_uuid: string;
  guest_group_id: number;
}

interface Seat {
  uuid: string;
  table_uuid: string;
  seating_chart_uuid: string;
  occupant: SeatOccupant | null;
  color: string | null;
}

interface Table {
  uuid: string;
  seating_chart_uuid: string;
  shape: string;
  name: string;
  color: string;
  num_seats: number;
  seats: Seat[];
  x: number;
  y: number;
}

interface SeatingChart {
  uuid: string;
  name: string;
  event_id: number;
  width: number;
  height: number;
  tables: Table[];
  objects: unknown[];
}

interface SeatingChartSummary {
  uuid: string;
  name: string;
  event_id: number;
}

interface GuestEntry {
  guest: {
    guest_id: number;
    uuid: string;
    first_name: string;
    family_name: string;
    relationship_type: string;
    rsvp: string;
  };
  seating_chart_seat: { seat_uuid: string; table_name: string } | null;
}

interface GuestGroup {
  guest_group_id: number;
  guests: GuestEntry[];
}

interface DirectoryResponse {
  data: {
    num_invited_guests: number;
    guest_groups: GuestGroup[];
  };
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function listSeatingCharts(): Promise<ToolResult> {
  const charts = await client.requestMobile<SeatingChartSummary[]>('GET', '/v3/seating-charts/summaries');
  return { content: [{ type: 'text', text: JSON.stringify(charts, null, 2) }] };
}

export async function getSeatingChart(args: { uuid: string }): Promise<ToolResult> {
  const chart = await client.requestMobile<SeatingChart>('GET', `/v3/seating-charts/${args.uuid}`);
  return { content: [{ type: 'text', text: JSON.stringify(chart, null, 2) }] };
}

export async function listUnseatedGuests(): Promise<ToolResult> {
  const accountId = process.env.ZOLA_ACCOUNT_ID;
  if (!accountId) throw new Error('ZOLA_ACCOUNT_ID must be set');
  const response = await client.requestMobile<DirectoryResponse>(
    'POST',
    `/v3/guestlists/directory/wedding-accounts/${accountId}`,
    { sort_by_name_asc: true }
  );
  const unseated = response.data.guest_groups
    .flatMap((g) => g.guests)
    .filter((e) => e.seating_chart_seat === null)
    .map((e) => ({
      guest_uuid: e.guest.uuid,
      first_name: e.guest.first_name,
      family_name: e.guest.family_name,
      relationship_type: e.guest.relationship_type,
      rsvp: e.guest.rsvp,
    }));
  return { content: [{ type: 'text', text: JSON.stringify(unseated, null, 2) }] };
}

export async function assignSeat(args: {
  guest_uuid: string;
  seat_uuid: string;
  table_uuid: string;
  seating_chart_uuid: string;
}): Promise<ToolResult> {
  const chart = await client.requestMobile<SeatingChart>('PUT', '/v3/seating-charts/seats', {
    guest_uuid: args.guest_uuid,
    seat_uuid: args.seat_uuid,
    table_uuid: args.table_uuid,
    seating_chart_uuid: args.seating_chart_uuid,
  });
  const table = chart.tables.find((t) => t.uuid === args.table_uuid);
  return {
    content: [
      {
        type: 'text',
        text: `Assigned guest ${args.guest_uuid} to seat ${args.seat_uuid} at ${table?.name ?? args.table_uuid}`,
      },
    ],
  };
}

export function registerSeatingTools(server: McpServer): void {
  server.tool(
    'list_seating_charts',
    'List all seating charts with their UUID and event name',
    {},
    listSeatingCharts
  );

  server.tool(
    'get_seating_chart',
    'Get full seating chart with all tables, seats, and current occupants',
    { uuid: z.string().describe('Seating chart UUID from list_seating_charts') },
    getSeatingChart
  );

  server.tool(
    'list_unseated_guests',
    'List all guests who have not yet been assigned a seat',
    {},
    listUnseatedGuests
  );

  server.tool(
    'assign_seat',
    'Assign a guest to a specific seat in a seating chart',
    {
      guest_uuid: z.string().describe('Guest UUID from list_unseated_guests'),
      seat_uuid: z.string().describe('Seat UUID from get_seating_chart'),
      table_uuid: z.string().describe('Table UUID from get_seating_chart'),
      seating_chart_uuid: z.string().describe('Seating chart UUID from list_seating_charts'),
    },
    assignSeat
  );
}
