# Zola Mobile API — Full Endpoint Catalog

**Date:** 2026-04-11
**Source:** mitmproxy capture from Zola iOS app v42.5.0

All endpoints use `https://mobile-api.zola.com` with Bearer JWT auth + `x-zola-session-id` header.

---

## Currently Implemented in MCP

### Budget (2 tools — `requestMobile`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v3/budgets` | Get budget with all items |
| PUT | `/v3/budgets/items` | Update a budget item |

### Seating (4 tools — `requestMobile`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v3/seating-charts/summaries` | List charts |
| GET | `/v3/seating-charts/{uuid}` | Get chart with tables/seats |
| PUT | `/v3/seating-charts/seats` | Assign guest to seat |
| POST | `/v3/guestlists/directory/wedding-accounts/{id}` | Guest directory for seating |

### Inquiries (3 tools — `requestMobile`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v3/inquiries/unified-inquiries` | List all inquiries |
| GET | `/v3/inquiries/{uuid}/conversation` | Get conversation messages |
| PUT | `/v3/inquiries/{uuid}/conversation/read` | Mark as read |

---

## Currently on Web API (candidates for migration)

### Vendors (5 tools — `requestMarketplace`)

**Mobile equivalents discovered:**
| Method | Path | Purpose | Web equivalent |
|--------|------|---------|----------------|
| POST | `/v3/account-vendors/booked-list` | List booked vendors | `POST /v1/account/get-or-create-vendors` |
| POST | `/v3/storefronts/search` | Search vendors by location/type | `POST /v1/vendor-search/name-prefix-query` |
| GET | `/v3/storefronts/{uuid}` | Get storefront details | — |
| GET | `/v3/account-vendors/taxonomy-nodes/{id}` | Vendor category details | — |
| POST | `/v3/storefronts/top-picks` | Recommended vendors | — |

**Not yet captured:** add/update/remove vendor (need to do those actions in the app).

### Guests (4 tools — `request`)

**Mobile equivalents discovered:**
| Method | Path | Purpose | Web equivalent |
|--------|------|---------|----------------|
| POST | `/v3/guestlists/directory/wedding-accounts/{id}` | List all guests (full detail) | `POST /web-api/v1/guestgroup/list/all` |
| GET | `/v3/guestlists/groups/uuid/{uuid}/overview` | Get single guest group | — |
| GET | `/v3/guestlists/wedding-accounts/{id}/guest-collection` | Guest collection (cards/invites view) | — |
| PUT | `/v3/guestlists/wedding-accounts/{id}/envelope-recipient` | Update guest group (full body) | `PUT /web-api/v2/guestgroup/{id}/address` |

**Not yet captured:** add guest, remove guest.

---

## New Feature Endpoints (not yet implemented)

### Wedding Dashboard
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| GET | `/v4/your-wedding` | Full wedding dashboard/overview | Medium |
| GET | `/v5/home` | App home feed | Low |

### Events & RSVPs
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| GET | `/v3/websites/events/wedding-accounts/{id}` | List all events (ceremony, reception, etc.) | **High** |
| GET | `/v3/websites/events/wedding-accounts/{id}/groups` | Event groups/categories | Medium |
| GET | `/v3/websites/events/track-rsvps` | RSVP tracking per event | **High** |
| GET | `/v3/websites/rsvps/wedding-accounts/{id}` | RSVP settings | Medium |
| PUT | `/v3/websites/events/{event_id}` | Update event details | **High** |

### Gift Registry & Tracking
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| GET | `/v4/shop/registry?registry_id={id}` | Full registry with all items | **High** |
| GET | `/v3/gift_tracker/{user_id}` | Gift tracking (who gave what, thank you notes) | **High** |

### Vendor Discovery
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| POST | `/v3/storefronts/search` | Search vendors by type/location/facets | Medium |
| POST | `/v3/storefronts/landing` | Vendor marketplace landing | Low |
| POST | `/v3/storefronts/top-picks` | AI/algo-recommended vendors | Medium |
| GET | `/v3/storefronts/{uuid}` | Full storefront details | Medium |
| GET | `/v3/storefronts/valid-market` | Check market availability | Low |
| GET | `/v3/favorites/` | Favorited vendors | Medium |

### Invitations & Paper
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| POST | `/v3/card-templates/preview` | Preview invitation/card designs | Low |

### Account & Auth
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| GET | `/v3/users/me/context` | Full user context (account, settings) | Low |
| GET | `/v3/premium-features` | Premium subscription status | Low |
| POST | `/v3/sessions/refresh` | Refresh session token | Already used |

### Inquiry Extras
| Method | Path | Purpose | Priority |
|--------|------|---------|----------|
| GET | `/v3/inquiries/inquiry-account-preferences` | Inquiry defaults | Low |
| GET | `/v3/inquiries/account-incentive` | Booking incentives | Low |
| GET | `/v4/inquiries/{uuid}/suggested-vendors` | Similar vendor suggestions | Medium |
| GET | `/v1/first-moves/ready` | Vendor first-move notifications | Low |

---

## Recommended Next Features (by wedding journey priority)

1. **Events & RSVPs** — manage ceremony/reception events, track who's attending
2. **Gift Registry** — view registry items, track gifts received
3. **Gift Tracker** — thank you note tracking
4. **Vendor Search** — search marketplace by type/location (mobile API is richer than current web prefix search)
5. **Favorites** — saved/favorited vendors
