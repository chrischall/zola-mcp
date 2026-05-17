# Zola API quirks

Empirical findings from live testing of two Zola API surfaces (May 2026):

- **mobile-api** — `mobile-api.zola.com` — the endpoint this MCP server talks
  to. Bearer JWT auth. Used by the Zola iOS/iPad apps.
- **web-api** — `www.zola.com/web-api/v1` — distinct surface used by the
  zola.com web UI. Cookie + CSRF auth. **Not currently used by this MCP.**

The two surfaces share auth credentials (the long-lived `usr` refresh JWT in
the web app's cookie is the same value as `ZOLA_REFRESH_TOKEN`) but use
completely different request and response shapes.

Each quirk below has a defence in `updateWebsiteCustomization`
(`src/tools/website-theme.ts`) and at least one regression test in
`tests/website-theme.test.ts`.

---

## 1. Partial-update wipe bug (mobile-api)

**Behaviour.** On `POST /v3/websites/website-customizations/context`, when the
body contains `header_font` (i.e. `header_font_family_id` is being changed)
but omits other customization fields, the server resets every other active
customization to `null`:

- `body.color` (body text color)
- `navigation_customization.background_color`
- `accent_color`
- `background_color`

This happens even though the endpoint is otherwise a partial update — every
other field type round-trips fine on its own. Only the header-font path
triggers the wipe.

**Workaround.** Before sending `header_font_family_id`, GET the current
customization state and re-include every other active field in the same POST.
The wrapper does a `GET /v3/websites/website-customizations/context` first
and bundles non-null values from `current_style_customizations` into the POST.

**Note on read-vs-write naming.** The read response nests body color under
`current_style_customizations.body.color` (singular `body`), while the write
body uses `body_font: { color }`. The wrapper bridges this asymmetry. See
section 4 for the full shape.

**Test.** `updateWebsiteCustomization: regression — wipe bug is neutralised by
the wrapper`.

---

## 2. `body_font_family_id` is restricted to two values

**Behaviour.** Despite the catalog exposing 200+ font families (any of which
can be used as `header_font_family_id`), the body font accepts only two:

| `font_family_id` | Font name           | Style       |
|------------------|---------------------|-------------|
| `68`             | Libre Baskerville   | Serif       |
| `198`            | Circular            | Sans-serif  |

This is enforced both at the API layer (sending any other ID returns a generic
`"tool execution failed"` error with no detail) and in the UI — the Zola web
app only exposes those two choices in the body-font dropdown.

**Workaround.** The wrapper validates against `[68, 198]` before making any
HTTP call and throws a clear error.

**Test.** `updateWebsiteCustomization: rejects body_font_family_id outside the
allowed set [68, 198]` plus the two accept-cases for 68 and 198.

---

## 3. `header_color` and `nav_font_color` — writable on web-api, NOT mobile-api

**Behaviour.** These fields appear in read responses:

- `current_style_customizations.header.color`
- `current_style_customizations.navigation_customization.font_color`

…but the mobile-api `POST /v3/websites/website-customizations/context` write
schema has no corresponding parameters. The Zola web UI changes them via a
completely different endpoint:

```
POST https://www.zola.com/web-api/v1/websiteCustomization/update
Auth: cookie (`us` session JWT, `usr` refresh JWT) + `x-csrf-token` header
Body (always full state, never partial):
{
  "header_font":   { "font_family_id": <n>, "color": "<HEX>" },
  "body_font":     { "font_family_id": <n>, "color": "<HEX>" },
  "background_color": "<HEX>",
  "accent_color":     "<HEX>",
  "navigation_customization": {
    "background_color": "<HEX>",
    "font_color":       "<HEX>"
  }
}
```

The same refresh token (`ZOLA_REFRESH_TOKEN`) authenticates both surfaces, but
the web-api needs cookie-based session handling and CSRF token capture, which
this MCP server does not yet implement.

**Workaround.** `updateWebsiteCustomization` accepts `header_color` and
`nav_font_color` only so it can throw an actionable error directing callers
to the Zola web UI (until web-api support is added). Nothing is sent over
the wire.

**Test.** `updateWebsiteCustomization: rejects header_color (web-api only)`
and the matching `nav_font_color` test.

---

## 4. Read-side vs write-side shape (mobile-api)

The mobile-api uses different field names for reading vs writing
customization state. Both shapes coexist in the same endpoint.

### Write body (POST)

```jsonc
{
  "header_font":   { "font_family_id": <n>, "color": "<HEX>" },  // optional
  "body_font":     { "font_family_id": <n>, "color": "<HEX>" },  // optional
  "background_color": "<HEX>",                                    // optional
  "accent_color":     "<HEX>",                                    // optional
  "navigation_customization": {
    "background_color": "<HEX>"                                   // optional
    // no font_color on mobile-api — see quirk #3
  }
}
```

### Read response (GET or POST `{}`)

```jsonc
"current_style_customizations": {
  "header": { "color": "<HEX>", "id": <n>, /* etc. */ } | null,
  "body":   { "color": "<HEX>", "id": <n>, /* etc. */ } | null,
  "navigation_customization": {
    "background_color": "<HEX>",
    "font_color": "<HEX>"           // present on web-api; observed null/absent on mobile-api
  } | null,
  "background_color": "<HEX>" | null,
  "accent_color":     "<HEX>" | null,
  "background_color_customizable": true,
  "accent_color_customizable": true
}
```

**Key gotchas:**
- Read uses `header` / `body`; write uses `header_font` / `body_font`.
- Read exposes the font family ID as `.id`; write expects `.font_family_id`.
- Null-or-absent nested objects (`body: null`) coexist with `*_customizable`
  booleans at the top level — meaning the field is allowed to be set, just
  currently isn't.

The wrapper handles all this; callers see the flat write-side argument names
(`body_font_color`, `header_font_family_id`, etc.).

---

## Adding web-api support (future work)

To make `header_color` and `nav_font_color` writable through this MCP:

1. Extend `ZolaClient` with a parallel `requestWeb()` path that:
   - Sends the `usr` refresh JWT as a cookie instead of a Bearer header.
   - Fetches a CSRF token (likely via a GET that sets the `CSRF-TOKEN`
     cookie) and mirrors it into `x-csrf-token` on state-changing requests.
   - Maintains a cookie jar across requests in the same process.
2. Add a `update_website_customization_full` tool that wraps `POST
   /web-api/v1/websiteCustomization/update`, always sending the full state.
3. Either fold `header_color` / `nav_font_color` into the existing
   `update_website_customization` (preferred — single tool, smart routing) or
   keep them on a separate tool.

The web-api uses `us` (short JWT) and `usr` (long refresh JWT) cookies — both
issued by the same `mobile-api/v3/sessions/refresh` flow this MCP already
uses, so no new refresh logic is required.
