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
- *"Seat Pat at Table 1"*
- *"Any new vendor messages?"*
- *"Add my cousin Mike to the guest list"*
- *"Show me the gift tracker"*

## Requirements

- [Claude Desktop](https://claude.ai/download) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Node.js](https://nodejs.org) 22 or later
- A [Zola](https://www.zola.com) account
- For the no-env-var path: the [ContextMint Bridge](https://github.com/nullnet-app/contextmint-bridge/releases) Chrome extension (Safari is not available yet — use Chrome for now)

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

#### Option A — ContextMint Bridge (recommended)

1. Install [ContextMint Bridge](https://github.com/nullnet-app/contextmint-bridge/releases) — Chrome: download the chrome zip from the latest release, unzip it, and load it unpacked at `chrome://extensions` (Developer mode on). Safari is not available yet (it will ship inside the ContextMint app, which has no public download), so use Chrome for now.

   ContextMint Bridge is the fetchproxy browser extension under its new name, from the same maintainer — fetchproxy's own README ([fetchproxy#extension](https://github.com/chrischall/fetchproxy#extension)) points to it. Its source is public at [nullnet-app/contextmint-bridge](https://github.com/nullnet-app/contextmint-bridge): build it yourself, or check a release zip against the `.sha256` file published beside it (`shasum -a 256 -c contextmint-bridge-chrome-<version>.zip.sha256`).
2. Sign in at [zola.com/account/login](https://www.zola.com/account/login) in that browser.
3. Leave `ZOLA_REFRESH_TOKEN` **unset** in your Claude config.

On the first tool call, the MCP asks the extension for the HttpOnly `usr` cookie via `chrome.cookies.get`, then operates direct-to-API from Node — the bridge is never in the hot path.

That cookie is the ~1-year refresh token, so it is cached at `$MCP_DATA_DIR/.zola-mcp/refresh-token.json` (falling back to `$HOME`, mode `0600`). Later starts read it from there and need no browser at all, which is what makes the server usable on a remote host where none exists. If the API ever rejects the cached token — you signed out, or it aged past its year — it is discarded automatically and the extension is asked again. To re-auth, just sign back in to zola.com. Set `ZOLA_TOKEN_CACHE=false` to keep nothing on disk and ask the browser every time.

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
| `ZOLA_REFRESH_TOKEN` | Conditional | Refresh token JWT (~1 year lifetime). When unset, the MCP falls back to the [ContextMint Bridge](https://github.com/nullnet-app/contextmint-bridge/releases) browser extension to read the `usr` cookie from your signed-in zola.com tab. |
| `ZOLA_DISABLE_FETCHPROXY` | No | Set to `1` to opt out of the fetchproxy fallback (headless / CI). Does not disable the token cache — a headless run can still reuse a token an earlier bootstrap cached, since reading a file is not opening a browser. |
| `ZOLA_TOKEN_CACHE` | No | Set to `false` to disable the on-disk refresh-token cache and ask the browser on every start. Defaults to enabled, and is inert when `ZOLA_REFRESH_TOKEN` is set. |
| `ZOLA_TOKEN_FILE` | No | Absolute path for the cache file. Defaults to `$MCP_DATA_DIR/.zola-mcp/refresh-token.json`, else `$HOME/.zola-mcp/refresh-token.json`. |
| `ZOLA_ACCOUNT_ID` | No | Auto-resolved from API on first use |
| `ZOLA_REGISTRY_ID` | No | Auto-resolved from API on first use |
| `MCP_CONFIRM_MODE` | No | Default `ask-user`. What a confirmed write does on a client that cannot show a confirmation prompt (claude.ai, Claude Desktop). `ask-user`: two steps — the first call writes nothing and returns a preview plus a token, and the model must get your approval in chat before calling again with it. `auto`: the same two steps, but the model may use the token after reviewing the preview itself. `refuse`: those writes are refused on such clients. A client that can show prompts (Claude Code) always gets the real prompt, unless `MCP_CONFIRM_ELICITATION=off`. An unrecognised value is treated as `refuse`. |
| `MCP_CONFIRM_ELICITATION` | No | Default `on`. `off` never sends a confirmation prompt, so every client gets the `MCP_CONFIRM_MODE` path. Set it for a client that declares it can show prompts but never does (the gated call hangs — opencode 2.0.x). Any other value stays `on`, with a stderr warning. |
| `MCP_CONFIRM_TTL_SECONDS` | No | Default `600`. How long a confirm token stays valid. |
| `MCP_CONFIRM_SECRET` | No | Signing key for confirm tokens (default: random per process). Set it only if tokens must survive a server restart. |

## Available tools

77 tools across 12 areas. The Permission column says what stands between a call and a change:

- **Auto** — read-only; runs without asking.
- **Host prompt** — a write. Clients that prompt before non-read-only tools (Claude Code, Claude Desktop) ask you first; the server itself does not, so on a client with no prompt (claude.ai) it runs on the first call.
- **Server gate** — a write that cannot be undone or that changes what guests see, so the server confirms it itself on every client.

The server-gated writes are `remove_guest`, `update_event`, `update_wedding_settings`, `remove_faq`, `remove_home_section`, `remove_poi`, `remove_travel_item`, `remove_registry_item`, `set_event_guests` and `remove_event_invitation` (`set_event_guests` only when it uninvites anyone). Each first shows a preview naming the household, event, item or page content and exactly what changes (for a slug change, the old and new website URL; a registry item on a private or passcode-gated registry, or outside the default collection, is shown by id because only the public page names it), then proceeds only once you approve — see `MCP_CONFIRM_MODE` above.

### Vendors

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_vendors` | List all booked vendors | Auto |
| `search_vendors` | Search vendors by name/category | Auto |
| `add_vendor` | Book a new vendor | Host prompt |
| `update_vendor` | Update vendor details | Host prompt |
| `remove_vendor` | Unbook a vendor | Host prompt |

### Budget

| Tool | What it does | Permission |
|------|-------------|------------|
| `get_budget` | Budget summary with all items | Auto |
| `update_budget_item` | Update cost or note | Host prompt |

### Guests

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_guests` | List all guest groups with stats — names, tier and RSVP state by default; `view: "full"` adds addresses, emails and phones | Auto |
| `add_guest` | Add a guest group | Host prompt |
| `update_guest_address` | Update mailing address | Host prompt |
| `remove_guest` | Remove a guest group (with its RSVPs and seats) | Server gate |

### Seating

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_seating_charts` | List seating charts | Auto |
| `get_seating_chart` | Chart with tables/seats/occupants | Auto |
| `list_unseated_guests` | Guests not yet seated | Auto |
| `assign_seat` | Assign guest to a seat | Host prompt |

### Inquiries

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_inquiries` | All vendor inquiries with status | Auto |
| `get_inquiry_conversation` | Full conversation messages | Auto |
| `mark_inquiry_read` | Mark as read | Host prompt |

### Events & RSVPs

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_events` | All events with RSVP counts | Auto |
| `track_rsvps` | RSVP tracking per event | Auto |
| `get_gift_tracker` | Gifts received, thank-you status | Auto |
| `get_registry` | Registry items with per-item purchase state (`requested_qty`, `purchased_qty`, `marked_fulfilled`, `availability`, `inconsistent`); paged via `limit`/`offset` | Auto |
| `update_event` | Update event details | Server gate |
| `set_event_guests` | Set which guest groups are invited to an event (bulk) | Server gate |
| `invite_guest_to_event` | Invite a single guest or guest group to an event (additive — does not affect other events) | Host prompt |
| `remove_event_invitation` | Remove an event invitation for a single guest or guest group | Server gate |

### Registry & Gifts

| Tool | What it does | Permission |
|------|-------------|------------|
| `search_registry_products` | Browse Zola products in a category, scoped to your registry | Auto |
| `add_registry_item` | Add a product (by SKU) to the registry | Host prompt |
| `update_registry_item` | Update an existing registry item — all fields must be supplied (it's a full replace) | Host prompt |
| `remove_registry_item` | Remove an item from the registry that guests shop from | Server gate |
| `reconcile_registry` | Joins the registry against the gift tracker: `DUPLICATE_RISK` (flagged fulfilled but nothing purchased — still buyable), `UNATTRIBUTED` (purchased with no order, so giver and value are lost), `ORPHAN_ORDER`, `MATCHED` | Auto |

### Wedding website — pages & settings

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_pages` | List all wedding-website pages with their IDs, types, display order, visibility, and theme info | Auto |
| `set_page_hidden` | Show or hide a page on the wedding website (e.g., hide the RSVP page until invites go out) | Host prompt |
| `reorder_pages` | Reorder pages in the website navigation | Host prompt |
| `update_page` | Update page-level metadata (title, intro copy, nav title, visibility, layout customization) | Host prompt |
| `get_wedding_settings` | Get top-level wedding settings: title, URL slug, partner names, date, city, hashtag, guest count, search visibility | Auto |
| `update_wedding_settings` | Update top-level wedding settings | Server gate |

### Wedding website — content (FAQs, home, things to do, travel)

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_faqs` | List all FAQs on the wedding website | Auto |
| `add_faq` | Add a new FAQ (question + answer) to the website FAQ page | Host prompt |
| `update_faq` | Update an existing FAQ — all three fields (question, answer, display_order) must be supplied | Host prompt |
| `remove_faq` | Remove an FAQ from the public website | Server gate |
| `list_home_sections` | List the story sections on the website home page | Auto |
| `add_home_section` | Add a story section to the home page (title + subtitle + description block) | Host prompt |
| `update_home_section` | Update a home page story section — all fields must be supplied | Host prompt |
| `remove_home_section` | Remove a story section from the public home page | Server gate |
| `list_pois` | List points-of-interest on the "Things to Do" page | Auto |
| `add_poi` | Add a point-of-interest to the Things-to-Do page (restaurant, attraction, etc.) | Host prompt |
| `update_poi` | Update a point-of-interest | Host prompt |
| `remove_poi` | Remove a point-of-interest from the public Things-to-Do page | Server gate |
| `list_travel_items` | List hotels, flights, and transportation on the website Travel page | Auto |
| `add_travel_item` | Add a travel item (hotel, flight, train, car, bus) to the Travel page | Host prompt |
| `update_travel_item` | Update a travel item | Host prompt |
| `remove_travel_item` | Remove a travel item from the public Travel page | Server gate |

### Wedding website — theme

| Tool | What it does | Permission |
|------|-------------|------------|
| `get_current_theme` | Get the currently-selected website theme: key, name, swatch color, layout type | Auto |
| `get_website_customizations` | Get current website colors, font settings, and available font/color options | Auto |
| `search_themes` | Browse the catalog of available wedding-website themes | Auto |
| `update_current_theme` | Switch the wedding website to a different theme template | Host prompt |
| `update_website_customization` | Update website colors and fonts | Host prompt |

### Invitations & save-the-dates

| Tool | What it does | Permission |
|------|-------------|------------|
| `list_card_projects` | List your invitation / save-the-date / shower-invite "card" projects (paper or digital) | Auto |
| `get_card_project` | Get full details for one invitation project including all customizations (invitation, envelope, RSVP card, details card), paper/color options, and per-customization pages | Auto |
| `validate_card_project` | Validate an invitation project — reports any text-fit, image, or guest-addressing errors per customization | Auto |
| `get_card_project_guests` | List the guest groups assigned to an invitation project, including per-group font-size overrides for printed addressing | Auto |
| `get_card_suite` | Get details for an invitation design "suite" (the family of matching invitation + RSVP + details cards), including paper types, sizes, and price range | Auto |
| `search_card_catalog` | Search the invitation design catalog | Auto |
| `list_favorite_card_suites` | List invitation design suites you have favorited (hearted) | Auto |
| `get_rsvp_page` | Get the RSVP page settings on the wedding website (title, intro copy, visibility, customization) | Auto |
| `create_card_project` | Create a new invitation project from a design suite and a lead variation (specific size/paper) | Host prompt |
| `swap_card_project_variation` | Swap one or more customizations on a project to different variations (paper type, color or size) | Host prompt |
| `set_card_project_guests` | Enable / disable guest groups for an invitation project and optionally override font sizes for printed names and addresses | Host prompt |
| `preview_card_template` | Render an invitation template preview with text substituted in | Auto |
| `preview_qrcode` | Generate a QR-code PNG for an invitation | Auto |
| `set_card_project_qrcode` | Place (or update) a QR code on a specific page of an invitation project | Host prompt |

### Discovery & health

| Tool | What it does | Permission |
|------|-------------|------------|
| `zola_healthcheck` | Verify the credential and Zola reachability; says which hop failed | Auto |
| `get_wedding_dashboard` | Planning dashboard overview | Auto |
| `search_storefronts` | Search marketplace by category/location | Auto |
| `get_storefront` | Full vendor storefront details | Auto |
| `list_favorites` | Favorited vendors | Auto |

## Troubleshooting

**"Zola auth: set ZOLA_REFRESH_TOKEN, or install the ContextMint Bridge extension…"** — either set `ZOLA_REFRESH_TOKEN` in your config or install the ContextMint Bridge extension and sign into zola.com.

**"Zola session refresh failed"** — your refresh token has expired (~1 year) or been revoked. Either capture a new `usr` cookie (DevTools) or sign back into zola.com with the ContextMint Bridge extension installed.

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
  client.ts               Zola mobile API client (auth, token refresh, context)
  index.ts                MCP server entry point
  tools/
    index.ts              TOOL_REGISTRARS — every tool module the server registers
    vendors.ts            list, search, add, update, remove vendors
    budget.ts             get budget, update budget items
    guests.ts             list, add, update, remove guests
    seating.ts            seating charts, seat assignment
    inquiries.ts          vendor inquiry conversations
    events.ts             events, RSVPs, gift tracker, registry
    event-invitations.ts  which guests are invited to which events
    registry-items.ts     registry item add / update / remove
    reconcile-registry.ts registry vs gift-tracker reconciliation
    website.ts            website pages and wedding settings
    website-content.ts    FAQs, home sections, things to do, travel
    website-theme.ts      website theme and customizations
    invitations.ts        invitation / save-the-date card projects
    discover.ts           dashboard, storefront search, favorites
    healthcheck.ts        zola_healthcheck
tests/                    one *.test.ts per module, plus manifest/docs/annotation sync tests
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

