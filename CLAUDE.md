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
    discover.ts           wedding dashboard, storefront search/details, favorites
    registry-items.ts     registry item CRUD
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

## Plugin / Marketplace

```
.claude-plugin/
  plugin.json       Claude Code plugin manifest (skill + mcp pointers)
  marketplace.json  Marketplace catalog entry
skills/             Claude Code skill directory referenced by plugin.json
SKILL.md            Skill reference exported by the .skill bundle (Release workflow)
manifest.json       mcpb bundle manifest (built into .mcpb by Release workflow)
.mcp.json           MCP server entry for Claude Code (uses ${CLAUDE_PLUGIN_ROOT})
server.json         MCP Registry submission
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
3. `src/index.ts` → `McpServer` constructor `version:` literal
4. `manifest.json` → `"version"`
5. `server.json` → `"version"` and `packages[].version` (two entries)
6. `.claude-plugin/plugin.json` → `"version"`
7. `.claude-plugin/marketplace.json` → outer `metadata.version` and `plugins[].version`

### Important

Do NOT manually bump versions or create tags unless the user explicitly asks. Versioning is handled by the **Tag & Bump** GitHub Action (`.github/workflows/tag-and-bump.yml`), which walks every JSON version field automatically.

### Release workflow

Main is always one version ahead of the latest tag. Releasing means running the **Tag & Bump** workflow, which:

1. Runs CI (build + test) via `ci.yml`
2. Tags the current commit with the current `package.json` version
3. `npm version patch --no-git-tag-version`, then a node script that walks every JSON version field; also `sed`s `src/index.ts`
4. Rebuilds, commits `chore: bump version to vX.Y.Z`, pushes main and the tag
5. The tag push triggers `release.yml`: build, `.skill` zip, `.mcpb` pack, `npm publish --provenance`, MCP Registry publish, optional ClawHub publish, GitHub Release with `generate_release_notes: true`

<!-- pr-workflow:v1 -->
## Pull requests & release notes

**Default workflow: branch + PR, even for solo work.** Direct pushes to `main` skip review *and* skip auto-generated release notes — GitHub's `generate_release_notes` (configured in `.github/release.yml`) only picks up merged PRs. Push directly to `main` only when the user explicitly asks for it (e.g. emergency hotfix).

For every PR, apply exactly one label so it lands in the right release-notes section:

| Label                | Section in release notes |
|----------------------|--------------------------|
| `enhancement`        | Features                 |
| `bug`                | Bug Fixes                |
| `security`           | Security                 |
| `refactor`           | Refactor                 |
| `documentation`      | Documentation            |
| `test`               | Tests                    |
| `dependencies`       | Dependencies             |
| `ci` / `github_actions` | CI & Build            |
| *(none / unmatched)* | Other Changes            |
| `ignore-for-release` | Hidden from notes        |

The **PR title** becomes the bullet — write it like a user-facing changelog entry, not internal shorthand. Conventional-commit prefixes are still fine in commit messages, but the PR title should read clean.

Open with `gh pr create --label <label>` (or `--label ignore-for-release` for chores not worth a line), then **immediately** run `gh pr merge <num> --auto --squash` so the PR merges as soon as CI passes. The repo allows squash-merge only (no merge commit, no rebase) — don't pass `--merge`/`--rebase` or the call will fail.

## Gotchas

- **ESM + NodeNext**: imports must use `.js` extensions even for `.ts` source files (e.g. `import { client } from './client.js'`).
- **Build before run**: `dist/` must exist before launching the server — `tsc` produces `dist/index.js` (the `bin`) and `esbuild` bundles to `dist/bundle.js` (the MCPB entry point). `npm run build` does both.
- **Mobile API envelope**: most mobile API responses wrap data in `{ data: ... }`. Type the fetch result accordingly.
- **WAF header**: every `mobile-api.zola.com` request must carry `x-zola-session-id` (a per-process UUID set in `ZolaClient`). Drop it and CloudFront returns 403.
- **Auth retry**: `doRequest` retries once on 401 (refresh + replay) and once on 429 (2 s sleep + replay). Further failures throw.
- **Context caching**: `client.getContext()` calls `/v3/users/me/context` once per process and caches. Env vars override individual fields; setting all three (`ZOLA_ACCOUNT_ID`, `ZOLA_REGISTRY_ID`, `ZOLA_WEDDING_ID`) skips the call entirely.
- **stdio transport**: stdout is reserved for JSON-RPC. `dotenv` is loaded with `quiet: true` and wrapped in try/catch so bundled mode (no `dotenv` resolvable) silently falls back to `process.env`.
- **Plugin distribution files**: `.claude-plugin/`, `skills/`, `SKILL.md`, `manifest.json`, `server.json`, and `.mcp.json` are for Claude Code / MCPB / MCP-Registry distribution — none are part of the runtime.
