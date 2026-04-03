# zola-mcp

MCP server for Zola wedding planning — registry, guest list, checklist, and budget.

## Build & Test

```bash
npm run build        # tsc + esbuild bundle
npm test             # vitest run
npm run test:watch   # vitest in watch mode
```

## Architecture

- `src/index.ts` — MCP server entry point, tool routing
- `src/client.ts` — Zola API client (auth, token refresh)
- `src/tools/` — tool implementations (one file per domain)

## Versioning

Version appears in FOUR places — all must match:

1. `package.json` → `"version"`
2. `package-lock.json` → run `npm install --package-lock-only` after changing package.json
3. `src/index.ts` → `McpServer` constructor `version` field
4. `manifest.json` → `"version"`

### Important

Do NOT manually bump versions or create tags unless the user explicitly asks. Versioning is handled by the **Cut & Bump** GitHub Action.

### Release workflow

Main is always one version ahead of the latest tag. To release, run the **Cut & Bump** GitHub Action (`cut-and-bump.yml`) which:

1. Runs CI (build + test)
2. Tags the current commit with the current version
3. Bumps patch in all four files
4. Rebuilds, commits, and pushes main + tag
5. The tag push triggers the **Release** workflow (CI + npm publish + GitHub release)
