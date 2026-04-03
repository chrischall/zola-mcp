---
name: zola-mcp
description: This skill should be used when the user asks about Zola wedding planning data. Triggers on phrases like "check Zola", "Zola registry", "wedding checklist", "Zola guests", "RSVP status", "Zola budget", or any request involving wedding registry, guest list, checklist items, or budget tracking on Zola.
---

# zola-mcp

MCP server for Zola — provides access to wedding registry, guest list, checklist, and budget tools.

- **npm:** [npmjs.com/package/zola-mcp](https://www.npmjs.com/package/zola-mcp)
- **Source:** [github.com/chrischall/zola-mcp](https://github.com/chrischall/zola-mcp)

## Setup

### Option A — Claude Code (direct MCP, no mcporter)

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "zola": {
      "command": "npx",
      "args": ["-y", "zola-mcp"],
      "env": {
        "ZOLA_REFRESH_TOKEN": "your-usr-cookie-value",
        "ZOLA_GUID": "your-guid-cookie-value"
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

#### Configure credentials

Open Zola in Chrome → DevTools → Application → Cookies → www.zola.com, then copy:
- `usr` cookie value → `ZOLA_REFRESH_TOKEN`
- `guid` cookie value → `ZOLA_GUID`

```bash
cp .env.example .env
# Edit .env: set ZOLA_REFRESH_TOKEN and ZOLA_GUID
```

Optionally set `ZOLA_SESSION_TOKEN` (the `us` cookie) to skip the initial refresh round-trip. It will be ignored if expired.

## Credentials

| Env var | Cookie | Notes |
|---------|--------|-------|
| `ZOLA_REFRESH_TOKEN` | `usr` | ~1-year JWT; required |
| `ZOLA_GUID` | `guid` | 90-day signed cookie; required |
| `ZOLA_SESSION_TOKEN` | `us` | 30-min JWT; optional performance hint |

## Tools

*(Tools will be listed here as they are implemented.)*
