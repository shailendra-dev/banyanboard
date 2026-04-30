import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Register OTel context manager so context.with() propagates spans in tests
    setupFiles: ['tests/setup/otel.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/telemetry/**'],
    },
    // Isolate modules between tests to avoid singleton config leakage
    isolate: true,
  },
});
