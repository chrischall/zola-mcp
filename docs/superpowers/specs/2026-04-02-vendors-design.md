# Zola MCP — Vendors Domain Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

Adds vendor management tools to the Zola MCP server. Covers listing, searching, adding, updating, and removing booked vendors from a user's wedding planning page.

The vendors API lives at `https://www.zola.com/web-marketplace-api/` — a different base URL than the `web-api/v1` used by other domains. Auth and CSRF handling is identical.

## API Endpoints (Discovered via DevTools)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/account/get-or-create-vendors` | List all vendor slots (booked and unbooked) |
| PUT | `/v2/account/vendor/{uuid}` | Update vendor details or booked status |
| POST | `/v1/vendor-search/name-prefix-query` | Search Zola marketplace by vendor name prefix |

**Key insight:** Zola pre-creates vendor slots by type (`VENUE`, `PHOTOGRAPHER`, `FLORIST`, etc.). There is no true CREATE or DELETE. "Adding" a vendor means finding the matching unbooked slot and PUTting `booked: true`. "Removing" means PUTting `booked: false`.

### PUT request body shape

```json
{
  "vendorType": "VENUE",
  "booked": true,
  "bookingSource": "BOOKED_VENDORS",
  "eventDate": null,
  "referenceVendorRequest": {
    "id": null,
    "name": "Rooftop 230 at The Doubletree by Hilton",
    "email": null,
    "address": { "city": "Charlotte", "stateProvince": "NC" }
  },
  "priceCents": 2456900,
  "facetKeys": []
}
```

### Vendor slot shape (from list response)

```json
{
  "uuid": "db7a1901-bd37-4f9c-9b5e-25a657ed3ad2",
  "vendorType": "VENUE",
  "vendorName": "Rooftop 230 at The Doubletree by Hilton",
  "booked": true,
  "bookedAt": 1769044686387,
  "priceCents": 2456900,
  "eventDate": null,
  "priority": 0,
  "referenceVendorId": 1467337,
  "referenceVendorUuid": "e2b40b42-1578-4bd2-85b2-3a2ad69e6df2",
  "vendorCard": { ... }
}
```

### Search result shape

```json
{
  "id": "...",
  "uuid": "...",
  "name": "AAM Entertainment Group",
  "email": "aamentandpromotions@gmail.com",
  "address": { "city": "Charlotte", "stateProvince": "NC" },
  "storefrontUuid": "...",
  "taxonomyNodeId": "...",
  "websiteUrl": "...",
  "phone": "..."
}
```

## Architecture

### Client changes (`src/client.ts`)

Add `requestMarketplace<T>(method, path, body?)` to `ZolaClient`. Identical to `request()` but uses `https://www.zola.com/web-marketplace-api` as base URL. Session and CSRF handling is shared — no duplication.

```
ZolaClient.requestMarketplace() → doRequest() [same internal method, different base URL]
```

### New file: `src/tools/vendors.ts`

Exports `registerVendorTools(server: McpServer)`. Tool handlers are thin — they call `client.requestMarketplace()` and return structured results.

### Updated: `src/index.ts`

Imports and calls `registerVendorTools(server)`.

## MCP Tools

### `list_vendors`
- **Method/Path:** POST `/v1/account/get-or-create-vendors`
- **Inputs:** none
- **Returns:** All vendor slots (booked and unbooked), with `uuid`, `vendorType`, `vendorName`, `booked`, `priceCents`, `eventDate`

### `search_vendors`
- **Method/Path:** POST `/v1/vendor-search/name-prefix-query`
- **Inputs:** `prefix` (string) — vendor name prefix to search
- **Returns:** Matching Zola marketplace vendors with name, email, city, state, storefrontUuid

### `add_vendor`
- **Method/Path:** PUT `/v2/account/vendor/{uuid}`
- **Inputs:** `vendorType` (string), `name` (string), `city` (string), `stateProvince` (string), `email?` (string), `priceCents?` (number), `eventDate?` (string ISO date)
- **Logic:** Calls `list_vendors` first to find the unbooked slot matching `vendorType`. Errors if no unbooked slot found for that type.
- **Returns:** Updated vendor slot

### `update_vendor`
- **Method/Path:** PUT `/v2/account/vendor/{uuid}`
- **Inputs:** `uuid` (string), `name?`, `city?`, `stateProvince?`, `email?`, `priceCents?`, `eventDate?`
- **Logic:** Calls `list_vendors` to get current values, merges with provided fields, PUTs the result
- **Returns:** Updated vendor slot

### `remove_vendor`
- **Method/Path:** PUT `/v2/account/vendor/{uuid}`
- **Inputs:** `uuid` (string)
- **Logic:** PUTs with `booked: false`, clears name/address/price
- **Returns:** Updated vendor slot (now unbooked)

## Error Handling

Follows existing pattern — `requestMarketplace()` throws on non-OK with status + method + path. `add_vendor` throws a descriptive error if no unbooked slot exists for the requested vendor type.

## Testing

`tests/vendors.test.ts` mocks `ZolaClient.requestMarketplace` at the boundary. One test per tool:
- `list_vendors` — returns parsed slot list
- `search_vendors` — passes prefix, returns results
- `add_vendor` — finds unbooked slot, PUTs correct payload
- `add_vendor` (error) — throws when no unbooked slot for type
- `update_vendor` — merges fields, PUTs correct payload
- `remove_vendor` — PUTs `booked: false`

## Files Changed

| File | Change |
|------|--------|
| `src/client.ts` | Add `requestMarketplace<T>()` method |
| `src/tools/vendors.ts` | New — 5 MCP tools |
| `src/index.ts` | Wire in `registerVendorTools(server)` |
| `tests/vendors.test.ts` | New — unit tests |
