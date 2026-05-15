# Registry submissions — zola-mcp

Ready-to-paste copy for registries that need a manual browser-form submission. Automated pipelines fire on every `v*` tag via `.github/workflows/release.yml`.

## Coverage matrix

| Registry                          | Automated?                               | Where |
| --- | --- | --- |
| npm                               | ✅ `release.yml`                          | `npm publish --provenance` |
| GitHub Releases                   | ✅ `release.yml`                          | `.skill` + `.mcpb` attached |
| modelcontextprotocol/registry     | ✅ `release.yml` (OIDC)                   | `mcp-publisher publish` using `server.json` |
| PulseMCP                          | ✅ transitive (auto-ingests weekly)       | — |
| ClawHub (OpenClaw)                | ✅ conditional on `CLAWHUB_TOKEN`         | `clawhub skill publish` |
| mcpservers.org                    | ❌ manual — [mcpservers.org/submit](https://mcpservers.org/submit) | |
| Anthropic community plugins       | ❌ manual — [clau.de/plugin-directory-submission](https://clau.de/plugin-directory-submission) | |

## mcpservers.org

- **Server Name:** `zola-mcp`
- **Short Description:** `Zola wedding planning tools for Claude — vendors, budget, guests, seating, events, registry, inquiries, and more`
- **Link:** `https://github.com/chrischall/zola-mcp`
- **Category:** `Productivity`
- **Contact Email:** `chris.c.hall@gmail.com`

## Anthropic community plugins

- **Repo URL:** `https://github.com/chrischall/zola-mcp`
- **Plugin name:** `zola-mcp`
- **Short description:** `Zola wedding planning tools for Claude — vendors, budget, guests, seating, events, registry, inquiries, and more`
- **Category:** Productivity
- **Tags:** zola, wedding, vendors, guests, budget, seating, registry, rsvp, mcp
