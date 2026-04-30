/**
 * Config module — single source of typed configuration for BanyanBoard API.
 *
 * Usage:
 *   import { config } from './config';        // frozen singleton (application code)
 *   import { loadConfig } from './config';    // factory (tests, boot code)
 *
 * Design:
 *   - All env vars are read from a single zod schema.
 *   - dotenv is loaded before parsing process.env (no-op in production where the
 *     host already injects env vars).
 *   - When loadConfig() is called with an explicit env override (tests), dotenv is
 *     NOT loaded — the override is used as-is, keeping tests hermetic.
 *   - Missing required vars produce a single aggregated error listing every
 *     problem, not just the first one (AC-NFR-2, "Fail fast" principle).
 *   - The exported `config` singleton is Object.freeze'd — mutation throws in
 *     strict mode.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // Service identity (used in logs and traces)
    SERVICE_NAME: z.string().default('banyanboard-api'),
    SERVICE_VERSION: z.string().default('0.1.0'),

    // Database — required; no default because credentials must be explicit
    DATABASE_URL: z.string().url(),

    // Logging
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('info'),
    LOG_FORMAT: z.enum(['json', 'text']).default('json'),
    LOG_OUTPUT: z.enum(['stdout', 'file', 'both']).default('stdout'),
    LOG_FILE_PATH: z.string().optional(),

    // OpenTelemetry
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_PROTOCOL: z
      .enum(['http/protobuf', 'grpc'])
      .default('http/protobuf'),
    OTEL_SERVICE_NAME: z.string().optional(),
    OTEL_TRACES_SAMPLER: z
      .string()
      .default('parentbased_traceidratio'),
    OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1.0),
    OTEL_SDK_DISABLED: z.coerce.boolean().default(false),
  })
  .superRefine((cfg, ctx) => {
    if (
      (cfg.LOG_OUTPUT === 'file' || cfg.LOG_OUTPUT === 'both') &&
      !cfg.LOG_FILE_PATH
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LOG_FILE_PATH'],
        message: 'LOG_FILE_PATH is required when LOG_OUTPUT includes "file"',
      });
    }
    if (cfg.NODE_ENV === 'production' && !cfg.OTEL_EXPORTER_OTLP_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
        message: 'OTEL_EXPORTER_OTLP_ENDPOINT is required in production',
      });
    }
  });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Config = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a validated Config from the given env map.
 *
 * When called with no argument, process.env is used and dotenv is loaded first
 * so that a local .env file is picked up in development.
 *
 * When called with an explicit env override (tests), dotenv is NOT loaded and
 * the override is used verbatim — keeping tests hermetic.
 *
 * Throws an Error whose message contains the name of every invalid or missing
 * variable, aggregated in a single pass (no re-running required).
 */
export function loadConfig(
  env?: Record<string, string | undefined>,
): Config {
  // Load .env into process.env only when no override is provided (default path).
  if (env === undefined) {
    dotenv.config();
    env = process.env;
  }

  const result = ConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/**
 * Frozen module-level singleton — initialized on first access, validated,
 * and frozen so that no application code can mutate it at runtime.
 *
 * Initialization is deferred to first access so that test files that import
 * only `loadConfig` do not trigger singleton validation (which would require
 * DATABASE_URL in the test's process.env).
 *
 * Use `loadConfig(env)` in tests to build fresh isolated configs without
 * touching this singleton.
 */
let _config: Config | undefined;

// Lazy initialization via Proxy: the singleton is only loaded when first accessed.
// WHY: Tests that import only loadConfig() should not require a valid DATABASE_URL
// in their process.env. By deferring validation until first read, test setup is cleaner.
// Application code (server.ts) reads the config once at startup; if validation fails,
// a clear error is thrown before the server binds a port.
//
// The Proxy also enforces immutability: any attempt to mutate config throws TypeError
// in strict mode, preventing accidental runtime config changes.
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    if (_config === undefined) {
      _config = Object.freeze(loadConfig());
    }
    return (_config as unknown as Record<string | symbol, unknown>)[prop];
  },
  set() {
    throw new TypeError('config is frozen — do not mutate it');
  },
});
