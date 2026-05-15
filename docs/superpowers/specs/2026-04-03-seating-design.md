# Zola MCP — Seating Domain Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Adds seating chart management tools to the Zola MCP server. The seating feature is iOS-only in Zola's UI; API traffic was captured via mitmproxy.

**Key architectural difference:** The seating API lives at `https://mobile-api.zola.com/v3/` — a completely separate base from the web API. It uses `Authorization: Bearer <JWT>` instead of cookies, and requires mobile-specific headers. The JWT is the same session token (`us` cookie value) already managed by `ZolaClient`. No CSRF needed for mutations.

**Client change required:** Add `requestMobile<T>(method, path, body?)` to `ZolaClient` that calls `ensureSession()`, sets `Authorization: Bearer <sessionToken>`, `x-zola-platform-type: iphone_app`, `x-zola-user-session-id: <session_id from JWT payload>`, and hits `https://mobile-api.zola.com/v3/`.

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v3/seating-charts/summaries` | List all seating charts |
| GET | `/v3/seating-charts/{uuid}` | Get full chart with tables and seats |
| POST | `/v3/guestlists/directory/wedding-accounts/{account_id}` | Guest directory with uuid per guest |
| PUT | `/v3/seating-charts/seats` | Assign a guest to a seat |

### GET `/v3/seating-charts/summaries` response
```json
[
  {
    "uuid": "97b217b4-3a8d-45de-a2e7-ee8a1415327c",
    "name": "Reception",
    "event_id": 5108495
  }
]
```
(May be empty `[]` if no charts exist.)

### GET `/v3/seating-charts/{uuid}` response
```json
{
  "uuid": "97b217b4-...",
  "name": "Reception",
  "event_id": 5108495,
  "width": 3000,
  "height": 3000,
  "tables": [
    {
      "uuid": "3eca2fd9-...",
      "seating_chart_uuid": "97b217b4-...",
      "shape": "CIRCLE",
      "name": "Table 1",
      "color": "FDAA9A",
      "num_seats": 8,
      "seats": [
        {
          "uuid": "433292df-...",
          "table_uuid": "3eca2fd9-...",
          "seating_chart_uuid": "97b217b4-...",
          "occupant": {
            "display_name": "Jennifer Acerra",
            "initials": "JA",
            "affiliation": "PRIMARY_FRIEND",
            "relationship_type": "PRIMARY",
            "rsvp_type": "NO_RESPONSE",
            "guest_uuid": "0fef22b9-...",
            "guest_group_id": 152644475
          }
        }
      ],
      "x": 1434, "y": 1289
    }
  ],
  "objects": []
}
```

### POST `/v3/guestlists/directory/wedding-accounts/{account_id}` request/response
Request body: `{"sort_by_name_asc": true}`

Response envelope: `{"data": {"num_invited_guests": 193, "guest_groups": [...]}}`

Each guest_group has a `guests` array where each guest has:
```json
{
  "guest": {
    "guest_id": 280379459,
    "uuid": "0fef22b9-f8dc-4d55-9b01-329299b5485c",
    "first_name": "Jennifer",
    "family_name": "Acerra",
    "relationship_type": "PRIMARY",
    "rsvp": "NO_RESPONSE"
  },
  "seating_chart_seat": null
}
```
The `seating_chart_seat` field is non-null when the guest is already seated:
```json
{
  "seating_chart_seat": {
    "seat_uuid": "433292df-...",
    "table_uuid": "3eca2fd9-...",
    "seating_chart_uuid": "97b217b4-...",
    "table_name": "Table 1"
  }
}
```

### PUT `/v3/seating-charts/seats` request body
```json
{
  "guest_uuid": "0fef22b9-f8dc-4d55-9b01-329299b5485c",
  "seat_uuid": "433292df-4577-4c66-b2e6-0e5036d0d5e9",
  "table_uuid": "3eca2fd9-be1c-4201-b7dd-e5809eb4dbac",
  "seating_chart_uuid": "97b217b4-3a8d-45de-a2e7-ee8a1415327c"
}
```
Response: full seating chart object (same as GET by uuid).

## Architecture

### Client changes (`src/client.ts`)

Add `requestMobile<T>(method, path, body?)` method to `ZolaClient`:
- Calls `ensureSession()` to get a valid session token
- Does NOT call `ensureCsrf()` (mobile API doesn't use CSRF)
- Extracts `session_id` from JWT payload (base64 decode middle segment)
- Sets headers:
  - `Authorization: Bearer <sessionToken>`
  - `x-zola-platform-type: iphone_app`
  - `x-zola-user-session-id: <session_id>`
  - `accept: application/json`
  - `content-type: application/json` (when body present)
- Base URL: `https://mobile-api.zola.com`
- Handles 401 retry (same as existing pattern) and 429 retry
- Does NOT include `cookie` header or `x-csrf-token`

Also export `WEDDING_ACCOUNT_ID` constant from client (needed by seating tools to call guestlists/directory). Value: `4664323` (from the captured requests). But this is dynamic — better to extract it from the existing JWT sub claim or from an env var `ZOLA_ACCOUNT_ID`. Simplest: add `getAccountId()` method that reads `ZOLA_ACCOUNT_ID` env var (throw if missing), or use a known hardcoded approach. **Design decision:** require `ZOLA_ACCOUNT_ID` env var, throw descriptive error if missing.

### New file: `src/tools/seating.ts`

Exports `registerSeatingTools(server: McpServer)` and handler functions.

### Updated: `src/index.ts`

Imports and calls `registerSeatingTools(server)`.

## MCP Tools

### `list_seating_charts`
- **Method/Path:** GET `/v3/seating-charts/summaries`
- **Inputs:** none
- **Returns:** Array of `{uuid, name, event_id}` for each chart.

### `get_seating_chart`
- **Method/Path:** GET `/v3/seating-charts/{uuid}`
- **Inputs:** `uuid` (string)
- **Returns:** Full chart with tables, seat counts, and occupant info per seat (display_name, guest_uuid, rsvp_type).

### `list_unseated_guests`
- **Method/Path:** POST `/v3/guestlists/directory/wedding-accounts/{account_id}`
- **Inputs:** none
- **Logic:** Calls directory, filters to guests where `seating_chart_seat === null`. Returns list of `{guest_uuid, first_name, family_name, guest_group_id}`.
- **Returns:** Array of unseated guests with their uuid for use in assign_seat.

### `assign_seat`
- **Method/Path:** PUT `/v3/seating-charts/seats`
- **Inputs:** `guest_uuid` (string), `seat_uuid` (string), `table_uuid` (string), `seating_chart_uuid` (string)
- **Logic:** All four UUIDs required. Use `get_seating_chart` to find available seat UUIDs and `list_unseated_guests` to find guest UUIDs.
- **Returns:** Confirmation string with guest display name and table name.

## Error Handling

Follows existing pattern — `requestMobile()` throws on non-OK with status + method + path. `assign_seat` surfaces the raw error if the API rejects (e.g. seat already taken, guest already seated).

## Environment Variables

- `ZOLA_ACCOUNT_ID` — numeric wedding account ID (required for `list_unseated_guests`). Value is `4664323` for this account.

## Testing

`tests/seating.test.ts` mocks `client.requestMobile` via `vi.spyOn`. One test per tool:
- `listSeatingCharts` — returns parsed summaries array
- `getSeatingChart` — returns chart with tables and seats including occupant info
- `listUnseatedGuests` — filters directory to unseated guests only
- `assignSeat` — calls PUT with correct body, returns confirmation

## Files Changed

| File | Change |
|------|--------|
| `src/client.ts` | Add `requestMobile()` method |
| `src/tools/seating.ts` | New — 4 MCP tools |
| `src/index.ts` | Wire in `registerSeatingTools(server)` |
| `tests/seating.test.ts` | New — unit tests |
