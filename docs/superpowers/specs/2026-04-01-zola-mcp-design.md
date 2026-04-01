# Zola MCP Server — Design Spec

**Date:** 2026-04-01  
**Status:** Approved

## Overview

An MCP server that lets Claude interact with Zola.com on behalf of a logged-in user. Covers all major Zola domains (registry, guests, checklist, seating, wedding website) with read-write access. Built iteratively — one domain per session as API endpoints are discovered via browser DevTools.

No official Zola public API exists. The server targets Zola's internal web API at `https://www.zola.com/web-api/v1/...`, reverse-engineered from browser network traffic.

## Architecture

Mirrors the ofw-mcp project structure exactly.

```
zola-mcp/
├── src/
│   ├── client.ts       # ZolaClient — auth, token management, request()
│   ├── index.ts        # MCP server entrypoint, tool registration
│   └── tools/
│       ├── registry.ts
│       ├── guests.ts
│       ├── checklist.ts
│       ├── seating.ts
│       └── website.ts
├── tests/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env                # ZOLA_EMAIL, ZOLA_PASSWORD
```

**Stack:** TypeScript, `@modelcontextprotocol/sdk`, `dotenv`, `vitest`, `esbuild`.

## Authentication

- Credentials: `ZOLA_EMAIL` and `ZOLA_PASSWORD` in `.env`
- `ZolaClient` logs in against Zola's internal login endpoint (exact endpoint captured via DevTools)
- Stores Bearer token with expiry; auto-refreshes when within 5 minutes of expiry
- Retry-on-401: re-authenticates once and retries the failed request
- Retry-on-429: waits 2 seconds and retries once

## Data Flow

```
Claude → MCP tool handler (index.ts) → ZolaClient.request() → Zola internal API → parsed response → MCP content
```

Each domain's tools live in their own file under `src/tools/`. Tool handlers are thin — they call `client.request()` and return structured results. No business logic in tool handlers.

## Domain Coverage

Built iteratively, one domain per session:

1. **Registry** — list items, view reservations/purchases, add/remove items, mark purchased
2. **Guests** — list guests, view RSVP status, update RSVPs, add/remove guests
3. **Checklist** — list tasks, check/uncheck items, add tasks
4. **Seating** — view tables, assign/move guests
5. **Wedding website** — read content (write support depends on what the API exposes)

Each domain session: user captures DevTools network traffic → shares requests → tools + tests written.

## Error Handling

| Scenario | Behavior |
|---|---|
| 401 Unauthorized | Re-login once, retry request; throw if still 401 |
| 429 Rate Limited | Wait 2s, retry once; throw if still 429 |
| Other non-OK response | Throw descriptive error with status + method + path |
| Missing env vars | Throw on first request with clear message naming the missing var |

## Testing

- Unit tests mock `ZolaClient` at the boundary — no live API calls in tests
- Each `src/tools/*.ts` file has a corresponding test file
- Auth logic (`client.ts`) tested separately with mocked `fetch`
- Test runner: `vitest`

## Development Workflow

Per domain:
1. User clicks through that section of Zola with DevTools Network tab open
2. User pastes relevant requests (URL, method, headers, body, response) into the conversation
3. Tools + tests written for that domain
4. Build passes, tests pass, domain is shipped

## Out of Scope

- Integration tests against the live Zola API
- Vendor/vendor management features
- Budget tracking (unless discovered as part of checklist API)
- Any Zola feature not accessible via their internal web API
