/**
 * Logger module — structured JSON logging abstraction for BanyanBoard API.
 *
 * Usage:
 *   import { getLogger } from './logger';  // request-scope: trace-enriched
 *   import { logger } from './logger';     // startup/shutdown: bare logger
 *
 * Design:
 *   - pino (fast, JSON-native) is the underlying library.
 *   - AsyncLocalStorage (ALS) carries per-request bindings across async calls
 *     without explicit parameter threading.
 *   - getLogger() reads the active OpenTelemetry span's traceId/spanId at
 *     call time so every log line in a request automatically has trace context.
 *   - createLogger(cfg, dest?) is exported for unit tests; tests pass an
 *     in-memory Writable destination so they never touch process.env.
 *   - Module-level exports (logger, getLogger, runWithContext) use a lazy
 *     singleton: config is imported statically but the Proxy only triggers
 *     loadConfig() when a property is first read — which happens inside
 *     getInstance(), not at module load time.
 */

import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import { trace } from '@opentelemetry/api';
// Imported here for the module-level singleton only; the Proxy defers actual
// loadConfig() execution until a config property is first read (getInstance()).
// Tests that call createLogger(cfg, dest) directly never trigger this import's
// loadConfig() and therefore do not require DATABASE_URL in process.env.
import { config } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoggerConfig {
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  LOG_FORMAT: 'json' | 'text';
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  NODE_ENV: 'development' | 'test' | 'production';
}

export interface RequestContext {
  bindings?: Record<string, unknown>;
}

export interface LoggerInstance {
  /** Bare pino logger — use for startup/shutdown lines (no request context). */
  logger: pino.Logger;
  /**
   * Returns a child logger enriched with the active OTel span's traceId/spanId
   * and any ALS-bound per-request bindings (e.g., userId after auth).
   * Call this at the top of every request handler and service function.
   */
  getLogger: () => pino.Logger;
  /** Enter an ALS scope so getLogger() can pick up per-request bindings. */
  runWithContext: <T>(ctx: RequestContext, fn: () => T) => T;
}

// ---------------------------------------------------------------------------
// Factory (used by tests and by the module-level singleton)
// ---------------------------------------------------------------------------

/**
 * Build a LoggerInstance backed by the given config.
 *
 * @param cfg    Logger configuration (subset of Config — does not require DATABASE_URL).
 * @param dest   Optional pino destination stream. Pass an in-memory Writable in
 *               tests to capture log output without touching process.stdout.
 *               When omitted, pino writes to process.stdout.
 */
export function createLogger(
  cfg: LoggerConfig,
  dest?: pino.DestinationStream,
): LoggerInstance {
  const als = new AsyncLocalStorage<RequestContext>();

  // Skip pino-pretty transport when a custom destination is provided (tests),
  // because transport spawns a worker thread incompatible with sync test assertions.
  const options: pino.LoggerOptions = {
    level: cfg.LOG_LEVEL,
    base: {
      service: cfg.SERVICE_NAME,
      version: cfg.SERVICE_VERSION,
      env: cfg.NODE_ENV,
    },
    // Use "timestamp" as the field name (AC-HAPPY-2 requirement).
    // pino.stdTimeFunctions.isoTime uses "time"; this custom function names it "timestamp".
    timestamp: (): string => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      // Emit level as a string label ("info") rather than pino's numeric value (30).
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.secret',
        'password',
        'token',
        'secret',
      ],
      censor: '[REDACTED]',
    },
    // Only apply pino-pretty when writing directly to stdout in text mode.
    ...(dest === undefined && cfg.LOG_FORMAT === 'text'
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };

  const baseLogger: pino.Logger = dest ? pino(options, dest) : pino(options);

  function getLogger(): pino.Logger {
    const span = trace.getActiveSpan();
    const store = als.getStore();
    const bindings: Record<string, unknown> = { ...(store?.bindings ?? {}) };
    if (span !== undefined) {
      const sc = span.spanContext();
      bindings['traceId'] = sc.traceId;
      bindings['spanId'] = sc.spanId;
    }
    return Object.keys(bindings).length > 0
      ? baseLogger.child(bindings)
      : baseLogger;
  }

  function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return als.run(ctx, fn);
  }

  return { logger: baseLogger, getLogger, runWithContext };
}

// ---------------------------------------------------------------------------
// Module-level singleton (lazy — initialized on first access via getInstance())
// ---------------------------------------------------------------------------

let _instance: LoggerInstance | undefined;

function getInstance(): LoggerInstance {
  if (_instance === undefined) {
    // First access of config properties triggers loadConfig() — requires DATABASE_URL.
    _instance = createLogger({
      LOG_LEVEL: config.LOG_LEVEL,
      LOG_FORMAT: config.LOG_FORMAT,
      SERVICE_NAME: config.SERVICE_NAME,
      SERVICE_VERSION: config.SERVICE_VERSION,
      NODE_ENV: config.NODE_ENV,
    });
  }
  return _instance;
}

/**
 * Bare logger for startup and shutdown lines (no per-request context).
 * Accessing this triggers lazy initialization of the module singleton.
 */
export const logger: pino.Logger = new Proxy({} as pino.Logger, {
  get(_target, prop) {
    return (getInstance().logger as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/**
 * Returns a child logger enriched with the active OTel span context and any
 * ALS-bound per-request bindings. Use this everywhere in request handlers and
 * service functions.
 */
export function getLogger(): pino.Logger {
  return getInstance().getLogger();
}

/**
 * Run fn inside an ALS scope. The trace-context middleware calls this once per
 * request so that getLogger() picks up per-request bindings downstream.
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return getInstance().runWithContext(ctx, fn);
}
