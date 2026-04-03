import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listSeatingCharts, getSeatingChart, listUnseatedGuests, assignSeat } from '../src/tools/seating.js';

const MOCK_SUMMARIES = [
  { uuid: 'chart-uuid-1', name: 'Reception', event_id: 5108495 },
];

const MOCK_SEAT_EMPTY = {
  uuid: 'seat-uuid-1',
  table_uuid: 'table-uuid-1',
  seating_chart_uuid: 'chart-uuid-1',
  occupant: null,
  color: null,
};

const MOCK_SEAT_OCCUPIED = {
  uuid: 'seat-uuid-2',
  table_uuid: 'table-uuid-1',
  seating_chart_uuid: 'chart-uuid-1',
  occupant: {
    display_name: 'Jennifer Acerra',
    initials: 'JA',
    affiliation: 'PRIMARY_FRIEND',
    relationship_type: 'PRIMARY',
    rsvp_type: 'NO_RESPONSE',
    guest_uuid: 'guest-uuid-1',
    guest_group_id: 152644475,
  },
  color: null,
};

const MOCK_CHART = {
  uuid: 'chart-uuid-1',
  name: 'Reception',
  event_id: 5108495,
  width: 3000,
  height: 3000,
  tables: [
    {
      uuid: 'table-uuid-1',
      seating_chart_uuid: 'chart-uuid-1',
      shape: 'CIRCLE',
      name: 'Table 1',
      color: 'FDAA9A',
      num_seats: 2,
      seats: [MOCK_SEAT_EMPTY, MOCK_SEAT_OCCUPIED],
      x: 1434,
      y: 1289,
    },
  ],
  objects: [],
};

const MOCK_DIRECTORY = {
  data: {
    num_invited_guests: 10,
    guest_groups: [
      {
        guest_group_id: 152644475,
        guests: [
          {
            guest: {
              guest_id: 280379459,
              uuid: 'guest-uuid-1',
              first_name: 'Jennifer',
              family_name: 'Acerra',
              relationship_type: 'PRIMARY',
              rsvp: 'NO_RESPONSE',
            },
            seating_chart_seat: { seat_uuid: 'seat-uuid-2', table_name: 'Table 1' },
          },
          {
            guest: {
              guest_id: 280379460,
              uuid: 'guest-uuid-2',
              first_name: 'Jason',
              family_name: 'Shuba',
              relationship_type: 'PARTNER',
              rsvp: 'NO_RESPONSE',
            },
            seating_chart_seat: null,
          },
        ],
      },
    ],
  },
};

describe('seating tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    process.env.ZOLA_ACCOUNT_ID = '4664323';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ZOLA_ACCOUNT_ID;
  });

  it('listSeatingCharts: GETs summaries and returns array', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_SUMMARIES as never);

    const result = await listSeatingCharts();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/seating-charts/summaries');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Reception');
  });

  it('getSeatingChart: GETs by uuid and returns chart with seats', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_CHART as never);

    const result = await getSeatingChart({ uuid: 'chart-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/seating-charts/chart-uuid-1');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe('Reception');
    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].seats[1].occupant.display_name).toBe('Jennifer Acerra');
  });

  it('listUnseatedGuests: filters directory to guests with null seating_chart_seat', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_DIRECTORY as never);

    const result = await listUnseatedGuests();

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/guestlists/directory/wedding-accounts/4664323', { sort_by_name_asc: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].first_name).toBe('Jason');
    expect(parsed[0].guest_uuid).toBe('guest-uuid-2');
  });

  it('assignSeat: PUTs correct body and returns confirmation', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_CHART as never);

    const result = await assignSeat({
      guest_uuid: 'guest-uuid-2',
      seat_uuid: 'seat-uuid-1',
      table_uuid: 'table-uuid-1',
      seating_chart_uuid: 'chart-uuid-1',
    });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/seating-charts/seats', {
      guest_uuid: 'guest-uuid-2',
      seat_uuid: 'seat-uuid-1',
      table_uuid: 'table-uuid-1',
      seating_chart_uuid: 'chart-uuid-1',
    });
    expect(result.content[0].text).toContain('chart-uuid-1');
    expect(result.content[0].text).toContain('Reception');
  });
});
