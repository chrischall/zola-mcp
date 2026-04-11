# Zola MCP — Vendor Inquiries Domain Design

**Date:** 2026-04-11
**Status:** Approved

## Overview

Adds vendor inquiry management tools to the Zola MCP server. Inquiries are messages between the couple and vendors on the Zola marketplace. API traffic captured via mitmproxy from the Zola iOS app.

**API base:** `https://mobile-api.zola.com` via `client.requestMobile()`

## API Endpoints

### POST `/v3/inquiries/unified-inquiries`

List all inquiries grouped by vendor type. Body: `{}`

Response envelope: `{data: [...]}`

Each element in the data array is a section with `title`, `banner_text`, `taxonomy_nodes` (vendor categories), and `inquiries` array. The inquiries array contains:

```json
{
  "inquiry_uuid": "41dc3e76-...",
  "vendor_card": {
    "storefront_id": 110667,
    "storefront_uuid": "1556cf80-...",
    "vendor_name": "DM Weddings",
    "taxonomy_node": {
      "key": "wedding-planners",
      "label": "Wedding Planners",
      "singular_name": "Wedding Planner"
    },
    "city": "Charlotte",
    "state_province": "NC",
    "starting_price_cents": 250000,
    "recommendations": 13,
    "average_reviews_rate": 5.0,
    "quick_responder": true
  },
  "status_text": "Inquiry sent",
  "updated_at": 1775939622834,
  "unread": true,
  "booked": false,
  "inquiry_status": "READY"
}
```

Inquiry statuses observed: `READY`, `CONNECTED`, `CLOSED`, `BOOKED`.

### GET `/v3/inquiries/{uuid}/conversation`

Get full conversation for a specific inquiry.

Response envelope: `{data: {...}}`

```json
{
  "data": {
    "inquiry_summary": {
      "inquiry_uuid": "41dc3e76-...",
      "vendor_card": { ... },
      "couple": {
        "first_name": "Meredith",
        "last_name": "Suffron",
        "email_address": "...",
        "wedding_date": 1792195200000,
        "phone_number": "...",
        "address": { "city": "Charlotte", "state_province_region": "NC" }
      },
      "summary_items": [
        { "title": "Guest Count", "value": "100 Guests" },
        { "title": "Wedding Budget", "value": "$37,500" },
        { "title": "Services", "value": "Partial planning" }
      ],
      "message": "Hello! We're getting married...",
      "inquired_at": 1775939621455
    },
    "actions": [
      { "title": "Close Inquiry", "type": "CLOSE" }
    ],
    "inquiry_status": "READY",
    "participants": [
      {
        "key": "683b9faf-...",
        "type": "VENDOR",
        "name": "DM Weddings",
        "first_name": "Debora",
        "last_name": "Biggers"
      },
      {
        "key": "abb79b9f-...",
        "type": "COUPLE",
        "name": "Meredith Suffron"
      }
    ],
    "messages": [
      {
        "type": "VENDOR_OUTREACH",
        "body": "Hi Meredith & Christopher...",
        "sent_by_participant_key": "683b9faf-...",
        "sent_at": 1775502625582,
        "new_message": false
      }
    ]
  }
}
```

Message types observed: `VENDOR_OUTREACH`, `COUPLE_OUTREACH`.

### PUT `/v3/inquiries/{uuid}/conversation/read`

Mark a conversation as read. No body (content-length: 0). Returns `{status: "success"}`.

## MCP Tools

### `list_inquiries`
- **Method/Path:** POST `/v3/inquiries/unified-inquiries` with `{}`
- **Inputs:** none
- **Logic:** Flattens the sections' `inquiries` arrays into a single list. Returns simplified objects with `inquiry_uuid`, `vendor_name`, `vendor_type`, `city`, `state_province`, `status_text`, `inquiry_status`, `unread`, `booked`, `updated_at`.
- **Returns:** JSON array of inquiry summaries.

### `get_inquiry_conversation`
- **Method/Path:** GET `/v3/inquiries/{uuid}/conversation`
- **Inputs:** `uuid` (string)
- **Returns:** Full conversation JSON including inquiry summary, participants, and messages.

### `mark_inquiry_read`
- **Method/Path:** PUT `/v3/inquiries/{uuid}/conversation/read`
- **Inputs:** `uuid` (string)
- **Returns:** Confirmation string.

## Files Changed

| File | Change |
|------|--------|
| `src/tools/inquiries.ts` | New — 3 MCP tools |
| `src/index.ts` | Wire in `registerInquiryTools(server)` |
| `tests/inquiries.test.ts` | New — 3 tests |

## Future: Reply to Inquiry

Send message endpoint not yet captured. Will be added in a future capture session where a reply is sent from the Zola app.
