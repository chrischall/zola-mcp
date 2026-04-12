import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../src/client.js';
import { listInquiries, getInquiryConversation, markInquiryRead } from '../src/tools/inquiries.js';

const MOCK_INQUIRY = {
  inquiry_uuid: 'inquiry-uuid-1',
  vendor_card: {
    storefront_id: 110667,
    storefront_uuid: 'storefront-uuid-1',
    vendor_name: 'DM Weddings',
    taxonomy_node: {
      key: 'wedding-planners',
      label: 'Wedding Planners',
      singular_name: 'Wedding Planner',
    },
    city: 'Charlotte',
    state_province: 'NC',
    starting_price_cents: 250000,
    recommendations: 13,
    average_reviews_rate: 5.0,
    quick_responder: true,
  },
  status_text: 'Inquiry sent',
  updated_at: 1775939622834,
  unread: true,
  booked: false,
  needs_response: false,
  inquiry_status: 'READY',
};

const MOCK_UNIFIED_RESPONSE = {
  data: [
    {
      title: 'Inquiries',
      banner_text: 'Vendors typically respond within 2 business days.',
      taxonomy_nodes: [],
      inquiry_summaries: [MOCK_INQUIRY],
    },
  ],
};

const MOCK_CONVERSATION = {
  data: {
    inquiry_summary: {
      inquiry_uuid: 'inquiry-uuid-1',
      vendor_card: MOCK_INQUIRY.vendor_card,
      couple: {
        first_name: 'Meredith',
        last_name: 'Suffron',
        email_address: 'meredith@example.com',
        wedding_date: 1792195200000,
      },
      summary_items: [
        { title: 'Guest Count', value: '100 Guests' },
      ],
      message: 'Hello! We are getting married...',
      inquired_at: 1775939621455,
    },
    inquiry_status: 'READY',
    participants: [
      { key: 'vendor-key-1', type: 'VENDOR', name: 'DM Weddings', first_name: 'Debora', last_name: 'Biggers' },
      { key: 'couple-key-1', type: 'COUPLE', name: 'Meredith Suffron', first_name: 'Meredith', last_name: 'Suffron' },
    ],
    messages: [
      {
        type: 'VENDOR_OUTREACH',
        body: 'Congratulations on your engagement!',
        sent_by_participant_key: 'vendor-key-1',
        sent_at: 1775502625582,
        new_message: false,
      },
      {
        type: 'COUPLE_OUTREACH',
        body: 'Thanks! We are excited.',
        sent_by_participant_key: 'couple-key-1',
        sent_at: 1775939621455,
        new_message: false,
      },
    ],
  },
};

describe('inquiry tools', () => {
  let reqSpy: ReturnType<typeof vi.spyOn<typeof client, 'requestMobile'>>;

  beforeEach(() => {
    reqSpy = vi.spyOn(client, 'requestMobile');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listInquiries: POSTs to unified-inquiries and returns flattened list', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_UNIFIED_RESPONSE as never);

    const result = await listInquiries();

    expect(reqSpy).toHaveBeenCalledWith('POST', '/v3/inquiries/unified-inquiries', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].inquiry_uuid).toBe('inquiry-uuid-1');
    expect(parsed[0].vendor_name).toBe('DM Weddings');
    expect(parsed[0].vendor_type).toBe('Wedding Planner');
    expect(parsed[0].inquiry_status).toBe('READY');
    expect(parsed[0].unread).toBe(true);
  });

  it('getInquiryConversation: GETs conversation by uuid', async () => {
    reqSpy.mockResolvedValueOnce(MOCK_CONVERSATION as never);

    const result = await getInquiryConversation({ uuid: 'inquiry-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('GET', '/v3/inquiries/inquiry-uuid-1/conversation');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.inquiry_status).toBe('READY');
    expect(parsed.participants).toHaveLength(2);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].type).toBe('VENDOR_OUTREACH');
  });

  it('markInquiryRead: PUTs to read endpoint', async () => {
    reqSpy.mockResolvedValueOnce({ status: 'success' } as never);

    const result = await markInquiryRead({ uuid: 'inquiry-uuid-1' });

    expect(reqSpy).toHaveBeenCalledWith('PUT', '/v3/inquiries/inquiry-uuid-1/conversation/read');
    expect(result.content[0].text).toContain('inquiry-uuid-1');
  });
});
