#!/usr/bin/env bash
#
# Zola MCP auth setup (thin wrapper).
#
# Launches Chrome with a dedicated profile so you can sign in to zola.com,
# captures the `usr` cookie (a ~1-year JWT refresh token), and writes it to
# .env as ZOLA_REFRESH_TOKEN.
#
# Equivalent to running: npm run auth
#
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/setup-auth.mjs "$@"
