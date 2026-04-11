# Zola MCP — Budget Domain Design

**Date:** 2026-04-02
**Status:** Approved

## Overview

Adds budget management tools to the Zola MCP server. Covers reading the wedding budget (items, taxonomy nodes, payments) and listing budget item types. An update tool is included but the exact body format for `PUT /web-api/v1/budgets/items/update` was unconfirmable from the browser (Next.js server actions handle the save server-side); it should be tested from the Node.js MCP context where it may succeed.

The budget API lives at `https://www.zola.com/web-api/v1/` — same base URL as the existing `request()` method on `ZolaClient`. No new client method needed.

## API Endpoints (Discovered via DevTools)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/web-api/v1/budgets/by-account` | Full budget with all taxonomy nodes and items |
| GET | `/web-api/v1/budgets/items/types` | All 33 item types with display names |
| PUT | `/web-api/v1/budgets/items/update` | Update a budget item's cost, note, or payments |

### GET `/web-api/v1/budgets/by-account` response shape

```json
{
  "uuid": "...",
  "account_id": 4664323,
  "budgeted_cents": 3000000,
  "actual_cost_cents": 2456900,
  "paid_cents": 75000,
  "balance_due_cents": 2381900,
  "taxonomy_nodes": [
    {
      "title": "Essential vendors",
      "items": [
        {
          "uuid": "8b90d700-c891-46f9-87c5-f0f8b786b457",
          "taxonomy_node_uuid": "...",
          "title": "Venue",
          "cost_cents": 2456900,
          "estimate": false,
          "estimated_cost_cents": 441411,
          "actual_cost_cents": 2456900,
          "item_type": "VENUE",
          "vendor_type": "VENUE",
          "paid_cents": 75000,
          "note": "...",
          "payments": [
            {
              "uuid": "...",
              "budget_item_uuid": "...",
              "payment_type": "DEPOSIT",
              "amount_cents": 75000,
              "note": null,
              "paid_at": 1743019200000,
              "due_at": 1737676800000,
              "remind_at": null
            }
          ]
        }
      ]
    }
  ]
}
```

### GET `/web-api/v1/budgets/items/types` response shape

```json
[
  {
    "budget_item_type": "VENUE",
    "display_name": "Venue",
    "vendor_type": "VENUE",
    "searchable_vendor_type": "VENUE",
    "display_order": 1
  }
]
```

### PUT `/web-api/v1/budgets/items/update` request body (best-guess)

The UI saves via a Next.js server action (no browser-side fetch). Best-guess body based on form fields (`actual_cost_cents`, `note`) and item structure:

```json
{
  "uuid": "8b90d700-c891-46f9-87c5-f0f8b786b457",
  "actual_cost_cents": 2456900,
  "note": "...",
  "payments": []
}
```

**Note:** This endpoint consistently returns `{"error":{"message":"Unprocessable Entity","code":500}}` from the browser regardless of body format. From the MCP server (Node.js, direct HTTP), it may succeed. The tool should surface the raw error if it fails.

## Architecture

### No client changes needed

`ZolaClient.request<T>(method, path, body?)` already supports GET and PUT to `https://www.zola.com`. No new method required.

### New file: `src/tools/budget.ts`

Exports `registerBudgetTools(server: McpServer)`. Tool handlers call `client.request()` and return structured results.

### Updated: `src/index.ts`

Imports and calls `registerBudgetTools(server)` alongside `registerVendorTools(server)`.

## MCP Tools

### `get_budget`
- **Method/Path:** GET `/web-api/v1/budgets/by-account`
- **Inputs:** none
- **Returns:** Budget summary (total budgeted, actual, paid) plus all taxonomy nodes with their items. Each item includes `uuid`, `title`, `item_type`, `cost_cents`, `actual_cost_cents`, `paid_cents`, `note`, payment count.

### `list_budget_item_types`
- **Method/Path:** GET `/web-api/v1/budgets/items/types`
- **Inputs:** none
- **Returns:** All 33 budget item types with `budget_item_type`, `display_name`, `vendor_type`, `display_order`.

### `update_budget_item`
- **Method/Path:** PUT `/web-api/v1/budgets/items/update`
- **Inputs:** `uuid` (string, required), `actual_cost_cents?` (number), `note?` (string)
- **Logic:** Calls `get_budget` first to load current item values, merges provided fields, PUTs. Throws if uuid not found. Surfaces raw API error message if server returns non-OK.
- **Returns:** Confirmation string with item title and updated values (response body from Zola may be empty on success).

## Error Handling

Follows existing pattern — `request()` throws on non-OK with status + method + path. `update_budget_item` throws descriptively if uuid not found in budget.

## Testing

`tests/budget.test.ts` mocks `ZolaClient.request` at the boundary. One test per tool:
- `get_budget` — returns parsed budget with taxonomy nodes and items
- `list_budget_item_types` — returns all types
- `update_budget_item` — calls get first, merges fields, PUTs correct payload
- `update_budget_item` (not found) — throws when uuid missing from budget

## Files Changed

| File | Change |
|------|--------|
| `src/tools/budget.ts` | New — 3 MCP tools |
| `src/index.ts` | Wire in `registerBudgetTools(server)` |
| `tests/budget.test.ts` | New — unit tests |
