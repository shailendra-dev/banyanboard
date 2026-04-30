import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Register OTel context manager so context.with() propagates spans in tests
    setupFiles: ['tests/setup/otel.ts'],
    // Provide the vars that loadConfig() requires so the lazy config Proxy
    // and logger singleton can initialize without DATABASE_URL missing in tests.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/telemetry/**'],
    },
    // Isolate modules between tests to avoid singleton config leakage
    isolate: true,
  },
});
