import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The Cloudflare Worker connector test runs under the Workers pool
    // (`vitest.workers.config.ts` / `npm run worker:test`), never under Node —
    // `src/worker.ts` imports `cloudflare:workers`/`agents`, which can't load
    // here. Keep it out of the node suite.
    exclude: ['**/node_modules/**', '**/.claude/**', 'tests/worker.test.ts'],
    coverage: {
      provider: 'v8',
      // `src/worker.ts` (Workers-only entry) can't load under Node, so it's
      // covered by the Workers pool, not this Node coverage run.
      exclude: ['src/worker.ts'],
    },
  },
});
