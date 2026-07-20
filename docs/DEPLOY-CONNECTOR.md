# Deploying the Zola remote connector

This is the operator runbook for standing up `zola-mcp` as a hosted Cloudflare
Worker — a "remote connector" that anyone you share the URL with can add to
claude.ai (web, desktop, or mobile), each logging in with their own Zola refresh
token. The setup below is a manual, one-time (per operator) process — none of it
can be done by an agent, since it requires your own Cloudflare account. Once it's
done, deploys are automated: the `deploy-connector` job in `release-please.yml`
redeploys the Worker at every release tag (via the shared
`chrischall/workflows` reusable workflow), and **Actions → deploy-connector →
Run workflow** deploys any ref on demand.

If you just want the server on your own machine talking only to your own Zola
account, you don't need any of this — see the main [README](../README.md) for the
local stdio / `.mcpb` install instead, which is the desktop-only alternative to
running a shared connector.

## Prerequisites

- A Cloudflare account (free tier is fine).
- Node and this repo checked out with dependencies installed (`npm install`).
- **No app-level Zola API keys are required.** Unlike some connectors, Zola has
  no operator-shared `client_id` / `client_secret`. Each user authenticates with
  their own **Zola refresh token** (the long-lived `usr` cookie value from
  zola.com — see below), collected by the connector's own OAuth login page
  (step 4) — you never handle anyone's Zola token.

### Where a user gets their Zola refresh token (the `usr` cookie)

Zola's mobile API mints short-lived (30-min) session tokens by exchanging a
long-lived (~1-year) refresh JWT. That refresh JWT is the value of the `usr`
cookie set on `zola.com` once you're signed in. To read it:

1. Sign in at <https://www.zola.com> in a desktop browser.
2. Open DevTools → **Application** (Chrome) / **Storage** (Firefox) → **Cookies**
   → `https://www.zola.com`.
3. Copy the **Value** of the `usr` cookie. (It's an HttpOnly cookie, so it isn't
   visible to page JavaScript, but DevTools shows it.) That value is the refresh
   token the connector's login page asks for.

## Steps

### 1. Log in to Cloudflare

```sh
npx wrangler login
```

This opens a browser to authorize the CLI against your Cloudflare account.

### 2. Create the OAuth KV namespace

The connector stores OAuth state and per-user session data (including each user's
encrypted Zola refresh token) in a KV namespace bound as `OAUTH_KV` (see
`wrangler.jsonc`).

```sh
npx wrangler kv namespace create zola-connector-oauth
```

The command prints something like:

```
{ "binding": "OAUTH_KV", "id": "abcd1234..." }
```

Copy the returned `id` into `wrangler.jsonc`, replacing the
`"REPLACE_WITH_OAUTH_KV_NAMESPACE_ID"` placeholder:

```jsonc
"kv_namespaces": [{ "binding": "OAUTH_KV", "id": "abcd1234..." }],
```

### 3. Deploy

```sh
npm run worker:deploy
```

This runs `wrangler deploy`, which builds and pushes `src/worker.ts` (plus the
`ZolaMcpAgent` per-session agent Durable Object binding, and the `OAUTH_KV`
namespace from step 2). On success it prints the deployed URL:

```
https://zola-connector.<your-subdomain>.workers.dev
```

Because `wrangler.jsonc` also declares a custom-domain route
(`connector.zola.nullnet.app`, matching ofw-mcp's `connector.ofw.nullnet.app`
and splitwise-mcp's `connector.splitwise.nullnet.app`), the connector is
additionally served at:

```
https://connector.zola.nullnet.app
```

Use the custom domain as the stable production URL you share. (The zone must be
in the deploying Cloudflare account; if it isn't, remove the `routes` entry from
`wrangler.jsonc` and use the `*.workers.dev` URL instead.) Note whichever URL you
use — it's what gets added as a connector, with `/mcp` appended.

> **Stateless — no cache Durable Object.** Zola reads always hit the live API, so
> unlike the OFW connector there is no per-user cache: the only Durable Object is
> `ZolaMcpAgent` (the per-session MCP agent), declared in `wrangler.jsonc` with a
> `v1` SQLite migration applied automatically by `wrangler deploy`.

Before deploying to production, you can sanity-check the Worker locally with:

```sh
npm run worker:dev
```

confirm it bundles without deploying:

```sh
npx wrangler deploy --dry-run
```

This local `wrangler deploy` is only needed for the first deploy (and for
debugging). Afterwards CI owns it: every release redeploys the Worker at its tag,
and `Actions → deploy-connector → Run workflow` redeploys any ref on demand —
both using the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets.

and run the Worker-specific test suite (Miniflare / real Workers runtime) with:

```sh
npm run worker:test
```

### 4. Add it as a connector in claude.ai

1. Go to claude.ai → **Settings** → **Connectors** → **Add custom connector**.
2. Paste the deployed URL with `/mcp` appended — the custom domain
   `https://connector.zola.nullnet.app/mcp` (or, without a custom domain,
   `https://zola-connector.<your-subdomain>.workers.dev/mcp`).
3. Claude will open the connector's login page (served by the Worker at
   `/authorize`) and prompt for a **Zola refresh token** (the `usr` cookie value
   from step 0). The token is verified by minting a session against Zola's mobile
   API before the session is created — an invalid/expired token is rejected on
   the login page.

This connector is unlisted: it only shows up for people you've explicitly shared
the URL with, not in any public directory. Anyone with the URL who supplies their
own valid Zola refresh token can use it under their own account.

### 5. Verify on the mobile Claude app

Connectors added on claude.ai sync to all clients for that account, including the
**mobile Claude app**. On mobile:

1. Confirm the connector appears (Settings → Connectors) and shows as connected.
2. Run a read, e.g. ask Claude to run `get_budget` or `list_events`.
3. Run a low-stakes write to confirm the write tools are wired up.

If both work, the deploy is verified end-to-end.

## How auth works

- There are **no operator-level Zola credentials.** Zola has no shared app
  `client_id` / `client_secret`; the connector authenticates each user
  individually.
- Each **user** who adds the connector logs in with their *own* Zola refresh
  token (the `usr` cookie value), via the login page the Worker serves at
  `/authorize`. The token is verified (a session mint against
  `mobile-api.zola.com`) before the session is created.
- That refresh token is stored **encrypted at rest** in the OAuth provider's
  KV-backed "props" (`OAUTH_KV`), scoped to that user's session. It is
  long-lived (~1 year), so — unlike a short-lived password login — the stored
  token is used directly to build a per-user `ZolaClient` on each request, which
  exchanges it for a fresh 30-min session token as needed. It is used only to
  call Zola on that user's behalf, never for anything else.

## Rotation / teardown

There are no operator secrets to rotate for Zola auth (users manage their own
refresh tokens; a user rotates by re-adding the connector with a fresh `usr`
cookie value — for example after signing out everywhere invalidates the old one).

Tear down the whole connector:

```sh
npx wrangler kv namespace delete --namespace-id <id-from-step-2>
```

then delete the Worker itself from the Cloudflare dashboard (Workers &
Pages → `zola-connector` → Settings → Delete), or via:

```sh
npx wrangler delete
```

Deleting the KV namespace invalidates every stored user session — everyone who
had added the connector will need to log in again with their token if it's
redeployed.
