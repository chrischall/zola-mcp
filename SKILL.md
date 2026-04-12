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
| `list_vendors` | List all booked vendors with details |
| `search_vendors` | Search for vendors by name within a category |
| `add_vendor` | Book a new vendor |
| `update_vendor` | Update a booked vendor's details |
| `remove_vendor` | Unbook a vendor |

### Budget (2 tools)
| Tool | Description |
|------|-------------|
| `get_budget` | Get wedding budget summary with all items |
| `update_budget_item` | Update a budget item's cost or note |

### Guests (4 tools)
| Tool | Description |
|------|-------------|
| `list_guests` | List all guest groups with stats |
| `add_guest` | Add a new guest group (household) |
| `update_guest_address` | Update a guest group's mailing address |
| `remove_guest` | Remove a guest group |

### Seating (4 tools)
| Tool | Description |
|------|-------------|
| `list_seating_charts` | List all seating charts |
| `get_seating_chart` | Get chart with tables, seats, and occupants |
| `list_unseated_guests` | List guests not yet assigned a seat |
| `assign_seat` | Assign a guest to a specific seat |

### Inquiries (3 tools)
| Tool | Description |
|------|-------------|
| `list_inquiries` | List all vendor inquiries with status |
| `get_inquiry_conversation` | Get full conversation for an inquiry |
| `mark_inquiry_read` | Mark an inquiry conversation as read |

### Events & RSVPs (3 tools)
| Tool | Description |
|------|-------------|
| `list_events` | List all wedding events with RSVP counts |
| `track_rsvps` | Get RSVP tracking per event |
| `update_event` | Update event details (time, venue, dress code) |

### Registry & Gifts (2 tools)
| Tool | Description |
|------|-------------|
| `get_registry` | View the wedding registry with categories |
| `get_gift_tracker` | View gifts received, values, thank-you status |

### Discovery (4 tools)
| Tool | Description |
|------|-------------|
| `get_wedding_dashboard` | Get wedding planning dashboard overview |
| `search_storefronts` | Search vendor marketplace by category/location |
| `get_storefront` | Get full vendor storefront details |
| `list_favorites` | List all favorited/saved vendors |

## Workflows

- **"How's wedding planning going?"** → `get_wedding_dashboard`
- **"Who hasn't RSVP'd?"** → `track_rsvps`
- **"Find a photographer in Charlotte"** → `search_storefronts` with `taxonomy_node_id: 2, city: Charlotte, state: NC`
- **"Seat Jennifer at Table 1"** → `list_unseated_guests` → `get_seating_chart` → `assign_seat`
- **"Any new vendor messages?"** → `list_inquiries` (filter unread) → `get_inquiry_conversation`
- **"Update the venue cost to $25,000"** → `get_budget` → `update_budget_item`
- **"Add my cousin Mike to the guest list"** → `add_guest`

## Notes

- All tools use the Zola mobile API (`mobile-api.zola.com`) with Bearer JWT auth
- Account and registry IDs are auto-resolved from the API on first use
- Refresh token expires after ~1 year; re-run `setup-auth.sh` to renew
