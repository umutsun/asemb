import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run only the test file we created.
    include: ['test/embedding-service.test.ts'],
    globals: true, // Use vitest globals (describe, it, etc.) without importing
    deps: {
      // Force vitest to handle this package correctly
      external: ['n8n-workflow'],
    },
  },
});
