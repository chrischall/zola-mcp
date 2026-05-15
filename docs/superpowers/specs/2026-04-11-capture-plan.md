# Capture Plan: Write Endpoints

**Date:** 2026-04-11

Write endpoints that still need to be discovered via mitmproxy from the Zola iOS app. Each section describes what to do in the app while the proxy is running.

---

## Session 1: Vendor Management

**Actions to perform:**
1. Go to Vendors → tap a booked vendor → edit details (change name, price, or notes) → save
2. Go to Vendors → tap "Add vendor" → book a new vendor (pick any category) → save
3. Go to Vendors → tap a booked vendor → unbook/remove it

**Expected endpoints:**
- `PUT /v3/account-vendors/{id}` or similar — update vendor
- `POST /v3/account-vendors` — add/book vendor
- `DELETE /v3/account-vendors/{id}` — remove vendor

**MCP tools this enables:** migrate `add_vendor`, `update_vendor`, `remove_vendor` to mobile API

---

## Session 2: Guest Management

**Actions to perform:**
1. Go to Guest List → tap "+" → add a new guest (name, email, affiliation) → save
2. Go to Guest List → tap a guest → edit their address → save
3. Go to Guest List → tap a guest → delete the guest group

**Expected endpoints:**
- `POST /v3/guestlists/groups/...` — add guest group
- `PUT /v3/guestlists/groups/...` — update guest
- `DELETE /v3/guestlists/groups/...` — remove guest group

**MCP tools this enables:** migrate `add_guest`, `update_guest_address`, `remove_guest` to mobile API

---

## Session 3: Inquiry Reply

**Actions to perform:**
1. Go to Inquiries → open a vendor conversation → type a reply → send it

**Expected endpoints:**
- `POST /v3/inquiries/{uuid}/conversation/messages` or similar

**Note:** Previous capture attempt showed zero mobile-api calls for send. The messaging may use a WebSocket or cert-pinned connection. If nothing is captured, this endpoint may not be accessible.

**MCP tools this enables:** `reply_to_inquiry`

---

## Session 4: Event Management

**Actions to perform:**
1. Go to Events/Schedule → edit an event (change time, venue, or notes) → save
2. Go to Events → add a new event → save
3. Go to Events → delete an event

**Expected endpoints:**
- `PUT /v3/websites/events/{id}` — update event (already seen in seating capture!)
- `POST /v3/websites/events` — create event
- `DELETE /v3/websites/events/{id}` — delete event

**MCP tools this enables:** `create_event`, `update_event`, `delete_event`

---

## Session 5: Registry Management

**Actions to perform:**
1. Go to Registry → add an item → save
2. Go to Registry → remove an item
3. Go to Registry → edit an item (quantity, notes)

**Expected endpoints:**
- `POST /v4/shop/registry/items` or similar
- `DELETE /v4/shop/registry/items/{id}`
- `PUT /v4/shop/registry/items/{id}`

**MCP tools this enables:** `add_registry_item`, `remove_registry_item`, `update_registry_item`

---

## How to Run a Capture Session

```bash
# 1. Run the setup script with the session name
./scripts/setup-auth.sh  # if token is expired

# 2. Start proxy manually
mitmdump -p 8080 -w /tmp/zola-SESSION_NAME.mitm &
networksetup -setwebproxy Wi-Fi 127.0.0.1 8080
networksetup -setsecurewebproxy Wi-Fi 127.0.0.1 8080

# 3. Open Zola and perform the actions listed above
open -a Zola

# 4. When done, stop proxy
kill %1
networksetup -setwebproxystate Wi-Fi off
networksetup -setsecurewebproxystate Wi-Fi off

# 5. Read the capture
mitmdump -r /tmp/zola-SESSION_NAME.mitm --flow-detail 3 > /tmp/SESSION_NAME-full.txt
grep "mobile-api.zola.com" /tmp/SESSION_NAME-full.txt | grep "POST\|PUT\|DELETE"
```

---

## Priority Order

1. **Event Management** — highest value, `PUT /v3/websites/events/{id}` already seen
2. **Guest Management** — migrate writes to mobile API for consistency
3. **Vendor Management** — migrate writes to mobile API for consistency
4. **Registry Management** — useful as wedding gets closer
5. **Inquiry Reply** — may be blocked by cert pinning
