# Missing Features — Zola MCP Gap Analysis

**Generated:** 2026-05-15 (updated after second capture session)
**Sources:** two mitmproxy capture sessions on 2026-05-15 — `/tmp/zola-website-capture.mitm` (website read/edit) and `/tmp/zola-final-capture.mitm` (theme/design, travel, registry item CRUD). Cross-referenced against `src/tools/*.ts` and the deferred-items list in `2026-05-15-website-editing-design.md`.

This document lists every distinct Zola feature or endpoint for which we have captured evidence (or a clear prior plan) but have not yet exposed as an MCP tool. After the second capture session, **theme, customization, travel, and registry-item writes are no longer "needs new capture" — bodies are known and listed below.** Items still requiring new captures are limited to wedding-party CRUD, photo gallery, inquiry reply.

---

## Events

**`create_event`**
- Endpoint: `POST https://mobile-api.zola.com/v3/websites/events`
- Useful: Lets the assistant add new events (rehearsal dinner, farewell brunch, etc.) without opening the app.
- Status: Captured but unused. The POST body shape can be inferred from the existing `update_event` PUT body (same fields). The DELETE eligibility check (`POST .../deletion-eligibility`) was also captured and should be checked before issuing a delete.

**`delete_event`**
- Endpoint: `DELETE https://mobile-api.zola.com/v3/websites/events/{uuid}/wedding-accounts/{acct}`
- Useful: Removes a cancelled event from the website.
- Status: Captured but unused. Note the DELETE uses the event UUID (not integer ID) and requires the wedding-account ID in the path — different from the PUT which uses integer event_entity_id.

---

## Wedding Website — Theme & Design (now fully captured)

**`get_current_theme`**
- Endpoint: `GET /v3/themes/current` (also `/v3/websites/current-theme` — slightly different shape)
- Returns: full theme object — `key`, `name`, `swatch_color`, layout assets (PDP/PLP images), layout types.
- Status: Captured (read only), no tool implemented.

**`search_themes`**
- Endpoint: `POST /v3/themes/search`
- Body: `{ limit, offset, theme_layout_types: ["MULTI_PAGE" | "SINGLE_PAGE"] }`
- Returns: paginated theme list with facets (style, color, season). Use to let the assistant offer alternatives.
- Status: Captured, no tool implemented.

**`update_current_theme`**
- Endpoint: `PUT /v3/themes/current`
- Body: `{ theme_key: string, theme_layout_type: "MULTI_PAGE" | "SINGLE_PAGE" }`
- Action: Switches the website to a different theme template.
- Status: Captured, no tool implemented.

**`get_website_customizations`**
- Endpoint: `GET /v3/websites/website-customizations/context`
- Returns: current colors, font selections, layout customizations + the full menu of available fonts and color presets.
- Status: Captured (read), no tool implemented.

**`update_website_customization`**
- Endpoint: `POST /v3/websites/website-customizations/context` (POST acts as PATCH)
- Body (partial — send only what changes):
  ```json
  {
    "accent_color": "B20033",
    "background_color": "B51A00",
    "body_font": { "color": "000000" },
    "navigation_customization": { "background_color": "B51A00" }
  }
  ```
  Other fields seen: `header_font: { font_family_id, ... }`. The endpoint accepts any subset.
- Status: Captured, no tool implemented.

**`list_website_layouts`**
- Endpoint: `GET /v3/websites/website-layouts`
- Returns: the catalog of available layouts (different from themes — controls page structure).
- Status: Captured (read only), no tool implemented.

---

## Wedding Website — Photos & Media

**`get_website_photos`**
- Endpoint: `GET https://mobile-api.zola.com/v3/websites/photos/wedding-accounts/{acct}`
- Useful: Lists photos currently displayed on the website (photo gallery / header images).
- Status: Captured (read only), no tool implemented.

**Photo upload / management writes (e.g., `add_website_photo`, `remove_website_photo`)**
- Endpoint: Needs new capture (POST/DELETE to `/v3/websites/photos/...`)
- Useful: Adds or removes photos from the wedding website photo gallery.
- Status: Needs new capture. Upload likely involves multipart form or a separate media upload endpoint. Not seen in current capture.

**Website animations / effects**
- Endpoints: `GET /web-api/v1/website-effect`, `GET /web-registry-api/v1/product/website-animations`
- Useful: Reports what visual effects/animations are active on the site. Write would require new capture.
- Status: Read endpoints captured via `www.zola.com` web APIs, no mobile-api write captured.

---

## Wedding Website — Travel Page (now fully captured — full CRUD)

Travel items are hotels, flights, transportation notes — distinct from POIs (Things to Do). The DELETE endpoint follows the same shared shape as FAQs/home-sections/POIs.

**`list_travel_items`**
- Endpoint: `GET /v3/websites/travel/wedding-accounts/{acct}`
- Status: Captured, no tool.

**`add_travel_item`**
- Endpoint: `POST /v3/websites/travel`
- Body:
  ```json
  {
    "travel_entity_id": 0,
    "wedding_account_id": <number>,
    "type": "HOTEL" | "FLIGHT" | "TRAIN" | ...,
    "name": "DoubleTree Suites...",
    "address1": "...", "address2": "", "city": "...", "state_province": "...",
    "postal_code": "...", "country_code": "US",
    "contact_number": "...", "email_address": "", "url": "https://...",
    "note": "", "code": "",
    "source": "GOOGLE_PLACES" | "MANUAL",
    "timezone": "America/New_York",
    "display_order": 0
  }
  ```
- Status: Captured, no tool.

**`update_travel_item`**
- Endpoint: `PUT /v3/websites/travel/{travel_entity_id}`
- Body: same shape as add, plus `updated_at` and `page_entity_updated_at` millis.
- Status: Captured, no tool.

**`remove_travel_item`**
- Endpoint: `DELETE /v3/websites/pages/{travel_page_id}/entities/{travel_entity_id}/wedding-accounts/{acct}` — same shape as the existing entity-delete helper, just with `'TRAVEL'` added to the `PageType` union and the page-id cache.
- Status: Captured, no tool. Reuse the existing `deletePageEntity` helper in `website-content.ts`.

---

## Wedding Website — Wedding Party

**`list_wedding_party`**
- Endpoint: `GET https://mobile-api.zola.com/v3/websites/wedding-party-members/wedding-accounts/{acct}`
- Useful: Returns bridesmaids, groomspeople, and other wedding party members displayed on the website.
- Status: Captured (read only), no tool implemented, deferred per `2026-05-15-website-editing-design.md`.

**Wedding party CRUD (e.g., `add_wedding_party_member`, `update_wedding_party_member`, `remove_wedding_party_member`)**
- Endpoint: Needs new capture (POST/PUT/DELETE to `/v3/websites/wedding-party-members/...`)
- Useful: Manages the wedding party page without opening the app.
- Status: Needs new capture.

---

## Wedding Website — RSVPs (Read)

**`get_website_rsvps`**
- Endpoint: `GET https://mobile-api.zola.com/v3/websites/rsvps/wedding-accounts/{acct}`
- Useful: Returns RSVP page configuration — different from `track_rsvps` which returns per-event counts. Likely includes RSVP deadline and custom question config.
- Status: Captured (read only), no tool implemented.

**`get_website_wedding_registries`**
- Endpoint: `GET https://mobile-api.zola.com/v3/websites/wedding-registries/wedding-accounts/{acct}`
- Useful: Shows which registries are linked to the website (may differ from the full registry data in `get_registry`).
- Status: Captured (read only), no tool implemented.

---

## Guests — Bulk Operations

**Bulk directory update**
- Endpoint: `PUT https://mobile-api.zola.com/v3/guestlists/groups/wedding-accounts/{acct}/bulk/directory`
- Useful: Updates multiple guest groups in one call — useful for address import or bulk tier changes.
- Status: Captured but unused. Body shape unknown without inspecting the full capture body.

---

## Registry

## Registry (now fully captured)

**`add_registry_item`**
- Endpoint: `POST /v3/registries/{registry_id}/collections/{collection_id}`
- Body: `{ sku_id, quantity, most_wanted, enable_group_gifting }`
- Returns: full collection-item object including new `collection_item_id`.
- Note: caller needs the `sku_id` (Zola product variant). To support a "from product" UX, also expose product search (below).

**`update_registry_item`**
- Endpoint: `PUT /v3/registries/{registry_id}/items/{collection_item_id}`
- Body: `{ quantity, group_gift, marked_fulfilled, personal_note, most_wanted, collection_id }`
- Status: Captured, no tool.

**`remove_registry_item`**
- Endpoint: `DELETE /v3/registries/{registry_id}/items/{collection_item_id}` (empty body)
- Status: Captured, no tool.

**`search_registry_products`** (for the "add gift" UX)
- Endpoint: `POST /v3/categories/{category_id}/entities`
- Body: `{ offset, limit, registry_id }`
- Returns: paginated product list scoped to the registry.
- Also: `GET /v3/categories` lists all categories; `GET /v3/products/{product_id}` gets a single product.
- Status: Captured, no tool. Pairs naturally with `add_registry_item`.

**Registry home / featured section**
- Endpoint: `POST /v3/registries/{registry_id}/home`
- Useful: Sets which items appear on the registry home/featured section. Called frequently in the capture (refreshes after every change).
- Status: Captured but unused. Probably internal-only — the iOS app uses it to refresh state after writes. Likely not worth exposing as a standalone tool; could be invoked internally after add/update/remove if needed.

---

## Inquiries — Reply

**`reply_to_inquiry`**
- Endpoint: Likely `POST /v3/inquiries/{uuid}/conversation/messages` (not confirmed in capture)
- Useful: Sends a reply to a vendor's inquiry conversation from the assistant.
- Status: Flagged in `2026-04-11-capture-plan.md` (Session 3) as potentially using a WebSocket or cert-pinned transport — zero mobile-api calls were captured for send in the prior session. The current 2026-05-15 capture also shows no POST to an inquiry messages endpoint. May be blocked by cert pinning or WebSocket.

**Inquiry archive / star**
- Endpoint: Needs new capture
- Useful: Allows filtering or triaging inquiry list by marking certain threads archived or starred.
- Status: Needs new capture. The `list_inquiries` response may include these flags but no write tools exist.

---

## Premium Features

**`get_premium_features`**
- Endpoint: `GET https://mobile-api.zola.com/v3/premium-features`
- Useful: Lists which premium features (e.g., RSVP by text, custom domain) are available to the couple and whether each is enabled — useful for surfacing upgrade opportunities or explaining feature availability.
- Status: Captured (read only), no tool implemented.

**`get_upgrade_info`**
- Endpoint: `GET https://mobile-api.zola.com/v3/websites/upgrade-info`
- Useful: Returns paywall / upgrade info for premium website features.
- Status: Captured (read only), no tool implemented.

**SMS RSVP premium-feature check**
- Endpoint: `POST https://www.zola.com/website-nav/web-api/v1/premium-feature/feature/PREMIUM_SMS/is-enabled`
- Useful: Checks if SMS RSVP is enabled; may also enable it (the POST verb is notable).
- Status: Captured via www.zola.com web API. No mobile equivalent captured. May require web API client path.

---

## Stationery / Cards

**`get_card_suite`**
- Endpoint: `GET https://mobile-api.zola.com/v3/card-catalog/themes/blake/time-based-suite`
- Useful: Fetches save-the-date / invitation card suite details. Zola sells stationery; showing available suites helps couples shop from the assistant.
- Status: Captured (read only), no tool implemented. The path suggests the slug (`blake`) and suite type (`time-based-suite`) are parameters.

---

## Cart / Shopping

**`get_cart`**
- Endpoint: `GET https://mobile-api.zola.com/v3/carts/users/{user_id}` and `GET https://www.zola.com/web-api/v1/cart`
- Useful: Shows items currently in the shopping cart (stationery, registry items, etc.).
- Status: Captured (read only via both mobile and web APIs), no tool implemented.

---

## Notifications

**`get_unseen_notifications`**
- Endpoint: `GET https://www.zola.com/website-nav/web-api/v1/notification/unseen`
- Useful: Returns count / list of unseen planning notifications — useful for a daily briefing.
- Status: Captured via www.zola.com web API only, no tool implemented.

**`get_inquiry_unread_count`**
- Endpoint: `GET https://www.zola.com/web-marketplace-api/v1/inquiry/unread-count`
- Useful: Quick scalar for how many vendor inquiries are unread — useful in a dashboard summary without pulling full inquiry list.
- Status: Captured via www.zola.com web API only, no tool implemented. Current `list_inquiries` surfaces the `unread` flag per inquiry but requires loading all inquiries.

---

## Still Needs New Captures

These are the only items where bodies are still unknown:

- **Wedding party CRUD**: read endpoint captured (`GET /v3/websites/wedding-party-members/wedding-accounts/{acct}`); writes need a session of add/edit/delete in the app.
- **Photo gallery uploads**: read captured; uploads likely multipart-form, separate session needed.
- **Inquiry reply**: third capture attempt would help confirm WebSocket vs cert-pinned. Two sessions so far have produced zero traffic.
- **Bulk guest directory update**: endpoint captured (`PUT /v3/guestlists/groups/wedding-accounts/{acct}/bulk/directory`), body shape not extracted.

## Recommended Next Plan

Group the now-fully-captured items into a single feature-add ("Phase 2 website tools"):

1. **Travel CRUD** — 4 tools, identical pattern to FAQ/POI; extend `deletePageEntity` to handle `'TRAVEL'`. Cleanest of the bunch.
2. **Theme/design** — 4 tools: `get_current_theme`, `search_themes`, `update_current_theme`, `update_website_customization`. New file `src/tools/website-theme.ts`.
3. **Registry items** — 3 CRUD tools + product search. New file `src/tools/registry-items.ts`. Slightly different domain from the website tools.

Estimated ~11 new tools, similar shape to what we just shipped. Could fit one plan.

## Decisions Needed

1. **Phase 2 scope**: ship all 11 in one plan, or split (e.g., travel first as a quick add to `website-content.ts`, then theme+registry as a separate effort)?
2. **Web API host**: extending `ZolaClient` to also speak `www.zola.com` would unlock the notifications / inquiry-unread-count / website-effect reads. Worth a small client refactor or defer?
3. **Inquiry reply third attempt**: try once more with mitmproxy + verbose logging to confirm transport, or close this out as known-blocked?
4. **Wedding party + photos**: schedule a small follow-up capture session now that the muscle memory is fresh, or wait?
