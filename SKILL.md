---
name: zola-mcp
description: This skill should be used when the user asks about Zola wedding planning data. Triggers on phrases like "check Zola", "Zola vendors", "wedding budget", "Zola guests", "RSVP status", "seating chart", "vendor inquiries", "wedding registry", "gift tracker", or any request involving wedding vendors, guest list, budget, seating, events, registry, or inquiry management on Zola.
---

# zola-mcp

MCP server for Zola — 27 tools for managing your entire wedding via the Zola mobile API.

- **npm:** [npmjs.com/package/zola-mcp](https://www.npmjs.com/package/zola-mcp)
- **Source:** [github.com/chrischall/zola-mcp](https://github.com/chrischall/zola-mcp)

## Setup

### Option A — Claude Code (direct MCP)

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "zola": {
      "command": "npx",
      "args": ["-y", "zola-mcp"],
      "env": {
        "ZOLA_REFRESH_TOKEN": "your-refresh-token-jwt"
      }
    }
  }
}
```

### Option B — from source

```bash
git clone https://github.com/chrischall/zola-mcp
cd zola-mcp
npm install && npm run build
```

### Getting your refresh token

Run the setup script (requires mitmproxy and the Zola iOS app):

```bash
./scripts/setup-auth.sh
```

This captures a mobile API refresh token (~1 year lifetime) from the Zola iOS app via mitmproxy. One-time setup.

## Credentials

| Env var | Required | Notes |
|---------|----------|-------|
| `ZOLA_REFRESH_TOKEN` | Yes | Mobile API JWT refresh token (~1 year lifetime) |
| `ZOLA_ACCOUNT_ID` | No | Auto-resolved from API; optional override |
| `ZOLA_REGISTRY_ID` | No | Auto-resolved from API; optional override |

## Tools

### Vendors (5 tools)
| Tool | Description |
|------|-------------|
| `zola_list_vendors` | List all booked vendors with details |
| `zola_search_vendors` | Search for vendors by name within a category |
| `zola_add_vendor` | Book a new vendor |
| `zola_update_vendor` | Update a booked vendor's details |
| `zola_remove_vendor` | Unbook a vendor |

### Budget (2 tools)
| Tool | Description |
|------|-------------|
| `zola_get_budget` | Get wedding budget summary with all items |
| `zola_update_budget_item` | Update a budget item's cost or note |

### Guests (4 tools)
| Tool | Description |
|------|-------------|
| `zola_list_guests` | List all guest groups with stats |
| `zola_add_guest` | Add a new guest group (household) |
| `zola_update_guest_address` | Update a guest group's mailing address |
| `zola_remove_guest` | Remove a guest group |

### Seating (4 tools)
| Tool | Description |
|------|-------------|
| `zola_list_seating_charts` | List all seating charts |
| `zola_get_seating_chart` | Get chart with tables, seats, and occupants |
| `zola_list_unseated_guests` | List guests not yet assigned a seat |
| `zola_assign_seat` | Assign a guest to a specific seat |

### Inquiries (3 tools)
| Tool | Description |
|------|-------------|
| `zola_list_inquiries` | List all vendor inquiries with status |
| `zola_get_inquiry_conversation` | Get full conversation for an inquiry |
| `zola_mark_inquiry_read` | Mark an inquiry conversation as read |

### Events & RSVPs (3 tools)
| Tool | Description |
|------|-------------|
| `zola_list_events` | List all wedding events with RSVP counts |
| `zola_track_rsvps` | Get RSVP tracking per event |
| `zola_update_event` | Update event details (time, venue, dress code) |

### Registry & Gifts (2 tools)
| Tool | Description |
|------|-------------|
| `zola_get_registry` | View the wedding registry with categories |
| `zola_get_gift_tracker` | View gifts received, values, thank-you status |

### Discovery (4 tools)
| Tool | Description |
|------|-------------|
| `zola_get_wedding_dashboard` | Get wedding planning dashboard overview |
| `zola_search_storefronts` | Search vendor marketplace by category/location |
| `zola_get_storefront` | Get full vendor storefront details |
| `zola_list_favorites` | List all favorited/saved vendors |

## Workflows

- **"How's wedding planning going?"** → `zola_get_wedding_dashboard`
- **"Who hasn't RSVP'd?"** → `zola_track_rsvps`
- **"Find a photographer in Charlotte"** → `zola_search_storefronts` with `taxonomy_node_id: 2, city: Charlotte, state: NC`
- **"Seat Jennifer at Table 1"** → `zola_list_unseated_guests` → `zola_get_seating_chart` → `zola_assign_seat`
- **"Any new vendor messages?"** → `zola_list_inquiries` (filter unread) → `zola_get_inquiry_conversation`
- **"Update the venue cost to $25,000"** → `zola_get_budget` → `zola_update_budget_item`
- **"Add my cousin Mike to the guest list"** → `zola_add_guest`

## Notes

- All tools use the Zola mobile API (`mobile-api.zola.com`) with Bearer JWT auth
- Account and registry IDs are auto-resolved from the API on first use
- Refresh token expires after ~1 year; re-run `setup-auth.sh` to renew
