# zola-mcp

MCP server for Zola wedding planning — vendors, budget, guests, seating, events, registry, inquiries, and discovery.

## Commands

```bash
npm run build        # tsc + esbuild bundle
npm test             # vitest run
npm run test:watch   # vitest in watch mode
```

## Architecture

```
src/
  index.ts          MCP server entry point — registers all tool modules, starts stdio transport
  client.ts         ZolaClient — mobile API auth (Bearer JWT), token refresh, context resolution
  tools/
    vendors.ts      list, search, add, update, remove booked vendors
    budget.ts       get budget, update budget items
    guests.ts       list, add, update address, remove guest groups
    seating.ts      seating charts, seat assignment, unseated guests
    inquiries.ts    vendor inquiry conversations, mark read
    events.ts       events, RSVPs, update event, gift tracker, registry
    discover.ts     wedding dashboard, storefront search, favorites
```

All tools use `client.requestMobile()` which hits `mobile-api.zola.com` with Bearer JWT auth. No web API or CSRF tokens.

Each tool file exports handler functions and a `register*Tools(server)` function. `index.ts` imports and calls each registration function.

## Environment

```
ZOLA_REFRESH_TOKEN=<jwt>   # Required. Mobile API refresh token (~1 year). Run ./scripts/setup-auth.sh
ZOLA_ACCOUNT_ID=<number>   # Optional. Auto-resolved from GET /v3/users/me/context
ZOLA_REGISTRY_ID=<string>  # Optional. Auto-resolved from GET /v3/users/me/context
```

## Testing

Tests in `tests/`. Run with `npm test`. No real API calls — `client.requestMobile` is mocked via `vi.spyOn`. Context is mocked via `vi.spyOn(client, 'getContext')`.

## Plugin / Marketplace

```
.claude-plugin/
  plugin.json       Claude Code plugin manifest
  marketplace.json  Marketplace catalog entry
skills/
  zola/SKILL.md     Claude Code skill — teaches Claude when/how to use the tools
SKILL.md            Full skill reference with setup, tools table, and workflows
manifest.json       mcpb bundle manifest
.mcp.json           MCP server configuration for Claude Code
```

## Versioning

Version appears in FOUR places — all must match:

1. `package.json` → `"version"`
2. `package-lock.json` → run `npm install --package-lock-only` after changing package.json
3. `src/index.ts` → `McpServer` constructor `version` field
4. `manifest.json` → `"version"`

### Important

Do NOT manually bump versions or create tags unless the user explicitly asks. Versioning is handled by the **Cut & Bump** GitHub Action.

### Release workflow

Main is always one version ahead of the latest tag. To release, run the **Cut & Bump** GitHub Action (`cut-and-bump.yml`) which:

1. Runs CI (build + test)
2. Tags the current commit with the current version
3. Bumps patch in all four files
4. Rebuilds, commits, and pushes main + tag
5. The tag push triggers the **Release** workflow (CI + npm publish + GitHub release)

## Gotchas

- **ESM + NodeNext**: imports must use `.js` extensions even for `.ts` source files.
- **Mobile API envelope**: all mobile API responses wrap data in `{data: ...}` — types use `MobileEnvelope<T>`.
- **CloudFront WAF**: requires `x-zola-session-id` header (random UUID) on all `mobile-api.zola.com` requests.
- **Context caching**: `client.getContext()` calls `/v3/users/me/context` once, then caches. Env vars override.
- **Build before run**: `dist/` must exist before running the server.
- **Plugin files**: `.claude-plugin/`, `skills/`, `SKILL.md`, and `manifest.json` are for Claude Code plugin distribution — not part of the MCP runtime.
