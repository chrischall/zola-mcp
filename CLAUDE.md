# zola-mcp

MCP server for Zola wedding planning — vendors, budget, guests, seating, events, registry, registry items, inquiries, wedding website (content + theme), and storefront discovery. Talks to Zola's mobile API (`mobile-api.zola.com`) over Bearer JWT. Stdio transport.

## Commands

```bash
npm run build        # tsc + esbuild bundle → dist/index.js + dist/bundle.js
npm test             # vitest run
npm run test:watch   # vitest in watch mode
npm run dev          # node --env-file=.env dist/index.js (build first)
```

## Architecture

```
src/
  index.ts                MCP server entry — registers all tool modules, starts stdio transport
  client.ts               ZolaClient — Bearer JWT auth, session refresh, context resolution
  auth.ts                 resolveRefreshToken() — env var (primary) / fetchproxy fallback
  types.ts                Shared types
  tools/
    vendors.ts            list/search/add/update/remove booked vendors
    budget.ts             get budget, update budget items
    guests.ts             list/add/update/remove guest groups, update address
    seating.ts            seating charts, seat assignment, unseated guests
    inquiries.ts          vendor inquiry conversations, mark read
    events.ts             events, RSVPs, update event, gift tracker, registry summary
    event-invitations.ts  set/invite/remove which guests are invited to which events
    discover.ts           wedding dashboard, storefront search/details, favorites
    registry-items.ts     registry item CRUD
    invitations.ts        invitation/save-the-date "card" projects, suites, catalog, QR, RSVP page
    website.ts            wedding website settings
    website-content.ts    wedding website page content
    website-theme.ts      wedding website theme
```

All API calls go through `client.requestMobile()`, which hits `mobile-api.zola.com` with Bearer JWT auth and a per-process `x-zola-session-id` header (CloudFront WAF requirement). No web API, no CSRF.

Each tool file exports a `register*Tools(server)` function. `index.ts` imports and calls each one.

## Environment

```
ZOLA_REFRESH_TOKEN=<jwt>   # Primary credential. ~1-year refresh token (the `usr` cookie
                           #   from zola.com). When unset, the fetchproxy fallback
                           #   reads it from a signed-in zola.com browser tab.
ZOLA_ACCOUNT_ID=<number>   # Optional. Auto-resolved from GET /v3/users/me/context.
ZOLA_REGISTRY_ID=<string>  # Optional. Auto-resolved from same.
ZOLA_WEDDING_ID=<number>   # Optional. Auto-resolved from same. If all three are set,
                           #   the context API call is skipped entirely.
ZOLA_SESSION_TOKEN=<jwt>   # Optional. Short-lived (30 min) session token; skips initial
                           #   refresh on cold start. Auto-refresh still kicks in on 401.
ZOLA_DISABLE_FETCHPROXY=1  # Optional. Opts out of the fetchproxy fallback (headless / CI).
                           #   Without this and without ZOLA_REFRESH_TOKEN, refresh errors
                           #   out with the "set token or install extension" message.
```

Blank, `undefined`, `null`, and unsubstituted `${FOO}` placeholders are treated as unset (defends against MCP hosts that pass `.mcp.json` env blocks through unexpanded).

## Auth resolution (three-path)

`src/auth.ts` exports `resolveRefreshToken()`, which `ZolaClient.refresh()` calls each time it needs to mint a new 30-min session token. Path priority:

1. **`ZOLA_REFRESH_TOKEN` env var** — returned directly. Legacy users are unchanged.
2. **fetchproxy fallback** — calls `@fetchproxy/bootstrap` which spins up a one-shot WebSocket bridge to the fetchproxy Chrome/Safari extension and reads the HttpOnly `usr` cookie on zola.com via `chrome.cookies.get`. Returns once. All subsequent Zola API calls go direct to `mobile-api.zola.com` from Node — fetchproxy is NOT in the hot path.
3. **Error** — surface both fixes side-by-side ("set ZOLA_REFRESH_TOKEN, or install the fetchproxy extension and sign into zola.com").

This is the canonical "browser-bootstrap + Node-direct" shape shared with ofw-mcp, resy-mcp, opentable-mcp, signupgenius-mcp, …

## Testing

Tests in `tests/`. Run with `npm test`. No real network — `client.requestMobile` is stubbed via `vi.spyOn`, and `client.getContext` is mocked the same way. Shared fixtures live in `tests/_fixtures.ts`. `vitest.config.ts` enables v8 coverage but does not currently enforce a threshold.

`tests/version-sync.test.ts` is an invariant test (shared `versionSyncTest` from `@chrischall/mcp-utils/test`): every `// x-release-please-version` constant in `src/` must match `package.json`'s `version`, or CI fails. Tag any new version-bearing constant with that marker so release-please bumps it and the test asserts it.

## Plugin / Marketplace

```
.claude-plugin/
  plugin.json       Claude Code plugin manifest (skill + mcp pointers)
  marketplace.json  Marketplace catalog entry
skills/             Claude Code skill directory referenced by plugin.json (skills/<name>/SKILL.md, plugin-auto-discovered)
manifest.json       mcpb bundle manifest (built into .mcpb by Release workflow)
.mcp.json           MCP server entry for Claude Code (uses ${CLAUDE_PLUGIN_ROOT})
server.json         MCP Registry submission
mint.yaml           mcp-host hosting manifest (env / egress / state for registration)
```

The top-level `plugin.json` is a stub (`0.1.0`); the live plugin manifest is `.claude-plugin/plugin.json`.

## Publishing constraints

The MCP Registry's [server.schema.json](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json) caps `server.json`'s `description` at **100 characters**. Values over that fail `mcp-publisher publish` with HTTP 422 (`validation failed: expected length <= 100, location: body.description`). The other description fields (`manifest.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`) have no published length constraint and can stay longer.

Sanity-check before committing a description change:

```bash
jq -r '.description | length' server.json
```

## Versioning

Version appears in SIX files — all must match:

1. `package.json` → `"version"`
2. `package-lock.json` → top-level + first `packages[""]` entry (`npm version` handles both)
3. `src/index.ts` → the `VERSION` const tagged `// x-release-please-version` (fed to the `McpServer` constructor)
4. `manifest.json` → `"version"`
5. `server.json` → `"version"` and `packages[].version` (two entries)
6. `.claude-plugin/plugin.json` → `"version"`
7. `.claude-plugin/marketplace.json` → outer `metadata.version` and `plugins[].version`

### Important

Do NOT manually bump versions or create tags unless the user explicitly asks. Versioning is handled by **release-please** (`.github/workflows/release-please.yml`), which bumps every file registered under `extra-files` in `release-please-config.json` automatically.

### Release workflow

Releases are driven by **release-please** (`googleapis/release-please-action`) — there is no separate tag/bump step:

1. On every push to `main`, release-please scans Conventional-Commit messages since the last `v*` tag. `feat:`/`fix:`/etc. commits cause it to open or update a **release PR** (`chore(main): release X.Y.Z`) that bumps every version file and updates `CHANGELOG.md`.
2. The release PR is a human gate — `pr-auto-review.yml` deliberately skips it. Ship it by adding the `ready-to-merge` label (auto-merge arms it) or merging in the UI.
3. When the release PR merges, release-please creates the `vX.Y.Z` tag + GitHub Release from the changelog, then the same workflow's `publish` job runs: `npm ci` + build, package the `.skill`, `mcpb pack` the `.mcpb`, `npm publish --provenance`, MCP Registry publish (OIDC), optional ClawHub publish, and attaches the `.skill`/`.mcpb` to the release.

Because release-please keys on Conventional Commits, a PR that squash-merges **without** a `feat:`/`fix:` prefix won't trigger a release. To force a version (e.g. to ship a feature that merged without a prefix), put a `Release-As: X.Y.Z` footer in a commit on `main` — release-please proposes exactly that version on its next run. (Squash settings: title = PR title, body = PR body, so a `Release-As:` line in the PR body lands in the squashed commit.) The repo allows **squash-merge only** — `--merge` and `--rebase` are blocked at the branch-protection ruleset level, so a merged branch's commits are never ancestors of `main`.

<!-- pr-workflow:v3 -->
## Pull requests & release notes

Fleet policy — Conventional-Commit PR titles, labels, the auto-review /
auto-merge ladder, auto-review follow-up issues, PR timing, and release PRs —
lives in `~/.claude/CLAUDE.md`. Don't restate it here; the copies drifted.

Shared technical conventions (publishing, bundling, versioning guards,
write-verification, transport archetypes, testing traps) live in
[`chrischall/workflows`](https://github.com/chrischall/workflows):
`docs/fleet-conventions.md`, plus `README.md` for the CI pipeline contract.

## Gotchas

- **ESM + NodeNext**: imports must use `.js` extensions even for `.ts` source files (e.g. `import { client } from './client.js'`).
- **Build before run**: `dist/` must exist before launching the server — `tsc` produces `dist/index.js` (the `bin`) and `esbuild` bundles to `dist/bundle.js` (the MCPB entry point). `npm run build` does both.
- **Mobile API envelope**: most mobile API responses wrap data in `{ data: ... }`. Type the fetch result accordingly.
- **WAF header**: every `mobile-api.zola.com` request must carry `x-zola-session-id` (a per-process UUID set in `ZolaClient`). Drop it and CloudFront returns 403.
- **Auth retry**: `doRequest` retries once on 401 (refresh + replay) and once on 429 (2 s sleep + replay). Further failures throw.
- **Context caching**: `client.getContext()` calls `/v3/users/me/context` once per process and caches. Env vars override individual fields; setting all three (`ZOLA_ACCOUNT_ID`, `ZOLA_REGISTRY_ID`, `ZOLA_WEDDING_ID`) skips the call entirely.
- **stdio transport**: stdout is reserved for JSON-RPC. `dotenv` is loaded with `quiet: true` and wrapped in try/catch so bundled mode (no `dotenv` resolvable) silently falls back to `process.env`.
- **Plugin distribution files**: `.claude-plugin/`, `skills/`, `manifest.json`, `server.json`, and `.mcp.json` are for Claude Code / MCPB / MCP-Registry distribution — none are part of the runtime.
