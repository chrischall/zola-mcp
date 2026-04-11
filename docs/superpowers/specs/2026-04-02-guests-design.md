# Zola MCP — Guests Domain Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

Adds guest list management tools to the Zola MCP server. Covers listing guest groups (households), adding a new guest group, updating a guest group's mailing address, and removing a guest group.

**Key architectural discovery:** The guests page is a legacy React SPA (`/vwassets/` bundle), NOT Next.js. All API calls are browser-side fetches. The routing at the nginx level routes to the API backend when the request includes `Content-Type: application/json` — without this header, the same URL returns the SPA HTML shell. All mutation endpoints use POST (not GET/PUT/DELETE at the path level), including list operations.

The guest API lives at `https://www.zola.com/web-api/` — same base URL as `ZolaClient.request()`. No new client method needed.

## Data Model

### Guest Group (household)
```json
{
  "id": 152644475,
  "uuid": "8617a2b9-d179-41df-805b-6aa28b33da1f",
  "wedding_account_id": 4664323,
  "email_address": null,
  "home_phone": null,
  "mobile_phone": null,
  "address_1": "3839 N Alta Vista Terrace",
  "address_2": null,
  "city": "Chicago",
  "state_province": "IL",
  "postal_code": "60613",
  "country_code": "US",
  "affiliation": "PRIMARY_FRIEND",
  "tier": "A",
  "invited": true,
  "invitation_sent": false,
  "save_the_date_sent": false,
  "envelope_recipient": "Jennifer Acerra and Jason Shuba",
  "envelope_recipient_override": "Jennifer Acerra and Jason Shuba",
  "addressing_style": "SEMI_FORMAL",
  "guests": [
    {
      "id": 12345,
      "guest_group_id": 152644475,
      "relationship_type": "PRIMARY",
      "prefix": null,
      "first_name": "Jennifer",
      "middle_name": null,
      "family_name": "Acerra",
      "suffix": null,
      "printed_name": null,
      "source": "MANUAL",
      "rsvp": null,
      "email_address": null,
      "phone_number": null,
      "event_invitations": []
    }
  ],
  "rsvp_question_answers": []
}
```

### List response envelope
```json
{
  "guest_groups": [...],
  "facets": [...],
  "selected_facet_bucket_keys": [...],
  "global_stats": [
    {"key": "invited_guests", "label": "Definitely Invited", "value": 193},
    {"key": "guests", "label": "In List", "value": 193},
    {"key": "addresses_missing", "label": "Missing Addresses", "value": 0},
    {"key": "adults", "label": "Adults", "value": 183},
    {"key": "children", "label": "Children", "value": 10}
  ]
}
```

## API Endpoints (Discovered via JS bundle `/vwassets/new2/static/js/main.a645511a.js`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/web-api/v1/guestgroup/list/all` | List all guest groups (requires `Content-Type: application/json`) |
| POST | `/web-api/v1/guestgroup` | Create a new guest group |
| POST | `/web-api/v1/guestgroup/delete` | Delete guest groups by ID array |
| PUT | `/web-api/v2/guestgroup/{id}/address` | Update mailing address for a guest group |
| GET | `/web-api/v1/guestgroup/id/{id}` | Get a specific guest group by numeric ID |

**Critical:** All endpoints that return JSON require `Content-Type: application/json` in the request headers. Without it, nginx routes the request to the SPA and returns HTML. `ZolaClient.request()` already adds `content-type: application/json` when a body is present; for bodyless POST requests we must still send the header.

### POST `/web-api/v1/guestgroup/list/all` — request body

Empty object works; optional filter/sort fields accepted:
```json
{}
```

### POST `/web-api/v1/guestgroup` — request body shape

Based on JS bundle analysis and guest group data model:
```json
{
  "guests": [
    {
      "first_name": "Jennifer",
      "family_name": "Acerra",
      "relationship_type": "PRIMARY"
    },
    {
      "first_name": "Jason",
      "family_name": "Shuba",
      "relationship_type": "CHILD"
    }
  ],
  "email_address": "jennifer@example.com",
  "mobile_phone": "555-123-4567",
  "affiliation": "PRIMARY_FRIEND",
  "invited": true
}
```

### POST `/web-api/v1/guestgroup/delete` — request body

```json
{
  "ids": [152644475, 152644468]
}
```

Confirmed: `{"ids": []}` returns 200 with empty body (no-op).

### PUT `/web-api/v2/guestgroup/{id}/address` — request body

```json
{
  "address_1": "3839 N Alta Vista Terrace",
  "address_2": null,
  "city": "Chicago",
  "state_province": "IL",
  "postal_code": "60613",
  "country_code": "US"
}
```

## Architecture

### Client changes (`src/client.ts`)

Add overload to `request()` to support sending `Content-Type: application/json` on bodyless POST requests. Currently the header is only added when `body !== undefined`. The list endpoint needs POST with no payload body but with the content-type header. Simplest fix: pass `body: {}` (empty object) for those calls — the server ignores it.

**No client changes required** — passing `{}` as body to `request('POST', path, {})` will include `Content-Type: application/json` automatically.

### New file: `src/tools/guests.ts`

Exports `registerGuestTools(server: McpServer)`. Tool handlers call `client.request()`.

### Updated: `src/index.ts`

Imports and calls `registerGuestTools(server)` alongside existing registrations.

## MCP Tools

### `list_guests`
- **Method/Path:** POST `/web-api/v1/guestgroup/list/all`
- **Inputs:** none
- **Returns:** Summary stats (total guests, adults, children, missing addresses) plus all guest groups. Each group includes `id`, `uuid`, `invited`, `affiliation`, `tier`, `email_address`, `mobile_phone`, address fields, and `guests` array with each member's name and RSVP status.

### `add_guest`
- **Method/Path:** POST `/web-api/v1/guestgroup`
- **Inputs:** `first_name` (string), `last_name` (string), `plus_one_first_name?` (string), `plus_one_last_name?` (string), `email?` (string), `phone?` (string), `affiliation?` (string, default `"PRIMARY_FRIEND"`)
- **Logic:** Builds guest group object with primary guest (relationship_type: `"PRIMARY"`) and optional plus-one (relationship_type: `"CHILD"`), POSTs it.
- **Returns:** Created guest group object.

### `update_guest_address`
- **Method/Path:** PUT `/web-api/v2/guestgroup/{id}/address`
- **Inputs:** `id` (number), `address_1?`, `address_2?`, `city?`, `state_province?`, `postal_code?`, `country_code?` (string, default `"US"`)
- **Logic:** Calls `list_guests` to get current address, merges provided fields, PUTs result.
- **Returns:** Updated guest group.

### `remove_guest`
- **Method/Path:** POST `/web-api/v1/guestgroup/delete`
- **Inputs:** `id` (number) — numeric guest group ID
- **Returns:** Confirmation string.

## Error Handling

Follows existing pattern — `request()` throws on non-OK with status + method + path. `update_guest_address` throws if `id` not found in list. `remove_guest` throws if `id` not found in list (before calling delete).

## Testing

`tests/guests.test.ts` mocks `ZolaClient.request` at the boundary. One test per tool:
- `list_guests` — returns parsed stats and guest groups
- `add_guest` — builds correct body with primary guest
- `add_guest` with plus one — includes second guest with CHILD relationship
- `update_guest_address` — loads current, merges fields, PUTs
- `remove_guest` — POSTs correct ids array

## Files Changed

| File | Change |
|------|--------|
| `src/tools/guests.ts` | New — 4 MCP tools |
| `src/index.ts` | Wire in `registerGuestTools(server)` |
| `tests/guests.test.ts` | New — unit tests |
