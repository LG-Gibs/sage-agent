import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Root Vitest config.
 *
 * The Arbiter Core, tool registry and SSE contract are deliberately
 * platform-agnostic TypeScript so the governance-gate logic can be exercised
 * here, with no device or native toolchain. Aliases below resolve the
 * `@sage/*` workspace packages directly to their TypeScript sources so tests
 * run without a build step.
 */
export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      'apps/backend/test/**/*.test.ts',
    ],
    environment: 'node',
    reporters: 'default',
  },
  resolve: {
    alias: {
      '@sage/shared-types': pkg('./packages/shared-types/src/index.ts'),
      '@sage/sse-contract': pkg('./packages/sse-contract/src/index.ts'),
      '@sage/tool-registry': pkg('./packages/tool-registry/src/index.ts'),
      '@sage/arbiter-core': pkg('./packages/arbiter-core/src/index.ts'),
    },
  },
});
