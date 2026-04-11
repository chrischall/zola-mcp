# Vendor Inquiries Implementation Plan

**Goal:** Add 3 MCP tools (list_inquiries, get_inquiry_conversation, mark_inquiry_read) to the Zola MCP server.

**Architecture:** Uses `client.requestMobile()` to `mobile-api.zola.com/v3/`. Tools in `src/tools/inquiries.ts`. Mobile API wraps responses in `{data: ...}`.

---

## File Map

| File | Change |
|---|---|
| `src/tools/inquiries.ts` | New — 3 exported handlers + `registerInquiryTools()` |
| `src/index.ts` | Add import + `registerInquiryTools(server)` call |
| `tests/inquiries.test.ts` | New — 3 tests |

---

## Task 1: `src/tools/inquiries.ts` + `tests/inquiries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/inquiries.test.ts`:

```typescript
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
      inquiries: [MOCK_INQUIRY],
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
```

- [ ] **Step 2: Run to confirm failure** — `PATH="/opt/homebrew/bin:$PATH" npm test -- tests/inquiries.test.ts 2>&1 | tail -10`

- [ ] **Step 3: Create `src/tools/inquiries.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';

interface VendorCard {
  storefront_id: number;
  storefront_uuid: string;
  vendor_name: string;
  taxonomy_node: {
    key: string;
    label: string;
    singular_name: string;
  };
  city: string;
  state_province: string;
  starting_price_cents: number | null;
  recommendations: number;
  average_reviews_rate: number | null;
  quick_responder: boolean;
}

interface InquirySummary {
  inquiry_uuid: string;
  vendor_card: VendorCard;
  status_text: string;
  updated_at: number;
  unread: boolean;
  booked: boolean;
  inquiry_status: string;
}

interface UnifiedSection {
  title: string;
  inquiries: InquirySummary[];
}

interface UnifiedResponse {
  data: UnifiedSection[];
}

interface Participant {
  key: string;
  type: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
}

interface Message {
  type: string;
  body: string;
  sent_by_participant_key: string;
  sent_at: number;
  new_message: boolean;
}

interface ConversationResponse {
  data: {
    inquiry_summary: {
      inquiry_uuid: string;
      vendor_card: VendorCard;
      couple: unknown;
      summary_items: { title: string; value: string }[];
      message: string;
      inquired_at: number;
    };
    inquiry_status: string;
    participants: Participant[];
    messages: Message[];
  };
}

type ToolResult = { content: [{ type: 'text'; text: string }] };

export async function listInquiries(): Promise<ToolResult> {
  const response = await client.requestMobile<UnifiedResponse>(
    'POST',
    '/v3/inquiries/unified-inquiries',
    {}
  );
  const inquiries = response.data.flatMap((section) =>
    section.inquiries.map((inq) => ({
      inquiry_uuid: inq.inquiry_uuid,
      vendor_name: inq.vendor_card.vendor_name,
      vendor_type: inq.vendor_card.taxonomy_node.singular_name,
      city: inq.vendor_card.city,
      state_province: inq.vendor_card.state_province,
      starting_price_cents: inq.vendor_card.starting_price_cents,
      status_text: inq.status_text,
      inquiry_status: inq.inquiry_status,
      unread: inq.unread,
      booked: inq.booked,
      updated_at: inq.updated_at,
    }))
  );
  return { content: [{ type: 'text', text: JSON.stringify(inquiries, null, 2) }] };
}

export async function getInquiryConversation(args: { uuid: string }): Promise<ToolResult> {
  const response = await client.requestMobile<ConversationResponse>(
    'GET',
    `/v3/inquiries/${args.uuid}/conversation`
  );
  return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
}

export async function markInquiryRead(args: { uuid: string }): Promise<ToolResult> {
  await client.requestMobile('PUT', `/v3/inquiries/${args.uuid}/conversation/read`);
  return {
    content: [{ type: 'text', text: `Marked inquiry ${args.uuid} as read` }],
  };
}

export function registerInquiryTools(server: McpServer): void {
  server.tool(
    'list_inquiries',
    'List all vendor inquiries with status, vendor name, and unread flag',
    {},
    listInquiries
  );

  server.tool(
    'get_inquiry_conversation',
    'Get full conversation for a vendor inquiry including messages and inquiry details',
    { uuid: z.string().describe('Inquiry UUID from list_inquiries') },
    getInquiryConversation
  );

  server.tool(
    'mark_inquiry_read',
    'Mark a vendor inquiry conversation as read',
    { uuid: z.string().describe('Inquiry UUID from list_inquiries') },
    markInquiryRead
  );
}
```

- [ ] **Step 4: Run tests** — `PATH="/opt/homebrew/bin:$PATH" npm test -- tests/inquiries.test.ts 2>&1 | tail -10`

- [ ] **Step 5: Commit** — `git add src/tools/inquiries.ts tests/inquiries.test.ts && git commit -m "feat: add inquiry tools (list_inquiries, get_inquiry_conversation, mark_inquiry_read)"`

---

## Task 2: Wire into `src/index.ts`

- [ ] **Step 1: Add import and registration call**

```typescript
import { registerInquiryTools } from './tools/inquiries.js';
// after registerSeatingTools(server):
registerInquiryTools(server);
```

- [ ] **Step 2: Run all tests** — `PATH="/opt/homebrew/bin:$PATH" npm test 2>&1 | tail -10`

- [ ] **Step 3: Build** — `PATH="/opt/homebrew/bin:$PATH" npm run build 2>&1 | tail -3`

- [ ] **Step 4: Commit** — `git add src/index.ts && git commit -m "feat: wire registerInquiryTools into MCP server"`
