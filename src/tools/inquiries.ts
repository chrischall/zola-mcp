import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { client } from '../client.js';
import { ToolResult } from '../types.js';

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
  server.registerTool('list_inquiries', {
    description: 'List all vendor inquiries with status, vendor name, and unread flag',
    annotations: { readOnlyHint: true },
  }, listInquiries);

  server.registerTool('get_inquiry_conversation', {
    description: 'Get full conversation for a vendor inquiry including messages and inquiry details',
    inputSchema: { uuid: z.string().describe('Inquiry UUID from list_inquiries') },
    annotations: { readOnlyHint: true },
  }, getInquiryConversation);

  server.registerTool('mark_inquiry_read', {
    description: 'Mark a vendor inquiry conversation as read',
    inputSchema: { uuid: z.string().describe('Inquiry UUID from list_inquiries') },
    annotations: { destructiveHint: false },
  }, markInquiryRead);
}
