import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listEvents, trackRsvps, getGiftTracker, getRegistry } from '../src/tools/events.js';

const MOCK_EVENT = {
  event_entity_id: 5108495,
  uuid: 'event-uuid-1',
  wedding_account_id: 4664323,
  type: 'RECEPTION',
  name: 'Reception',
  venue_name: 'Rooftop 230',
  city: 'Charlotte',
  state_province: 'NC',
  start_at: '2026-10-17T18:30:00Z',
  end_at: '2026-10-17T23:00:00Z',
  timezone: 'America/New_York',
  collect_rsvps: true,
  num_guests_attending: 50,
  num_guests_declined: 10,
  num_guests_not_responded: 133,
  meal_options: [],
  public: false,
};

const MOCK_EVENTS_RESPONSE = {
  data: [
    {
      start_date: '2026-10-17T00:00:00Z',
      events: [MOCK_EVENT],
    },
  ],
};

const MOCK_RSVP_MODULE = {
  event_id: 5108495,
  event_name: 'Reception',
  event_start_date: '2026-10-17T18:30:00Z',
  num_guests_attending: 50,
  num_guests_declined: 10,
  num_guests_not_responded: 133,
  items: [],
  type: 'EVENT_RSVP_SUMMARY',
};

const MOCK_RSVPS_RESPONSE = {
  data: {
    rsvp_page_hidden: false,
    modules: [MOCK_RSVP_MODULE],
  },
};

const MOCK_GIFT_TRACKER_RESPONSE = {
  data: {
    gifts_available_to_send: 0,
    cash_available_to_transfer_cents: 0,
    total_gifts_received: 3,
    total_gift_value: 15000,
    surprise_gift_count: 0,
    info_modules: [],
    gifts: [
      {
        type: 'REGISTRY_ITEM',
        title: 'Le Creuset Dutch Oven',
        price_cents: 15000,
        quantity: 1,
        gifter_name: 'Jennifer Acerra',
        thank_you_note_status: 'NOT_STARTED',
      },
    ],
  },
};

const MOCK_REGISTRY_RESPONSE = {
  data: {
    groups: [
      {
        modules: [
          {
            type: 'CIRCLE_GRID',
            title: 'All Categories',
            items: [
              { title: 'Kitchen', deep_link_url: 'zola://category?id=544' },
              { title: 'Dining', deep_link_url: 'zola://category?id=545' },
            ],
          },
        ],
      },
    ],
  },
};

describe('events & wedding tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
    process.env.ZOLA_ACCOUNT_ID = '4664323';
    process.env.ZOLA_REGISTRY_ID = 'registry-id-1';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ZOLA_ACCOUNT_ID;
    delete process.env.ZOLA_REGISTRY_ID;
  });

  it('listEvents: GETs event groups and flattens to event list', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_EVENTS_RESPONSE as never);

    const result = await listEvents();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/events/wedding-accounts/4664323/groups');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Reception');
    expect(parsed[0].type).toBe('RECEPTION');
    expect(parsed[0].num_guests_attending).toBe(50);
  });

  it('trackRsvps: GETs RSVP tracking per event', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_RSVPS_RESPONSE as never);

    const result = await trackRsvps();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/websites/events/track-rsvps');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].event_name).toBe('Reception');
    expect(parsed[0].num_guests_attending).toBe(50);
    expect(parsed[0].num_guests_declined).toBe(10);
  });

  it('getGiftTracker: GETs gift tracking summary and gifts', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_GIFT_TRACKER_RESPONSE as never);

    const result = await getGiftTracker();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/gift_tracker/registry-id-1');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_gifts_received).toBe(3);
    expect(parsed.gifts).toHaveLength(1);
    expect(parsed.gifts[0].title).toBe('Le Creuset Dutch Oven');
  });

  it('getRegistry: GETs registry items', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_REGISTRY_RESPONSE as never);

    const result = await getRegistry();

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v4/shop/registry?registry_id=registry-id-1&updated_modules=true');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toBeDefined();
  });
});
