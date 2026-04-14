# Zola MCP

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
- [Google Chrome](https://www.google.com/chrome/) — used once for the scripted auth flow (optional; you can copy the cookie manually instead)

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

Sign in to zola.com and capture the `usr` cookie — a ~1-year JWT that doubles as the refresh token. The token lasts ~1 year; this is a one-time setup.

#### Option A — scripted (recommended)

```bash
npm run auth               # prints the token to the console
npm run auth -- .env       # writes ZOLA_REFRESH_TOKEN=<token> to .env
```

Launches Chrome with a dedicated profile at `~/.zola-mcp/chrome-profile`, waits for you to sign in at `zola.com/account/login`, captures the `usr` cookie (a ~1-year JWT), and either prints it (for pasting into Claude Desktop / MCPB / any config that doesn't read `.env`) or writes it to the file you pass. Requires Google Chrome installed locally; the script will install `puppeteer-core` on first run (~1 MB).

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

Only one credential is required:

| Env var | Required | Notes |
|---------|----------|-------|
| `ZOLA_REFRESH_TOKEN` | Yes | Refresh token JWT (~1 year lifetime). Run `npm run auth` to capture via browser login, or copy the `usr` cookie from DevTools. |
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

**"ZOLA_REFRESH_TOKEN must be set"** — run `npm run auth` to capture your token.

**"Zola session refresh failed"** — your refresh token has expired (~1 year). Re-run `npm run auth`.

**403 from mobile API** — the `x-zola-session-id` header may be missing. Update to the latest version.

**Tools not appearing in Claude** — go to **Claude Desktop → Settings → Developer** to see connected servers. Make sure you fully quit and relaunched after editing the config.

## Security

- The refresh token lives only in your local `.env` or config file
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
