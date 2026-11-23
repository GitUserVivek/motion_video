import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against the shared TypeScript source, not a stale dist build. Vitest used
// to load dist/index.mjs, so a newly added schema/helper could typecheck yet be
// undefined at test time until someone remembered to rebuild the package.
const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@edumotion/shared': sharedSrc,
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
  },
});
