import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.claude/**'],
    coverage: {
      provider: 'v8',
    },
  },
});
