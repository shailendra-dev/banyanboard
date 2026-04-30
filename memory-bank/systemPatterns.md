# System Patterns

> The patterns below were established by FEAT-001 (TASK-001 creative phase, 2026-04-28).
> Source: `memory-bank/creative/TASK-001-platform-architecture.md`.
> Subsequent features (FEAT-002+) inherit these patterns and extend them — they do not redefine them.

---

## Guiding Principles

These principles govern every architecture decision in BanyanBoard. Deviations require explicit justification in a creative-phase document.

1. **Simplicity over abstraction** — Pick the boring, well-known tool. No DI containers, no CQRS, no event sourcing, no Result monads. If a pattern requires a 30-minute explanation, it is wrong for this project.
2. **12-Factor compliance (config in environment)** — All configuration via environment variables. No hardcoded URLs, credentials, ports, or feature flags. Defaults live in the schema, not in source.
3. **OpenTelemetry-first observability** — Every request gets a W3C Trace Context. Every log line is structured JSON enriched with `traceId`, `spanId`, `service`, `version`, `level`, `timestamp`. No `console.log`/`console.error`/`console.warn`/`console.debug` in production code.
4. **Self-host friendly** — `docker compose up` from repo root must produce a working stack. No managed services, no Kubernetes, no cloud-only dependencies.
5. **Single source of truth per concern** — Config lives in one place (`src/config/`). DB connection lives in one place (`src/db/`). Logger lives in one place (`src/logger/`). Modules import from these; they do not re-implement them.
6. **No sensitive data in logs** — Authorization headers, Cookie headers, password/token/secret body fields are redacted to `[REDACTED]` by the logger. Adding a new sensitive field requires updating the redact list.
7. **Fail fast at startup** — Invalid config throws on boot, listing every problem. A misconfigured service must not silently degrade — it must refuse to start.

---

## Architecture Overview

BanyanBoard is a single-process Express HTTP API in front of a single PostgreSQL database, both running under Docker Compose. There are no message queues, no background workers, and no separate frontend at the platform level — those will be introduced incrementally.

### Component map (FEAT-001 baseline)

```
                    ┌──────────────────────────────────────────────┐
                    │  Server Bootstrap (src/server.ts)            │
                    │  init telemetry → load config → createApp()  │
                    └────────────────────┬─────────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────────┐
                    │  Express App (src/app.ts → createApp())      │
                    │                                              │
                    │  Middleware (in order):                      │
                    │    1. trace-context (start ALS scope)        │
                    │    2. express.json({ limit: '100kb' })       │
                    │    3. request-logger                         │
                    │    4. routes (/health, future: /auth, etc.)  │
                    │    5. notFoundHandler  (404 → AppError)      │
                    │    6. errorHandler     (AppError → JSON)     │
                    └────────────────────┬─────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
       ┌─────────────┐           ┌──────────────┐         ┌─────────────────┐
       │   logger    │           │    config    │         │      db         │
       │  (pino +    │◄──reads───┤  (zod-       │         │  (pg.Pool)      │
       │   ALS)      │           │   validated) │◄──reads─┤                 │
       └─────────────┘           └──────────────┘         └─────────────────┘
```

### Boot order

1. Initialize OpenTelemetry SDK (top-of-file side-effect import in `server.ts`, before any other application import).
2. Load and validate config (zod schema; throws on missing required vars).
3. Create the Express app via `createApp()`.
4. Open the PG connection pool (lazy connect — startup does NOT block on DB readiness).
5. Listen on `config.PORT`; emit one structured info log line with `service`, `version`, `port`.
6. Register SIGTERM/SIGINT handlers: stop accepting new connections, drain the request queue (10s timeout), call `pool.end()`, exit 0.

### Middleware order (load-bearing)

| # | Middleware | Purpose |
|---|------------|---------|
| 1 | `traceContextMiddleware` | Enter the AsyncLocalStorage scope. OTel HTTP instrumentation has already extracted `traceparent` and started the server span. |
| 2 | `express.json({ limit: '100kb' })` | Parse JSON bodies; oversized → 413. |
| 3 | `requestLoggerMiddleware` (pino-http) | Emit one JSON log line on response finish: `method`, `path`, `statusCode`, `durationMs`, `traceId`, `spanId`. |
| 4 | Routes | Domain handlers. `/health` in FEAT-001; FEAT-002+ adds more. |
| 5 | `notFoundHandler` | Convert unmatched routes to `new NotFoundError('Route not found')`. |
| 6 | `errorHandler` | Last middleware. Maps `AppError` → JSON envelope; maps unknown errors → generic 500. |

---

## Directory Structure

```
banyanboard/
├── docker-compose.yml          # api + postgres services
├── Dockerfile                  # multi-stage build for the api service
├── package.json
├── tsconfig.json
├── .env.example                # documents every env var from src/config schema
├── .eslintrc.cjs               # no-console rule, TS strict rules
├── .prettierrc
├── memory-bank/                # Banyan Memory Bank (this directory)
└── src/
    ├── server.ts               # Process entrypoint; binds port, registers shutdown
    ├── app.ts                  # createApp() factory; wires middleware
    ├── telemetry/
    │   └── init.ts             # OpenTelemetry SDK bootstrap (imported first)
    ├── config/
    │   └── index.ts            # zod schema + loadConfig() + frozen `config` singleton
    ├── logger/
    │   └── index.ts            # pino instance + getLogger() (ALS-aware) + runWithContext()
    ├── errors/
    │   ├── AppError.ts         # base class
    │   └── index.ts            # BadRequestError, UnauthorizedError, NotFoundError, ConflictError, …
    ├── middleware/
    │   ├── traceContext.ts     # enter ALS scope per request
    │   ├── requestLogger.ts    # pino-http configured against the singleton logger
    │   ├── notFoundHandler.ts
    │   └── errorHandler.ts
    ├── routes/
    │   └── health.ts           # GET /health
    ├── services/               # Empty in FEAT-001; FEAT-002+ adds userService, authService, …
    ├── db/
    │   └── index.ts            # pg.Pool, query(), getPool(), ping(), shutdown()
    └── types/                  # Shared TypeScript types (e.g., Express Request augmentation)
└── tests/
    ├── unit/
    │   ├── config.test.ts
    │   └── logger.test.ts
    └── integration/
        ├── health.test.ts
        └── middleware.test.ts
```

### Folder ownership rules

- **Only `src/db/` may import `pg`.** All other modules go through `query()`, `getPool()`, `ping()`, `shutdown()` from `src/db`.
- **Only `src/logger/` may import `pino`.** All other modules call `getLogger()` (in request scope) or import the bare `logger` (startup/shutdown only).
- **Only `src/config/` may read `process.env`.** All other modules import `config` from `src/config`.
- **Only `src/telemetry/` may import OpenTelemetry SDK packages.** Application code uses the `@opentelemetry/api` package indirectly via the active span (read by the logger).
- **`src/routes/` may not contain business logic.** When a route needs more than ~10 lines of work, that work goes into `src/services/`.

---

## Error-Handling Contract

### `AppError` base class

```typescript
// src/errors/AppError.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;          // stable, machine-readable identifier
  public readonly expose: boolean;       // whether `message` is safe to send to client
  public readonly details?: unknown;     // optional structured detail (e.g., validation errors)

  constructor(opts: {
    statusCode: number;
    code: string;
    message: string;
    expose?: boolean;
    details?: unknown;
    cause?: unknown;
  });
}
```

### Concrete subclasses (initial set)

| Class | Status | Code | Use |
|-------|--------|------|-----|
| `BadRequestError` | 400 | `BAD_REQUEST` | Validation failure, malformed input |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Missing/invalid auth (FEAT-002+) |
| `ForbiddenError` | 403 | `FORBIDDEN` | Authenticated but lacking permission |
| `NotFoundError` | 404 | `NOT_FOUND` | Unmatched route or missing resource |
| `ConflictError` | 409 | `CONFLICT` | Duplicate resource, version conflict |
| `PayloadTooLargeError` | 413 | `PAYLOAD_TOO_LARGE` | Body parser limit exceeded |
| `InternalError` | 500 | `INTERNAL_ERROR` | Generic 500 (rare; usually programmer errors take this path) |

Add new subclasses by extending `AppError` directly. Do not create a deep hierarchy.

### JSON response envelope

All error responses follow this shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Board not found",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
    "details": { "boardId": "abc-123" }
  }
}
```

- `code` is stable across releases — clients may switch on it.
- `message` is human-readable. For `AppError` with `expose=true` (the default), the original message is sent. For `expose=false` or for unknown errors, the message is the generic `'Internal Server Error'`.
- `traceId` matches the `traceId` written into the corresponding error log line.
- `details` is optional; included when the error carries structured field-level information.

### Operational vs. programmer error classification

The global `errorHandler` middleware uses `instanceof AppError`:

- **Operational** (`instanceof AppError`): expected failure mode. Status code from the error. Logged at `warn` (4xx) or `error` (5xx). Message passed through if `expose=true`.
- **Programmer** (any other `Error`): unexpected. Always 500. Logged at `error`. Generic message in response body. Stack trace in log only, never in response.

### Stack traces

Stack traces appear only in logs (via pino's `err` serializer). They never appear in HTTP response bodies, regardless of `NODE_ENV`.

---

## Logger Interface

### Public API

```typescript
// src/logger/index.ts (public exports)

/** Bare pino instance. Use ONLY for startup/shutdown logging where no request scope exists. */
export const logger: pino.Logger;

/**
 * Returns a child logger enriched with the active OTel trace context (traceId/spanId)
 * and any AsyncLocalStorage-bound per-request fields. Use this in route handlers,
 * middleware, and any service called from a route.
 */
export function getLogger(): pino.Logger;

/** Run a callback within a fresh request-scoped logger context. Used by traceContextMiddleware. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T;
```

### Required fields on every log line

| Field | Source | Example |
|-------|--------|---------|
| `timestamp` | `pino.stdTimeFunctions.isoTime` | `"2026-04-28T14:23:01.123Z"` |
| `level` | pino formatter (label, not number) | `"info"` |
| `service` | `config.SERVICE_NAME` | `"banyanboard-api"` |
| `version` | `config.SERVICE_VERSION` | `"0.1.0"` |
| `env` | `config.NODE_ENV` | `"production"` |
| `traceId` | active OTel span | `"4bf92f3577b34da6a3ce929d0e0e4736"` |
| `spanId` | active OTel span | `"00f067aa0ba902b7"` |
| `msg` | pino's standard message field | `"Fetched user"` |

### Redaction

The logger redacts these paths to `[REDACTED]` automatically:

- `req.headers.authorization`
- `req.headers.cookie`
- `req.headers["set-cookie"]`
- `password`, `token`, `secret` (top-level and nested with wildcard `*.password`)

Adding a new sensitive field requires editing the `redact.paths` list in `src/logger/index.ts`.

### Configuration

Driven entirely by config:

- `LOG_LEVEL` → pino `level`
- `LOG_FORMAT=text` → pipe through `pino-pretty` transport (dev only)
- `LOG_FORMAT=json` → no transport (production default)
- `LOG_OUTPUT` → destination(s); file output is multiplexed via pino destinations

### Usage convention

```typescript
// In a route handler:
import { getLogger } from '../logger';

router.get('/some-route', async (req, res) => {
  const log = getLogger();
  log.info({ userId: req.user.id }, 'Fetching user data');
  // ...
});

// In a service called from a route handler:
export async function createUser(input: CreateUserInput): Promise<User> {
  const log = getLogger();   // automatically gets traceId/spanId from active span
  log.info({ email: input.email }, 'Creating user');
  // ...
}

// In server.ts (no request scope):
import { logger } from './logger';
logger.info({ port: config.PORT }, 'Server listening');
```

---

## Configuration Module

### Schema and singleton

```typescript
// src/config/index.ts
import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SERVICE_NAME: z.string().default('banyanboard-api'),
  SERVICE_VERSION: z.string().default('0.1.0'),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
  LOG_OUTPUT: z.enum(['stdout', 'file', 'both']).default('stdout'),
  LOG_FILE_PATH: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['http/protobuf', 'grpc']).default('http/protobuf'),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_TRACES_SAMPLER: z.string().default('parentbased_traceidratio'),
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1.0),
  OTEL_SDK_DISABLED: z.coerce.boolean().default(false),
}).superRefine((cfg, ctx) => {
  if ((cfg.LOG_OUTPUT === 'file' || cfg.LOG_OUTPUT === 'both') && !cfg.LOG_FILE_PATH) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['LOG_FILE_PATH'],
      message: 'LOG_FILE_PATH is required when LOG_OUTPUT includes "file"' });
  }
  if (cfg.NODE_ENV === 'production' && !cfg.OTEL_EXPORTER_OTLP_ENDPOINT) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['OTEL_EXPORTER_OTLP_ENDPOINT'],
      message: 'OTEL_EXPORTER_OTLP_ENDPOINT is required in production' });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

/** Build a config from a custom env (used by tests). Throws with aggregated errors on invalid input. */
export function loadConfig(env?: NodeJS.ProcessEnv): Config;

/** Frozen module-level singleton; loaded once at import time. */
export const config: Config;
```

### Test-override pattern

Tests do **not** mutate `process.env`. They build a fresh config:

```typescript
// In a test:
import { loadConfig } from '../../src/config';

const cfg = loadConfig({
  DATABASE_URL: 'postgres://localhost/test',
  LOG_LEVEL: 'silent',
  // ...
});
```

For tests that exercise the singleton's startup behavior, use Vitest's `vi.resetModules()` + `vi.stubEnv()`:

```typescript
import { describe, it, expect, vi } from 'vitest';

it('throws aggregated error on missing required vars', async () => {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', '');
  await expect(import('../../src/config')).rejects.toThrow(/DATABASE_URL/);
});
```

### Guarantees

- Validation runs **once** at module import time.
- Failure produces a single error listing every invalid/missing variable (not just the first).
- The exported `config` object is `Object.freeze`'d — mutation throws in strict mode.
- `loadConfig` accepts an env override → enables hermetic tests.

---

## Database Access Pattern

### `src/db/index.ts` shape

```typescript
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

/** Run a query against the pool. Use parameterized queries — NEVER string-concatenate user input. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>>;

/** Returns true if PostgreSQL is reachable. Used by /health. Catches and logs errors; never throws. */
export async function ping(): Promise<boolean>;

/** Drain the pool. Called from the SIGTERM/SIGINT handler in server.ts. */
export async function shutdown(): Promise<void>;

/** Escape hatch: returns the underlying Pool. Used by FEAT-002 for connect-pg-simple session store. */
export function getPool(): Pool;
```

### Pool configuration

- `connectionString: config.DATABASE_URL`
- `max: 10` (tuned for 20–50 user load; revisit if pool exhaustion appears in load tests)
- `idleTimeoutMillis: 30_000`
- `connectionTimeoutMillis: 5_000`
- `pool.on('error', ...)` logs to the bare `logger` (ambient errors have no request scope)

### Migrations

Deferred to FEAT-002. Recommended tool: `node-pg-migrate`. Migration files in `migrations/` at repo root. Run via `npm run migrate` and as a one-shot Docker Compose service before API startup.

### Future query layer

Hand-written SQL is acceptable through FEAT-003. Re-evaluate at FEAT-004 (cards with ordering) — if SQL becomes hard to maintain, add `kysely` as a thin type-safe layer over `pg.Pool`. Do **not** add an ORM (TypeORM, Prisma, Sequelize) — they conflict with the simplicity principle.

---

## Testing Patterns

### Test framework

- **Vitest** for both unit and integration tests (one tool, fast, native TS, native ESM, native mock support).
- **supertest** for HTTP integration tests against the Express app.

### File organization

```
tests/
├── unit/                       # Pure-function and module-level tests; no network, no DB
│   ├── config.test.ts          # Schema validation, missing vars, type coercion
│   └── logger.test.ts          # Output shape, redaction, traceId enrichment
└── integration/                # Tests that spin up createApp() and hit endpoints
    ├── health.test.ts          # GET /health 200, DB-down 503
    └── middleware.test.ts      # traceparent propagation, error JSON shape, header redaction
```

### Conventions

- **One file per source module under test**. `src/db/index.ts` → `tests/unit/db.test.ts` (when warranted).
- **Tests build their own config**. Never read or mutate `process.env`.
- **Tests build their own app**. `createApp()` returns a fresh app per test — no singleton state.
- **Capture log output** via a custom pino destination stream (`pino.destination(memWriter)`), not by spying on `process.stdout`.
- **Integration tests against a real DB**. Use a Docker Compose `test` profile, or a `pg-mem` instance for query-shape tests where wire compatibility matters less. FEAT-001 only needs the live DB for the `/health` integration test.

### What NOT to test

- Express routing internals (covered by the framework itself)
- `pg.Pool` mechanics (covered by `pg`'s own tests)
- TypeScript compilation (covered by `tsc --noEmit` in `lint`/`build`)
- ESLint rule enforcement (covered by `npm run lint` in CI)

---

## Trace Context Propagation

OpenTelemetry's HTTP auto-instrumentation handles W3C Trace Context extraction and injection automatically:

| Boundary | Direction | Mechanism |
|----------|-----------|-----------|
| Inbound HTTP | Extract | `@opentelemetry/instrumentation-http` reads `traceparent` header, starts a server span. |
| Outbound HTTP | Inject | Same instrumentation injects `traceparent` into headers of `fetch`/`http.request` calls. |
| PostgreSQL | New child span | `@opentelemetry/instrumentation-pg` wraps queries with spans following `db.system=postgresql` semantic conventions. |
| Future SMTP (FEAT-003+) | Manual | SMTP does not carry W3C context; create a span manually around the send call. |
| Future webhook out (FEAT-007+) | Inject | Auto-injected by the HTTP instrumentation. |

When `traceparent` is missing on an inbound request, the HTTP instrumentation generates a fresh trace ID. Both cases produce valid 32-char hex `traceId` values that propagate through the logger.

---

## Document History

| Date | Change |
|------|--------|
| 2026-04-28 | Initial creation; established by FEAT-001 (TASK-001) creative phase. |
