---
name: zola
description: This skill should be used when the user asks about Zola wedding planning data. Triggers on phrases like "check Zola", "Zola vendors", "wedding budget", "Zola guests", "RSVP status", "seating chart", "vendor inquiries", "wedding registry", "gift tracker", or any request involving wedding vendors, guest list, budget, seating, events, registry, or inquiry management on Zola.
---

# zola-mcp

MCP server for Zola — 27 tools for managing your entire wedding via the Zola mobile API.

## Tools

### Vendors
- `zola_list_vendors` — List all booked vendors
- `zola_search_vendors` — Search vendors by name/category
- `zola_add_vendor` — Book a new vendor
- `zola_update_vendor` — Update vendor details
- `zola_remove_vendor` — Unbook a vendor

### Budget
- `zola_get_budget` — Budget summary with all items
- `zola_update_budget_item` — Update cost or note

### Guests
- `zola_list_guests` — List all guest groups with stats
- `zola_add_guest` — Add a guest group
- `zola_update_guest_address` — Update mailing address
- `zola_remove_guest` — Remove a guest group

### Seating
- `zola_list_seating_charts` — List charts
- `zola_get_seating_chart` — Chart with tables/seats/occupants
- `zola_list_unseated_guests` — Guests not yet seated
- `zola_assign_seat` — Assign guest to seat

### Inquiries
- `zola_list_inquiries` — All vendor inquiries
- `zola_get_inquiry_conversation` — Full conversation
- `zola_mark_inquiry_read` — Mark as read

### Events & RSVPs
- `zola_list_events` — All events with RSVP counts
- `zola_track_rsvps` — RSVP tracking per event
- `zola_update_event` — Update event details

### Registry & Gifts
- `zola_get_registry` — Registry categories and items
- `zola_get_gift_tracker` — Gifts received and thank-you status

### Discovery
- `zola_get_wedding_dashboard` — Planning overview
- `zola_search_storefronts` — Search marketplace
- `zola_get_storefront` — Full vendor details
- `zola_list_favorites` — Saved vendors
