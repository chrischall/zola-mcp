# Website Editing — Design

**Date:** 2026-05-15
**Status:** Draft — pending implementation plan

## Goal

Expose the couple's wedding-website editing surface as MCP tools so the LLM can read and modify site settings, page structure, and the three primary content types (home page story sections, FAQs, and points of interest).

## Scope

In scope — endpoints captured from the Zola iOS app (mitmproxy, 2026-05-15):

- **Wedding settings** (top-level): title, slug, partner/owner names, wedding date, city, hashtag, guest count, search engine visibility.
- **Page structure**: list pages, edit per-page metadata, hide/show, reorder.
- **Home page story sections**: list / add / update / remove.
- **FAQs**: list / add / update / remove.
- **Points of interest** ("Things to Do"): list / add / update / remove.

**Deferred** — not captured this session, add when captured:

- Theme / design writes (template swap, color palette, font choices). Read endpoints exist: `GET /v3/websites/current-theme`, `GET /v3/websites/website-customizations/context`, `GET /v3/websites/website-layouts`. No write captures.
- Image / photo uploads for pages (header / footer images, photo gallery).
- Travel page content (text + accommodations).
- Wedding party members (`/v3/websites/wedding-party-members/...`).
- RSVPs and registry-on-website endpoints (registry-edit tools live elsewhere).

## Architecture

Two new tool files plus their tests, following existing repo patterns:

```
src/tools/website.ts           # wedding settings + page structure
src/tools/website-content.ts   # home sections + FAQs + POIs
tests/website.test.ts
tests/website-content.test.ts
```

**Why this split.** Groups A (wedding settings) and B (page structure) are site-level config touching wedding and page records directly. Groups C / D / E share an identical CRUD pattern (list / add / update / delete-by-page+entity) over three entity types — keeping them together exposes the symmetry, lets tests share fixtures, and lets a shared private helper handle the unified DELETE.

**No client changes expected.** `client.requestMobile()` already handles auth and JSON. The plan step will verify `client.getContext()` exposes `wedding_id` (distinct from `weddingAccountId`); if not, extend it.

## Tools

### `src/tools/website.ts` (6 tools)

| Tool | Args | Endpoint |
|---|---|---|
| `get_wedding_settings` | — | derived from `client.getContext()` / user context |
| `update_wedding_settings` | partial of `title`, `slug`, `owner_first_name`, `owner_last_name`, `partner_first_name`, `partner_last_name`, `wedding_date`, `city`, `state_province`, `hashtag`, `guest_count`, `enable_search_engine`, `enable_search_zola` | `PUT /v3/weddings/{wedding_id}` — fetch current, merge args, PUT full body |
| `list_pages` | — | `GET /v3/websites/pages/wedding-accounts/full` |
| `update_page` | `page_id`, optional `title`, `nav_title`, `menu_title`, `intro_copy`, `description`, `hidden`, `customization` (passthrough) | `PUT /v3/websites/pages-v2/{page_id}` |
| `set_page_hidden` | `page_id`, `hidden: boolean` | `PUT /v3/websites/pages/{page_id}/hidden/{hidden}` |
| `reorder_pages` | `page_ids: number[]` (full ordered list) | `PUT /v3/websites/pages/wedding-accounts/{acct}/reorder`, body `{ids: page_ids}` |

`set_page_hidden` overlaps with `update_page`, but the dedicated endpoint takes a different shape and avoids a full-page round trip. Worth its own tool.

### `src/tools/website-content.ts` (12 tools)

Three entity types, four tools each. All three share the same DELETE endpoint shape.

**Home page sections** (Our Story blocks):

| Tool | Endpoint |
|---|---|
| `list_home_sections` | `GET /v3/websites/home-sections/wedding-accounts/{acct}` |
| `add_home_section` | `POST /v3/websites/home-sections` |
| `update_home_section` | `PUT /v3/websites/home-sections/{id}` |
| `remove_home_section` | `DELETE /v3/websites/pages/{page_id}/entities/{entity_id}/wedding-accounts/{acct}` |

Add body: `{wedding_account_id, homepage_entity_id: 0, title, subtitle, description, display_order, hidden}`.
Update body: same fields plus `homepage_entity_id`, `updated_at`, `page_entity_updated_at`.

**FAQs**:

| Tool | Endpoint |
|---|---|
| `list_faqs` | `GET /v3/websites/faqs/wedding-accounts/{acct}` |
| `add_faq` | `POST /v3/websites/faqs` |
| `update_faq` | `PUT /v3/websites/faqs/{id}` |
| `remove_faq` | `DELETE /v3/websites/pages/{page_id}/entities/{entity_id}/wedding-accounts/{acct}` |

Add body: `{wedding_account_id, faq_entity_id: 0, question, answer, display_order}`.
Update body: same plus `faq_entity_id`, `updated_at`, `page_entity_updated_at`.

**Points of interest** ("Things to Do"):

| Tool | Endpoint |
|---|---|
| `list_pois` | `GET /v3/websites/points-of-interest/wedding-accounts/{acct}` |
| `add_poi` | `POST /v3/websites/points-of-interest` |
| `update_poi` | `PUT /v3/websites/points-of-interest/{id}` |
| `remove_poi` | `DELETE /v3/websites/pages/{page_id}/entities/{entity_id}/wedding-accounts/{acct}` |

Add body: `{wedding_account_id, poi_entity_id: 0, title, description, display_order, address1, address2, city, state_province, postal_code, country_code, latitude, longitude, google_place_id?, contact_phone?, url?}`. `google_place_id` and coordinates are optional — Zola accepts manual addresses.

**Shared private helper** in `website-content.ts`:

```ts
async function deletePageEntity(pageType: 'HOME' | 'FAQ' | 'POI', entityId: number): Promise<unknown>
```

Looks up `page_id` via a cached call to `GET /v3/websites/pages/wedding-accounts/full` (keyed by wedding_account_id), then issues the DELETE. Page IDs are stable per wedding, so the cache safely lives for the process lifetime.

## Data flow

- All tools return `{content: [{type: 'text', text: JSON.stringify(payload, null, 2)}]}`.
- For reads, return the unwrapped `data` field.
- For mutations, return the server's `data` echo (it includes the saved entity with assigned IDs and timestamps), so the LLM can confirm and reuse IDs.
- Re-use the existing `MobileEnvelope<T>` interface from `events.ts` for response unwrapping.

## Error handling

Propagate everything from `client.requestMobile`. No per-tool try/catch. `update_wedding_settings`'s fetch-merge step has no special handling — if either call fails, surface the error.

## Testing

Vitest with mocked `client.requestMobile`, matching the existing test files.

`tests/website.test.ts`:
- happy path for each of the 6 tools
- `update_wedding_settings` test asserts the GET-then-PUT sequence with merged body

`tests/website-content.test.ts`:
- happy path for all 4 FAQ CRUD ops (canonical entity type)
- one happy path each for home-section and POI add/update to confirm field-name differences
- one test for the page-id cache: two consecutive remove calls produce one `list_pages` call

## Open questions resolved

- **Wedding ID source**: confirmed in captures — `account_id: 7585875` and `wedding_id: 7585869` are distinct from `wedding_account_id: 4664323`. Plan must add `wedding_id` to client context if not already present.
- **POI `google_place_id` required?**: No — make optional. Add-tool accepts manual address.
- **Theme writes**: deferred. See "Deferred" in Scope.
