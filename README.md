# Zola MCP

[![CI](https://github.com/chrischall/zola-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/chrischall/zola-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/zola-mcp)](https://www.npmjs.com/package/zola-mcp)
[![license](https://img.shields.io/npm/l/zola-mcp)](LICENSE)

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects Claude to [Zola](https://www.zola.com), giving you natural-language access to your wedding vendors, budget, guest list, seating chart, events, registry, inquiries, and more.

> [!WARNING]
> **AI-developed project.** This codebase was entirely built and is actively maintained by [Claude Code](https://www.anthropic.com/claude). No human has audited the implementation. Review all code and tool permissions before use.

## What you can do

Ask Claude things like:

- *"How's wedding planning going?"*
- *"Find a photographer in Charlotte, NC"*
- *"Update the venue cost to $25,000"*
- *"Who hasn't RSVP'd yet?"*
- *"Seat Jennifer at Table 1"*
- *"Any new vendor messages?"*
- *"Add my cousin Mike to the guest list"*
- *"Show me the gift tracker"*

## Requirements

- [Claude Desktop](https://claude.ai/download) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Node.js](https://nodejs.org) 20.6 or later
- A [Zola](https://www.zola.com) account
- For the no-env-var path: the [fetchproxy 0.3.0 Chrome / Safari extension](https://github.com/chrischall/fetchproxy)

## Acknowledgement of Terms

By using this MCP server, you acknowledge and agree to the following:

**1. This server accesses your own Zola account.** Auth happens via your own credentials. It does not — and cannot — access anyone else's wedding website, registry, or guest list.

**2. [Zola's Terms of Use](https://www.zola.com/terms) govern your use of this server**, just as they govern your direct use of zola.com. The clauses most relevant here:

> [You may not use] any hardware or software intended to surreptitiously intercept or otherwise obtain any information… including but not limited to the use of any "scraping" or other data mining techniques, robots or similar data gathering and extraction tools.

And, critically, on agent-acting-as-you: *"You are responsible for maintaining the confidentiality of your account and password… You accept full responsibility for all activities that occur under your account and password, **even if such actions are undertaken by your Authorized Agent or other third party**."*

You are agreeing to those terms — read by the maintainer 2026-05-23 — every time you invoke a tool in this server. Zola's ToU is explicit: this MCP acting as your Authorized Agent counts as you.

**3. Personal, non-commercial use only.** This project is not affiliated with, endorsed by, sponsored by, or in partnership with Zola, Inc. It is a personal automation tool for one couple to manage their own wedding website, registry, vendor research, and guest list. Do not use it to bulk-extract Zola's vendor directory, scrape registries, or compete with Zola.

**4. Stability is not guaranteed.** This server may call internal Zola endpoints that change without notice. It may break.

**5. You accept full responsibility** for any consequences of using this server in connection with your Zola account — rate limiting, account warnings, suspension, or any enforcement action. Per Zola's ToU, anything this MCP does under your account is your action — review guest list edits, registry changes, and inquiries before confirming. If Zola objects to your use, stop using this server.

This section is the maintainer's good-faith summary of the terms — it is not legal advice and does not modify or supersede Zola's actual ToU.

## Installation

### Option A — MCPB (recommended)

Download the latest `.mcpb` bundle from [Releases](https://github.com/chrischall/zola-mcp/releases) and install:

```bash
claude mcp add-from-mcpb zola-mcp-x.y.z.mcpb
```

You'll be prompted for your `ZOLA_REFRESH_TOKEN` (see [Getting your refresh token](#getting-your-refresh-token) below).

### Option B — npm

```bash
npx -y zola-mcp
```

Add to your Claude config (`.mcp.json` or Claude Desktop config):

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

### Option C — from source

```bash
git clone https://github.com/chrischall/zola-mcp.git
cd zola-mcp
npm install
npm run build
```

Add to Claude Desktop config:

- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "zola": {
      "command": "node",
      "args": ["/absolute/path/to/zola-mcp/dist/bundle.js"],
      "env": {
        "ZOLA_REFRESH_TOKEN": "your-refresh-token-jwt"
      }
    }
  }
}
```

### Getting your refresh token

You have two options. Both produce the same `usr` cookie value — a ~1-year JWT that doubles as the refresh token.

#### Option A — fetchproxy extension (recommended)

1. Install the [fetchproxy 0.3.0 extension](https://github.com/chrischall/fetchproxy) (Chrome Web Store or Safari `.dmg`).
2. Sign in at [zola.com/account/login](https://www.zola.com/account/login) in that browser.
3. Leave `ZOLA_REFRESH_TOKEN` **unset** in your Claude config.

On the first tool call, the MCP asks the extension for the HttpOnly `usr` cookie via `chrome.cookies.get`, then operates direct-to-API from Node. No persistent storage of the token in any env file. To re-auth (e.g. after Zola signs you out), just sign back in to zola.com.

You can opt out of this fallback with `ZOLA_DISABLE_FETCHPROXY=1` (e.g. in headless / CI environments where no extension is available).

#### Option B — manual (DevTools)

1. Sign in at [zola.com/account/login](https://www.zola.com/account/login) in any browser.
2. Open DevTools → **Application** → **Cookies** → `https://www.zola.com`.
3. Copy the value of the `usr` cookie.
4. Paste it into `.env` as `ZOLA_REFRESH_TOKEN=<value>` (or into your Claude config `env` block).

### Restart Claude Desktop

Quit completely (Cmd+Q on Mac) and relaunch.

### Verify

Ask Claude: *"How's wedding planning going?"* — it should show your wedding dashboard.

## Credentials

| Env var | Required | Notes |
|---------|----------|-------|
| `ZOLA_REFRESH_TOKEN` | Conditional | Refresh token JWT (~1 year lifetime). When unset, the MCP falls back to the [fetchproxy extension](https://github.com/chrischall/fetchproxy) to read the `usr` cookie from your signed-in zola.com tab. |
| `ZOLA_DISABLE_FETCHPROXY` | No | Set to `1` to opt out of the fetchproxy fallback (headless / CI). |
| `ZOLA_ACCOUNT_ID` | No | Auto-resolved from API on first use |
| `ZOLA_REGISTRY_ID` | No | Auto-resolved from API on first use |

## Available tools

27 tools across 8 domains. Read-only tools run automatically. Write tools ask for confirmation.

### Vendors

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_vendors` | List all booked vendors | Auto |
| `search_vendors` | Search vendors by name/category | Auto |
| `add_vendor` | Book a new vendor | Confirm |
| `update_vendor` | Update vendor details | Confirm |
| `remove_vendor` | Unbook a vendor | Confirm |

### Budget

| Tool | What it does | Permission |
|------|-------------|------------|
| `get_budget` | Budget summary with all items | Auto |
| `update_budget_item` | Update cost or note | Confirm |

### Guests

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_guests` | List all guest groups with stats | Auto |
| `add_guest` | Add a guest group | Confirm |
| `update_guest_address` | Update mailing address | Confirm |
| `remove_guest` | Remove a guest group | Confirm |

### Seating

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_seating_charts` | List seating charts | Auto |
| `get_seating_chart` | Chart with tables/seats/occupants | Auto |
| `list_unseated_guests` | Guests not yet seated | Auto |
| `assign_seat` | Assign guest to a seat | Confirm |

### Inquiries

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_inquiries` | All vendor inquiries with status | Auto |
| `get_inquiry_conversation` | Full conversation messages | Auto |
| `mark_inquiry_read` | Mark as read | Confirm |

### Events & RSVPs

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_events` | All events with RSVP counts | Auto |
| `track_rsvps` | RSVP tracking per event | Auto |
| `update_event` | Update event details | Confirm |

### Registry & Gifts

| Tool | What it does | Permission |
|------|-------------|------------|
| `get_registry` | Registry categories and items | Auto |
| `get_gift_tracker` | Gifts received, thank-you status | Auto |

### Discovery

| Tool | What it does | Permission |
|------|-------------|------------|
| `get_wedding_dashboard` | Planning dashboard overview | Auto |
| `search_storefronts` | Search marketplace by category/location | Auto |
| `get_storefront` | Full vendor storefront details | Auto |
| `list_favorites` | Favorited vendors | Auto |

## Troubleshooting

**"Zola auth: set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension…"** — either set `ZOLA_REFRESH_TOKEN` in your config or install the fetchproxy extension and sign into zola.com.

**"Zola session refresh failed"** — your refresh token has expired (~1 year) or been revoked. Either capture a new `usr` cookie (DevTools) or sign back into zola.com with the fetchproxy extension installed.

**403 from mobile API** — the `x-zola-session-id` header may be missing. Update to the latest version.

**Tools not appearing in Claude** — go to **Claude Desktop → Settings → Developer** to see connected servers. Make sure you fully quit and relaunched after editing the config.

## Security

- The refresh token lives only in your local `.env` or config file (when set) or in the user's browser cookie store (fetchproxy path)
- It is passed as an environment variable and never logged
- The server authenticates with Zola's mobile API using the same flow as the iOS app
- Account and registry IDs are auto-resolved from the API (no manual configuration needed)

## Development

```bash
npm test        # run the test suite (vitest)
npm run build   # compile TypeScript → dist/
```

### Project structure

```
src/
  client.ts         Zola mobile API client (auth, token refresh, context)
  index.ts          MCP server entry point
  tools/
    vendors.ts      list, search, add, update, remove vendors
    budget.ts       get budget, update budget items
    guests.ts       list, add, update, remove guests
    seating.ts      seating charts, seat assignment
    inquiries.ts    vendor inquiry conversations
    events.ts       events, RSVPs, gift tracker, registry
    discover.ts     dashboard, storefront search, favorites
tests/
  client.test.ts
  vendors.test.ts
  budget.test.ts
  guests.test.ts
  seating.test.ts
  inquiries.test.ts
  events.test.ts
  discover.test.ts
```

### Auth flow

All tools use the Zola mobile API (`mobile-api.zola.com`) with Bearer JWT auth:

1. `POST /v3/sessions/refresh` with refresh token JWT → returns 30-min session token
2. All API calls use `Authorization: Bearer <session_token>` + `x-zola-session-id` header
3. On 401, auto-refreshes and retries once
4. Session tokens are cached for their lifetime (30 min)

### Building the MCPB bundle

The `.mcpb` bundle is built automatically by the [Release workflow](.github/workflows/release.yml) when a version tag is pushed. To build locally:

```bash
npm run build
npx @anthropic-ai/mcpb pack
```

This produces `zola-mcp.mcpb` using the configuration in `manifest.json`. The bundle includes the compiled `dist/bundle.js` and user config prompts for `ZOLA_REFRESH_TOKEN`.

### Releasing

Releases are automated via GitHub Actions:

1. Run the **Cut & Bump** workflow (manual trigger) — tags the current version and bumps patch
2. The tag push triggers the **Release** workflow which:
   - Runs CI (build + test)
   - Packages `.skill` and `.mcpb` bundles
   - Publishes to [npm](https://www.npmjs.com/package/zola-mcp)
   - Creates a [GitHub Release](https://github.com/chrischall/zola-mcp/releases) with the bundles

## License

MIT
