# Architecture Decision: Express API with TypeScript Platform (FEAT-001)

**Created**: 2026-04-28
**Status**: DECIDED
**Decision Type**: Architecture
**Task**: TASK-001
**Feature**: FEAT-001 (BanyanBoard v0.1.0 Foundation)

## Context

This is a greenfield platform milestone. The `/src` tree, `package.json`, Docker Compose configuration, and `systemPatterns.md`/`techContext.md` are all empty. Every decision made in this document becomes the contract that FEAT-002 (Auth), FEAT-003 (Boards), FEAT-004 (Cards), and FEAT-005 (Drag-and-Drop) build on top of. The cost of changing these decisions later is high; the cost of overengineering them now is also high. The brief is explicit: favor simplicity.

### System Requirements

- Express + TypeScript HTTP API with JSON request/response
- PostgreSQL connection (live ping in `/health`)
- Docker Compose dev environment: `docker compose up` from repo root brings up the API + PostgreSQL
- Base middleware: JSON body parsing, structured request logging, W3C Trace Context propagation, global error handler
- `GET /health` endpoint reporting service name, version, and DB connectivity
- Structured logger abstraction with traceId on every log line
- Config layer that reads env vars, validates them at startup, fails fast on missing required vars
- ESLint + Prettier; no `console.log`/`console.error` in production source
- `package.json` scripts: `dev`, `build`, `start`, `test`, `lint`
- Test infrastructure (unit + integration) able to start the app, hit endpoints, capture stdout JSON

### Technical Constraints

- **Stack is fixed**: Node.js (LTS), Express, TypeScript, PostgreSQL, Docker Compose
- **Simplicity over abstractions**: no DI containers, no CQRS, no event sourcing
- **Single-host deployment**: must run with `docker compose up`; no Kubernetes, no managed services
- **12-Factor App**: all configuration in environment variables; no hardcoded URLs/credentials/feature flags
- **Greenfield**: no existing patterns to respect (we are setting them); but later features must be supportable without rewrites

### Non-Functional Requirements

- **Observability (blocking)**: OpenTelemetry SDK; W3C Trace Context propagation; structured JSON logs with `traceId`, `spanId`, `service`, `level`, `timestamp`; no `console.log` in production
- **Performance**: API p95 <200ms (productBrief); platform overhead p95 <50ms (AC-NFR-4 SHOULD)
- **Security**: no sensitive data in logs (Authorization, Cookie headers, password/token/secret body fields must be redacted); DB credentials only via `DATABASE_URL`
- **Scale**: 20–50 users per deployment; 50 req/s; ~10k cards / ~100 boards
- **Availability**: 99% uptime (operator-dependent), self-host, single PG instance

### Existing Patterns

`systemPatterns.md` and `techContext.md` are stubs. There are no existing code patterns to respect. **A required deliverable of this creative phase is to populate both files**; they are written from scratch alongside this document. The Guiding Principles for the project come from `productBrief.md` (simplicity over cleverness, 12-Factor, self-host friendly) and from `CLAUDE.md` (OpenTelemetry-first observability, no `console.log`). All decisions below comply with these principles; no deviations are required.

---

## Component Analysis

### Core Components

| Component | Purpose | Responsibilities |
|-----------|---------|------------------|
| **Config Module** | Single source of typed configuration | Read `process.env`, validate with schema, throw on missing required vars at startup, expose immutable typed `config` object |
| **Logger Module** | Structured JSON logging abstraction | Wrap pino, enrich every log line with `service`, `version`, `traceId`, `spanId`; redact sensitive fields; expose `logger` and `getLogger()` (AsyncLocalStorage-aware) |
| **Telemetry Module** | OpenTelemetry SDK bootstrap | Initialize tracer provider, register HTTP instrumentation, configure W3C propagator, wire OTLP exporter when configured |
| **Trace Context Middleware** | Request-scoped trace context | Extract `traceparent` header (or generate root span), enter AsyncLocalStorage scope so logger picks up traceId/spanId for the request |
| **Request Logger Middleware** | One JSON log line per HTTP request | Capture `method`, `path`, `statusCode`, `durationMs`; redact `Authorization`/`Cookie` headers; never log request bodies wholesale |
| **JSON Body Parser** | Parse `application/json` request bodies | `express.json()` with size limit |
| **Error Module** | Domain error contracts | `AppError` base class with `statusCode`, `code`, `expose` flag; concrete subclasses (`BadRequestError`, `NotFoundError`, etc.) |
| **Error Handler Middleware** | Global error handler | Distinguish `AppError` (operational) from unknown `Error` (programmer); produce JSON response with `traceId`; log at appropriate level; never expose stack traces in response body |
| **DB Module** | PostgreSQL connection pool | Owns the `pg.Pool`, exposes `query()` and `getPool()`, exposes `ping()` for `/health`, hooks shutdown to drain |
| **Health Route** | Readiness check | Reports `status`, `service`, `version`, and DB connectivity (200 connected / 503 disconnected) |
| **App Factory** | Build the Express app | Wire middleware in correct order; export `createApp()` so tests can build a fresh app per suite |
| **Server Bootstrap** | Process entrypoint | Initialize telemetry → load config → create app → bind port → handle SIGTERM/SIGINT for graceful shutdown |

### Component Interactions

```
                    ┌──────────────────────────────────────────────┐
                    │  Server Bootstrap (src/server.ts)            │
                    │  init telemetry → load config → createApp()  │
                    └────────────────────┬─────────────────────────┘
                                         │
                                         ▼
                    ┌──────────────────────────────────────────────┐
                    │  Express App (createApp())                   │
                    │                                              │
                    │  Middleware (in order):                      │
                    │    1. trace-context (start root span,        │
                    │       enter AsyncLocalStorage scope)         │
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
       │  (pino +    │◄──reads───┤  (zod-       │         │   (pg.Pool)     │
       │   ALS)      │           │   validated  │◄──reads─┤                 │
       └─────────────┘           │   env)       │         └─────────────────┘
              ▲                  └──────────────┘                  ▲
              │                                                    │
              │           AsyncLocalStorage carries                │
              │           traceId/spanId; logger reads             │
              │           it on every call without                 │
              │           explicit threading                       │
              │                                                    │
              └──────── used by all routes/services ───────────────┘
```

**Key dependency arrows:**
- `server.ts` initializes `telemetry` **before** `config` and `logger` so OTel auto-instrumentation can patch modules.
- All other modules read from `config`. `config` does not depend on `logger` (so config errors don't depend on the logger being up).
- `logger` reads the active span from OTel and the AsyncLocalStorage store to enrich every log line.
- `db` is the only module that holds connection state; everything else is stateless.
- Request handlers never import `pg` directly — they go through `db` or (in later features) a service layer.

---

## Sub-Decision Q1: Folder Layout

### Option A: Flat Pragmatic
```
src/
  routes/        HTTP route handlers
  middleware/    Express middleware (trace-context, request-logger, error-handler)
  services/      Business logic (empty in FEAT-001; populated by FEAT-002+)
  db/            Connection pool, query helpers
  config/        Config module
  logger/        Logger abstraction
  telemetry/     OpenTelemetry SDK bootstrap
  errors/        AppError class hierarchy
  types/         Shared TypeScript types
  app.ts         createApp() factory
  server.ts      Process entrypoint
```

- **Description**: Each folder is named after what it contains. No "layer" abstractions. A new contributor can find request-logger middleware in `middleware/`, the health route in `routes/`, and the user service (later) in `services/`.
- **Pros**:
  - Lowest cognitive overhead — folder names are descriptive nouns, not architectural jargon
  - Matches the mental model most Express tutorials use, so newcomers onboard fast
  - Easy to grep: `grep -r 'health' src/routes/` is intuitive
  - Naturally supports future testing patterns (`tests/unit/db.test.ts` mirrors `src/db/`)
- **Cons**:
  - `services/` is empty in FEAT-001 — placeholder folder feels premature
  - No enforced architectural boundary: a route handler could `import` from `db/` directly, bypassing a service layer (this can be a feature *or* a bug depending on team discipline)
- **Technical Fit**: High — matches "simplicity over abstractions" perfectly
- **Complexity**: Low
- **Scalability**: Medium — at 200 users / 100 routes the flat structure may need sub-grouping (e.g., `routes/auth/`, `routes/boards/`); easy to reorganize later

### Option B: Clean-Architecture Naming
```
src/
  interfaces/    HTTP handlers, middleware (entry points)
    routes/
    middleware/
  application/   Use cases / service layer
  infrastructure/ DB, external services, telemetry
  config/
  logger/
  types/
```

- **Description**: Borrows clean-architecture vocabulary (interfaces / application / infrastructure) without implementing the full pattern (no DI container, no inversion-of-control wiring, no port/adapter formality).
- **Pros**:
  - Communicates layered boundaries through naming
  - Familiar to engineers from clean-architecture / hexagonal backgrounds
  - Encourages putting business logic in `application/` rather than route handlers
- **Cons**:
  - Layer names are abstract — `interfaces/routes/health.ts` reads worse than `routes/health.ts`
  - Risk of cargo-culting clean architecture without its discipline (DI, ports/adapters) — naming implies more rigor than the code provides
  - Three layers is overkill for FEAT-001 (which has near-zero "application" logic) and creates premature structure
  - Conflicts with the productBrief constraint ("favor simplicity, do not introduce DI containers") — naming a folder `interfaces/` while not building real interfaces is a smell
- **Technical Fit**: Low — communicates an architectural pattern that the project explicitly does not adopt
- **Complexity**: Medium
- **Scalability**: Medium

### Option C: Three-Zone Split
```
src/
  api/      Routes, middleware, request/response types
  core/     Business logic, domain types
  infra/    DB, external I/O, telemetry, logger, config
  app.ts
  server.ts
```

- **Description**: Three top-level zones. `api/` is the HTTP boundary, `core/` is domain logic, `infra/` is everything I/O.
- **Pros**:
  - Compact — only three zones to learn
  - Clear "where does this go?" answer for most files
  - Forces I/O concerns to one place
- **Cons**:
  - `core/` is empty in FEAT-001 (no domain yet)
  - Lumping logger + config + telemetry into `infra/` mixes platform concerns with external integrations (logger isn't really "infrastructure" in the same sense as a SQL connection)
  - When `core/` does grow, it tends to need sub-folders anyway (`core/auth/`, `core/boards/`), at which point you've effectively reinvented Option A
- **Technical Fit**: Medium
- **Complexity**: Low
- **Scalability**: Medium

### Decision: Option A — Flat Pragmatic

**Rationale**:

The project explicitly favors simplicity over clever abstractions. Option A is the layout where each folder name describes what is in it, with no architectural overlay. It matches how Express is taught and how most Node services are structured. Option B (clean-architecture naming) labels boundaries it doesn't enforce — a smell. Option C compresses unrelated concerns into `infra/`.

For FEAT-001, the extra folders (`services/`, `errors/`, `telemetry/`) sit nearly empty, but each has a clear and immediate use:
- `errors/` — populated in this milestone with `AppError` and concrete subclasses
- `telemetry/` — populated with the OTel bootstrap module
- `services/` — empty in FEAT-001 by design; FEAT-002 adds `userService`, `authService`. Keeping the folder declared (even with a `.gitkeep`) signals where future logic goes and prevents people putting it in `routes/`.

**Trade-off accepted**: empty `services/` folder in FEAT-001. Justified — preventing the "fat route handler" anti-pattern in FEAT-002 is worth a placeholder.

---

## Sub-Decision Q2: Error-Handling Shape

### Option A: AppError Class Hierarchy + Envelope `{ error: { code, message, traceId } }`

```typescript
// src/errors/AppError.ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;          // stable, machine-readable
  public readonly expose: boolean;       // whether `message` is safe to send to client
  public readonly details?: unknown;     // optional structured detail (e.g., validation errors)

  constructor(opts: {
    statusCode: number;
    code: string;
    message: string;
    expose?: boolean;
    details?: unknown;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = this.constructor.name;
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.expose = opts.expose ?? true;
    this.details = opts.details;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 400, code: 'BAD_REQUEST', message, details });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super({ statusCode: 401, code: 'UNAUTHORIZED', message });
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super({ statusCode: 404, code: 'NOT_FOUND', message });
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ statusCode: 409, code: 'CONFLICT', message, details });
  }
}
```

JSON response envelope:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Board not found",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
    "details": { "boardId": "abc-123" }   // optional
  }
}
```

Error handler logic:
```typescript
// src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from 'express';
import { trace } from '@opentelemetry/api';
import { AppError } from '../errors/AppError';
import { getLogger } from '../logger';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const traceId = trace.getActiveSpan()?.spanContext().traceId ?? '';
  const log = getLogger();

  if (err instanceof AppError) {
    // Operational: expected, log at warn (4xx) or error (5xx)
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    log[level]({ err, code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : 'Internal Server Error',
        traceId,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Programmer error: unexpected, always 500, never expose message
  const error = err instanceof Error ? err : new Error(String(err));
  log.error({ err: error }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal Server Error',
      traceId,
    },
  });
};
```

- **Pros**:
  - `instanceof AppError` is a clear runtime distinction between operational and programmer errors
  - Envelope is namespaced under `error` — easy to extend with additional top-level fields (`meta`, `pagination`) on success responses
  - `expose` flag handles the case where an internal AppError (e.g., DB constraint violation) shouldn't leak its raw message to the client
  - `code` is stable for clients to switch on (e.g., frontend knows to redirect on `UNAUTHORIZED`)
  - `details` slot accommodates field-level validation errors without changing the envelope shape
- **Cons**:
  - Class hierarchy has to be maintained — adding new error types requires editing `errors/`
  - `instanceof` works across module boundaries because we own the class; no cross-realm issues at this scale
- **Technical Fit**: High
- **Complexity**: Low
- **Scalability**: High — same envelope works for FEAT-002 (auth errors), FEAT-003 (board permission errors), validation errors, etc.

### Option B: Plain Error + Type-Guard Middleware + Envelope `{ message, traceId, code }`

- Use plain `Error`; attach `statusCode`/`code` as ad-hoc properties; the error handler reads them defensively.
- Flatter envelope.

- **Pros**: less boilerplate at error-creation sites
- **Cons**:
  - No type safety on `statusCode`/`code` — easy to forget
  - `instanceof Error` is the only way to distinguish "errors we know about" from "errors we don't" — can't tell operational from programmer errors apart by class
  - Flatter envelope (`{ message, traceId, code }`) puts arbitrary error fields at the top level alongside future fields like `meta`; future-extensibility cost
- **Technical Fit**: Low — drops the operational/programmer distinction the spec explicitly asks for
- **Complexity**: Low (initially)
- **Scalability**: Medium

### Option C: Result<T, E> Pattern (Rust-style, no exceptions)

- Functions return `Result<T, AppError>` instead of throwing.

- **Pros**: errors are part of function signatures; impossible to forget to handle them
- **Cons**:
  - Every Express handler must `unwrap()` and call `next(error)` — boilerplate at every layer
  - Requires either a custom Result type or a library (`neverthrow`, `fp-ts`); adds a dependency and a learning curve
  - Express middleware ecosystem assumes throwing `Error`; mismatch
  - Conflicts with "simplicity over abstractions"
- **Technical Fit**: Low
- **Complexity**: High

### Decision: Option A — AppError Hierarchy + Namespaced Envelope

**Rationale**:

Option A directly answers all three sub-decisions:

1. **Class hierarchy**: `AppError` base + concrete subclasses. The base carries `statusCode`, `code`, `expose`, and optional `details`. Subclasses encode common cases.
2. **Envelope**: `{ error: { code, message, traceId, details? } }`. Namespacing under `error` keeps the door open for future top-level keys.
3. **Operational vs. programmer**: `instanceof AppError` is the test. Operational errors keep their declared `statusCode` and (if `expose`) their `message`. Programmer errors collapse to a generic 500 with `INTERNAL_ERROR`.

This satisfies AC-ERROR-1 (JSON body with traceId, status from error, no HTML) and gives FEAT-002+ a stable contract.

**Trade-off accepted**: a class hierarchy must be maintained as new error types are added. Justified — having ~6 error classes to switch on is straightforward; the alternative (defensive property checks on plain Error) is more error-prone at scale.

---

## Sub-Decision Q3: Logger Abstraction

### Option A: pino + AsyncLocalStorage + OpenTelemetry Bridge

- **Library**: `pino` — JSON-native, the fastest production logger in the Node ecosystem (~5-10x faster than winston), has a healthy plugin ecosystem (`pino-http`, `pino-pretty` for dev).
- **Injection pattern**: Module-level singleton `logger` plus an AsyncLocalStorage-based context store. Every log line is enriched at write-time with the trace context (traceId/spanId) from the active OpenTelemetry span and any per-request bindings (e.g., userId once auth is wired) from the ALS store.
- **traceId propagation**: The trace-context middleware extracts (or generates) a W3C Trace Context, then runs the rest of the request pipeline inside `asyncLocalStorage.run(...)`. Anywhere downstream — including service-layer functions called from a route — calling `getLogger()` returns a child logger pre-bound with `traceId`/`spanId`.

```typescript
// src/logger/index.ts
import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';
import { trace } from '@opentelemetry/api';
import { config } from '../config';

interface RequestContext {
  // Per-request fields set by middleware. Trace IDs are read from OTel's
  // active span at log-time, not stored here, to ensure they're always fresh.
  bindings?: Record<string, unknown>;
}

const als = new AsyncLocalStorage<RequestContext>();

const baseLogger = pino({
  level: config.LOG_LEVEL,
  base: {
    service: config.SERVICE_NAME,
    version: config.SERVICE_VERSION,
    env: config.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),  // "info" not 30
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
  transport: config.LOG_FORMAT === 'text'
    ? { target: 'pino-pretty', options: { singleLine: true } }
    : undefined,
});

/**
 * Returns a logger enriched with the active trace context and any
 * AsyncLocalStorage-bound request fields. Use this everywhere; do not
 * use the bare `baseLogger`.
 */
export function getLogger(): pino.Logger {
  const span = trace.getActiveSpan();
  const ctx = als.getStore();
  const bindings: Record<string, unknown> = { ...(ctx?.bindings ?? {}) };
  if (span) {
    const sc = span.spanContext();
    bindings.traceId = sc.traceId;
    bindings.spanId = sc.spanId;
  }
  return Object.keys(bindings).length > 0 ? baseLogger.child(bindings) : baseLogger;
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

// Bare logger for startup/shutdown lines (no request context yet).
export const logger = baseLogger;
```

```typescript
// src/middleware/traceContext.ts
import type { RequestHandler } from 'express';
import { runWithContext } from '../logger';

export const traceContextMiddleware: RequestHandler = (_req, _res, next) => {
  // OpenTelemetry's HTTP instrumentation already extracts the W3C
  // traceparent header and starts a server span before this middleware
  // runs, so trace.getActiveSpan() returns the right span.
  // We just enter an ALS scope so getLogger() can pick up per-request
  // bindings (e.g., the eventual userId from auth middleware).
  runWithContext({ bindings: {} }, () => next());
};
```

- **Pros**:
  - Logger calls in any service or helper function automatically get traceId/spanId — no parameter threading
  - pino is the fastest JSON logger in Node; matches the <50ms platform overhead target
  - Built-in redaction handles AC-NFR-3 (Authorization, Cookie, password, token, secret)
  - `pino-pretty` transport in dev gives human-readable logs; production stays JSON
  - OTel HTTP instrumentation handles W3C Trace Context extraction/injection automatically — we don't write that code
- **Cons**:
  - AsyncLocalStorage adds a small constant overhead per async hop (~microseconds; negligible at our scale)
  - Two ways to log (`logger` for startup, `getLogger()` for request handlers) — simple convention, but a contributor could pick the wrong one
- **Technical Fit**: High — pino is the recommended pairing in `observability-requirements.md`
- **Complexity**: Medium
- **Scalability**: High — pattern works for FEAT-002+ and any future async work (jobs, queues)

### Option B: winston + per-request child logger via `req.logger`

- Inject a child logger onto `req` in middleware; pass `req.logger` through to services as a parameter.

- **Pros**: explicit; no global state; easy to reason about
- **Cons**:
  - Requires every service function to accept `logger` as a parameter — pollutes signatures
  - When a service calls another service, passing the logger threads it through every layer
  - winston is ~5-10x slower than pino on JSON output (relevant to the 50ms budget)
  - If you forget to pass the logger somewhere, that code path silently logs without traceId
- **Technical Fit**: Medium
- **Complexity**: Low (mechanically) but spreads through the codebase
- **Scalability**: Low — every new service signature has to thread `logger` through

### Option C: Raw OpenTelemetry Logs API

- Use `@opentelemetry/sdk-logs` and `@opentelemetry/api-logs` directly.

- **Pros**: forward-compatible; logs flow through the same OTLP pipeline as traces and metrics
- **Cons**:
  - The Node OTel Logs SDK is still early — fewer integrations, less mature transport
  - No built-in redaction patterns
  - No `child()` or per-request bindings without writing them yourself
  - Slower to develop with than pino
- **Technical Fit**: Low for now (would be Medium in 12-18 months)
- **Complexity**: High

### Decision: Option A — pino + AsyncLocalStorage

**Rationale**:

Pino is the standard for high-performance JSON logging in Node. Pairing it with AsyncLocalStorage is the idiomatic pattern for request-scoped context propagation in modern Node.js (since Node 16). The combination satisfies every requirement:
- Structured JSON: pino is JSON-native
- traceId on every log line: read from `trace.getActiveSpan()` in `getLogger()`
- No `console.log`: ESLint `no-console` rule + pino is the only logger imported
- Redaction: pino's `redact` config handles Authorization, Cookie, password, token, secret
- Configurable: `LOG_LEVEL`, `LOG_FORMAT` come from config module
- No parameter threading: AsyncLocalStorage carries context across async boundaries

The OTel Logs API (Option C) would be the long-term ideal but is too immature today. Bridging pino to OTLP is an option later (`@opentelemetry/instrumentation-pino` exists), and the abstraction we're building (`getLogger()`) makes that swap easy.

**Trade-off accepted**: small ALS overhead and a two-logger convention (`logger` for startup, `getLogger()` for request handlers). Justified — pino + ALS is a well-trodden path; the ergonomic win is large.

---

## Sub-Decision Q4: Config Layer

### Option A: dotenv + zod schema, exporting a typed `config` object

```typescript
// src/config/index.ts
import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Service identity
  SERVICE_NAME: z.string().default('banyanboard-api'),
  SERVICE_VERSION: z.string().default('0.1.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
  LOG_OUTPUT: z.enum(['stdout', 'file', 'both']).default('stdout'),
  LOG_FILE_PATH: z.string().optional(),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.enum(['http/protobuf', 'grpc']).default('http/protobuf'),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_TRACES_SAMPLER: z.string().default('parentbased_traceidratio'),
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1.0),
  OTEL_SDK_DISABLED: z.coerce.boolean().default(false),
}).superRefine((cfg, ctx) => {
  if ((cfg.LOG_OUTPUT === 'file' || cfg.LOG_OUTPUT === 'both') && !cfg.LOG_FILE_PATH) {
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

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return result.data;
}

// Module-level singleton — loaded once at import time, validated, frozen.
export const config: Config = Object.freeze(loadConfig());
```

- **Pros**:
  - Type-safe at compile time AND validated at runtime — `config.PORT` is `number`, not `string`
  - One source of truth: schema declares which vars exist, their types, defaults, and cross-field constraints
  - Clear error messages — zod aggregates ALL invalid/missing vars into one error, not just the first one
  - `loadConfig(env)` accepts an env override → tests can build a config from a custom object
  - `Object.freeze` makes the singleton immutable
- **Cons**:
  - Adds zod as a dependency (small; ~70KB; we'll need it anyway for FEAT-002 input validation)
- **Technical Fit**: High
- **Complexity**: Low
- **Scalability**: High — schema grows naturally as new env vars are added in FEAT-002+

### Option B: node-config

- Uses files (`config/default.json`, `config/production.json`) with environment overlays.

- **Pros**: well-known in some Node communities; supports config inheritance
- **Cons**:
  - Conflicts with 12-Factor: encourages config in files, not env vars (the constraint in CLAUDE.md is explicit)
  - Harder to test — config files in `config/` get loaded automatically; can't easily mock per-test
  - Type safety is opt-in; default usage is untyped
- **Technical Fit**: Low — fights the 12-Factor constraint
- **Complexity**: Medium
- **Scalability**: Medium

### Option C: Plain `process.env` with manual checks

```typescript
export const config = {
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL ?? throwMissing('DATABASE_URL'),
  // ...
};
```

- **Pros**: zero dependencies; trivial to read
- **Cons**:
  - Manually maintained type assertions — `parseInt(undefined as any)` traps lurk
  - No cross-field validation (e.g., LOG_FILE_PATH required when LOG_OUTPUT includes file)
  - Errors fire one at a time — operator fixes `PORT`, runs again, hits `DATABASE_URL`, fixes that, runs again, hits `LOG_LEVEL`. Painful for first-run setup.
  - Re-implementing what zod does in 30 lines of error-prone code
- **Technical Fit**: Medium
- **Complexity**: Low (initially) → Medium (as fields multiply)
- **Scalability**: Low

### Decision: Option A — dotenv + zod

**Rationale**:

zod gives type safety, runtime validation, defaults, cross-field rules, and aggregated error messages — all in one declarative schema. dotenv reads `.env` for local dev (and is a no-op in production where env vars come from Docker Compose / the host). zod will be needed in FEAT-002 anyway for request body validation, so it's not net-new.

**Module structure**: `src/config/index.ts` exports a typed singleton `config` and the `loadConfig(env)` factory. Test override pattern: tests import `loadConfig` and pass a custom `env` object — they do not mutate `process.env` (which would leak across tests). Tests that need to test the *singleton* startup behavior can use Vitest's `vi.resetModules()` + `vi.stubEnv()`.

**Trade-off accepted**: zod dependency added now. Justified — needed for FEAT-002 anyway; the schema-first approach pays for itself on day one with aggregated startup errors.

---

## Sub-Decision Q5: Database Access Shape

### Option A: Raw `pg.Pool` with thin query helpers, defer ORM/builder choice

```typescript
// src/db/index.ts
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,                       // tuned for 20-50 user load
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database ping failed');
    return false;
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}

export function getPool(): Pool {
  return pool;
}
```

- **Pros**:
  - Minimal: one dependency (`pg`), no ORM magic
  - Explicit SQL — devs see exactly what runs
  - The `Pool` is the same one FEAT-002 will use for `connect-pg-simple` (pg session store)
  - Migration tool choice (e.g., `node-pg-migrate`) is independent of this — works with raw `pg`
- **Cons**:
  - Hand-written SQL has no compile-time type checking against the schema (but FEAT-001 only does `SELECT 1`)
  - When the schema lands in FEAT-002, query helpers will need to grow — possibly to a query builder
- **Technical Fit**: High
- **Complexity**: Low
- **Scalability**: Medium — works fine through FEAT-004; if SQL becomes complex, adding `kysely` later is a straightforward refactor

### Option B: kysely query builder from day one

- **Pros**:
  - Type-safe SQL via TypeScript schema definitions
  - Built-in migration runner
  - Compile-time errors on column typos
- **Cons**:
  - Requires defining the schema in TypeScript types now — but FEAT-001 has no schema
  - Adds a dependency that does no work in FEAT-001 (the only query is `SELECT 1`)
  - Front-loads complexity that's only useful in FEAT-002+

### Option C: ORM (TypeORM, Prisma)

- **Pros**: full object-relational mapping
- **Cons**:
  - Conflicts with "simplicity over abstractions"
  - Prisma adds a separate schema language and code-generation step
  - TypeORM has well-known performance and lifecycle issues
  - Both are heavy for a 10k-card / 100-board target

### Decision: Option A — Raw pg.Pool with thin helpers, defer richer query layer

**Rationale**:

FEAT-001's database needs are: a connection pool, a `SELECT 1` ping, and graceful shutdown. Anything beyond raw `pg` is unjustified at this stage. The choice does NOT preclude FEAT-002's options — `node-pg-migrate` works against raw `pg` for migrations, `connect-pg-simple` accepts a `pg.Pool` for session storage, and `kysely` (if chosen later) wraps a `pg.Pool`.

**Trade-off accepted**: when FEAT-004 (cards with ordering) lands, hand-written SQL may become tedious. Justified — by then we'll have concrete queries and can evaluate `kysely` against the actual usage. Premature commitment now would lock in an answer to a question we can't yet ask.

**Migration tooling**: deferred to FEAT-002 with a documented preference for `node-pg-migrate` (lightweight, plain SQL files, plays well with raw `pg`).

---

## Evaluation Matrix

(Aggregate across the five sub-decisions; numbers are 1=Low, 5=High.)

| Criteria | Option A (chosen) | Option B (alt) | Option C (alt) |
|----------|-------------------|----------------|----------------|
| Scalability | 4 | 3 | 2 |
| Maintainability | 5 | 3 | 2 |
| Performance | 5 (pino + raw pg) | 3 | 3 |
| Security | 5 (zod validation, pino redact) | 3 | 3 |
| Observability | 5 (OTel-native, ALS-aware logger) | 3 | 4 (OTel logs API mature later) |
| Implementation Cost | 4 (low complexity) | 3 | 2 |

---

## Observability Architecture

### Logging

- **Library**: `pino` v9 (latest stable at time of writing)
- **Format**: Structured JSON, one line per event
- **Required fields on every log line**:
  - `timestamp` (ISO 8601, via `pino.stdTimeFunctions.isoTime`)
  - `level` (string label: `trace`/`debug`/`info`/`warn`/`error`/`fatal`)
  - `service`, `version`, `env` (set in `pino` `base`)
  - `traceId`, `spanId` (added by `getLogger()` from active OTel span)
  - `msg` (pino's standard message field)
- **Redaction**: pino `redact` config covers `req.headers.authorization`, `req.headers.cookie`, `req.headers["set-cookie"]`, `password`, `token`, `secret` (top-level and nested); replaced with `[REDACTED]`.
- **Configuration**: `LOG_LEVEL`, `LOG_FORMAT` (json/text), `LOG_OUTPUT` (stdout/file/both), `LOG_FILE_PATH`. In `text` mode (dev only), pipes through `pino-pretty` for readability.

### Distributed Tracing

- **SDK**: OpenTelemetry Node.js SDK (`@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`)
- **Propagation**: W3C Trace Context (default in OpenTelemetry); `traceparent` and `tracestate` headers
- **Auto-instrumented**:
  - HTTP server (Express middleware) — extracts `traceparent`, starts root span, writes `traceparent` on outgoing responses
  - HTTP client — injects `traceparent` on outgoing requests (relevant for FEAT-003+ when SMTP/external calls appear)
  - `pg` — wraps queries in spans following `db.system=postgresql` semantic conventions
- **Service Boundaries** (as the system grows):

  | From | To | Protocol | Propagation Method |
  |------|-----|----------|-------------------|
  | External client | API | HTTP | `traceparent` header (extracted by OTel HTTP instrumentation) |
  | API | PostgreSQL | TCP/pg-proto | OTel pg instrumentation creates child spans |
  | API | SMTP server (FEAT-003+) | SMTP | Manual span creation; SMTP does not carry W3C context |
  | API | Future webhook consumers | HTTP | `traceparent` header (auto-injected by OTel HTTP instrumentation) |

- **Sampling**: `OTEL_TRACES_SAMPLER=parentbased_traceidratio`, `OTEL_TRACES_SAMPLER_ARG=1.0` in dev/test, recommended `0.1` in prod (operator-tunable). Honor parent decision when `traceparent` is present.
- **Exporter**: When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, use OTLP/HTTP. When unset (dev), use the SDK's no-op export — spans still flow through `trace.getActiveSpan()` so logger enrichment works.

### Metrics

- **Format**: OpenTelemetry → Prometheus (via OTLP or `prom-client` adapter; deferred until first metric is needed)
- **Standard Metrics** (auto-instrumented when OTel is enabled):
  - `http_server_request_duration_seconds{method, route, status_code}` (histogram)
  - `http_server_active_requests{method}` (gauge)
- **Custom Business Metrics** (added in later features):
  - FEAT-002: `auth_login_attempts_total{outcome}` (counter)
  - FEAT-004: `cards_created_total{board_id_bucket}` (counter; bucket high-cardinality labels)
- **Cardinality**: never use raw user IDs, board IDs, or request IDs as labels. FEAT-001 does not introduce any custom metrics.

### Configuration Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `NODE_ENV` | Runtime environment | `development` | No |
| `PORT` | HTTP listen port | `3000` | No |
| `SERVICE_NAME` | Service identifier (logs, traces) | `banyanboard-api` | No |
| `SERVICE_VERSION` | Service version (logs, traces) | `0.1.0` (read from package.json in build) | No |
| `DATABASE_URL` | PostgreSQL connection string | — | **Yes** |
| `LOG_LEVEL` | Log verbosity | `info` | No |
| `LOG_FORMAT` | `json` (prod) or `text` (dev pretty-print) | `json` | No |
| `LOG_OUTPUT` | `stdout` / `file` / `both` | `stdout` | No |
| `LOG_FILE_PATH` | File path for file output | — | If `LOG_OUTPUT` includes `file` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collector URL | — | In production |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | OTLP transport | `http/protobuf` | No |
| `OTEL_SERVICE_NAME` | OTel service identity (overrides `SERVICE_NAME` for traces) | (`SERVICE_NAME`) | No |
| `OTEL_TRACES_SAMPLER` | Sampler strategy | `parentbased_traceidratio` | No |
| `OTEL_TRACES_SAMPLER_ARG` | Sampling ratio (0..1) | `1.0` | No |
| `OTEL_SDK_DISABLED` | Disable all telemetry | `false` | No |

---

## Decision Summary

**Chosen Architecture**: Flat-pragmatic `src/` layout + `AppError` hierarchy with namespaced JSON envelope + pino + AsyncLocalStorage logger + dotenv + zod config + raw `pg.Pool` with thin helpers.

The five sub-decisions are reinforcing, not orthogonal. The pino logger uses AsyncLocalStorage to read the active OTel span set up by the HTTP instrumentation — that's why `getLogger()` works without parameter threading. The config module is the single source of all env vars including `LOG_LEVEL`, `OTEL_*`, `DATABASE_URL` — that's why each module just reads `config.X` rather than re-parsing `process.env`. The `AppError` class carries the same `traceId` (read from `trace.getActiveSpan()`) into the JSON response that the logger writes into the error log line — that's why AC-ERROR-1's "traceId in response matches log" works out of the box. The flat folder layout is what makes all of this discoverable: `src/config/`, `src/logger/`, `src/errors/`, `src/middleware/errorHandler.ts`, `src/db/` — each is named for what it contains, and each is one cohesive piece of the architecture.

### Trade-offs Accepted

- **Empty `services/` folder in FEAT-001**: justified — gives FEAT-002 a clear home for `userService`, `authService` and prevents the fat-route-handler anti-pattern.
- **AsyncLocalStorage adds microsecond per-async-hop overhead**: justified — the alternative (parameter-threaded loggers) is a larger and more pervasive cost.
- **zod dependency added now**: justified — needed in FEAT-002 anyway for request validation; the runtime validation it provides for the config layer pays for itself on day one.
- **Hand-written SQL until FEAT-004**: justified — premature commitment to a query builder is exactly the kind of clever-over-simple choice the productBrief warns against.
- **No metrics collected in FEAT-001**: justified — the SDK is wired and the standard metrics will start flowing the moment OTLP is configured; custom metrics belong with the features that produce them.

---

## Implementation Guidelines

1. **Boot order** (in `src/server.ts`):
   1. Initialize the OpenTelemetry SDK **before** any other import that could create spans (use `--require ./dist/telemetry/init.js` or top-of-file side-effect import).
   2. Import config (validates env, throws on missing required vars).
   3. Import logger (singleton initialized from config).
   4. Build the Express app via `createApp()`.
   5. Bind `pool` to the DB; do not block startup on DB readiness — health endpoint reports DB state separately.
   6. Listen on `config.PORT`; log a structured info line including `service`, `version`, `port`.
   7. Register SIGTERM/SIGINT handlers: stop accepting new connections, drain the request queue (with a 10-second timeout), call `pool.end()`, exit 0.

2. **Middleware order** (in `createApp()`):
   1. `traceContextMiddleware` — enter the AsyncLocalStorage scope (OTel HTTP instrumentation has already extracted `traceparent` and started the server span).
   2. `express.json({ limit: '100kb' })` — body parsing with a tight limit; oversized bodies become 413 errors.
   3. `requestLoggerMiddleware` — emits one JSON log line on response finish containing `method`, `path`, `statusCode`, `durationMs`, `traceId`, `spanId`. Uses `pino-http` configured against the singleton logger.
   4. Routes (`/health` in FEAT-001).
   5. `notFoundHandler` — converts unmatched routes into `new NotFoundError('Route not found')`.
   6. `errorHandler` — last middleware; converts `AppError` (or unknown errors) into the JSON envelope.

3. **Logger usage**:
   - **In request scope** (route handlers, middleware, services called from routes): always `import { getLogger } from '../logger'` and call `const log = getLogger()` at the top of each function. Do NOT cache it across requests.
   - **At startup/shutdown** (no request scope): import the bare `logger` singleton.
   - **NEVER** use `console.log`, `console.error`, `console.warn`, `console.debug`. Enforced by ESLint `no-console` rule.

4. **Error handling**:
   - Throw `AppError` subclasses for expected error conditions; the error handler maps them to status codes and JSON.
   - Let unexpected errors propagate; the error handler will catch them and return a generic 500.
   - When wrapping a lower-level error, pass it as `cause` so the stack trace is preserved in logs (and never in the response body).

5. **Config**:
   - All config reads go through the `config` singleton from `src/config`.
   - Tests that need to vary config build a fresh `loadConfig(testEnv)` rather than mutating `process.env`.
   - The `.env.example` file at repo root documents every variable from the schema with example values — keep it in sync with the schema (lint check optional in v0.2.0).

6. **Database**:
   - Only `src/db/` may import `pg`. Other modules call `query()`, `getPool()`, `ping()`, `shutdown()` from `src/db`.
   - When FEAT-002 introduces migrations, add `node-pg-migrate` and a `migrations/` directory at repo root. Migrations run via `npm run migrate` and as a one-shot Docker Compose service before API startup.

7. **Testing**:
   - Unit tests use Vitest; integration tests use Vitest + `supertest` against `createApp()` with a test DB (Docker Compose `test` profile, OR `pg-mem` for query-shape unit tests; FEAT-001 only needs the live DB for the health-check integration test).
   - Tests that capture stdout for log assertions use a custom pino destination stream (`pino.destination(memWriter)`) rather than spying on `process.stdout`.

---

## Validation Checklist

- [x] Meets all system requirements (Express + TS, PG connection, Docker Compose, base middleware, /health, structured logger, config layer)
- [x] Respects technical constraints (simplicity, no DI container, 12-Factor, single-host)
- [x] Addresses non-functional requirements (OTel-first, p95<50ms platform overhead, no console.log, no sensitive data in logs)
- [x] Technically feasible — every library named is mature, well-known, and supported
- [x] Risks identified and acceptable (see Risk Assessment)
- [x] Complies with Guiding Principles in `systemPatterns.md` (this document defines them; no deviations needed)
- [x] Respects established patterns in `systemPatterns.md` (this document seeds them)
- [x] Observability architecture defined (logging, tracing, metrics, propagation)
- [x] Trace context propagation across all service boundaries (HTTP server, HTTP client, pg — auto-instrumented)
- [x] Logging strategy consistent with `observability-requirements.md` (pino + traceId/spanId/service/version/level/timestamp)
- [x] Metrics strategy follows naming conventions (Prometheus-style; bounded cardinality; deferred to feature-by-feature additions)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pino + ALS performance overhead exceeds 50ms target | Low | Medium | Benchmark with `autocannon` against `/health` in Phase 4; pino's overhead is sub-millisecond per log; ALS is microseconds per async hop. If exceeded, profile with `clinic` and tune. |
| OTel auto-instrumentation slows startup or first request | Low | Low | Disable the auto-instrumentation modules we don't need (e.g., DNS, net) via `OTEL_NODE_DISABLED_INSTRUMENTATIONS`. Initialize SDK before app import so JIT cost is at startup, not request time. |
| zod schema validation adds startup latency | Very Low | Low | zod parses once at boot; cost is sub-millisecond for ~15 fields. Not on the request path. |
| Empty `services/` folder gets misused — devs put domain logic in routes | Medium | Medium | Document the convention in `systemPatterns.md`; review during FEAT-002. ESLint custom rule (deferred) could enforce later. |
| Raw SQL gets unwieldy by FEAT-004 (cards with ordering) | Medium | Medium | Re-evaluate at FEAT-004 planning. Adding `kysely` later is mechanical — `pg.Pool` stays underneath. |
| OpenTelemetry SDK API churn (Node SDK is still pre-1.0 for some packages) | Medium | Low | Pin major versions; the abstraction `getLogger()` insulates application code from the SDK API; upgrade in a dedicated maintenance task. |
| `pg.Pool` connection storms on cold start | Low | Low | Pool starts empty; connections lazily; `connectionTimeoutMillis: 5000` bounds worst-case. PG can handle 10-connection pool trivially. |
| AsyncLocalStorage lost across some library callbacks | Low | Medium | All in-process libraries we use (express, pg, pino) preserve ALS context. If a future library breaks it, wrap its callbacks with `als.run()`. |

---

## Next Steps

1. Update `memory-bank/systemPatterns.md` with the chosen patterns (folder layout, error contract, logger interface, config signature, DB shape) — done as part of this creative phase.
2. Update `memory-bank/techContext.md` with the tech stack (Node 22 LTS, Express 4, TypeScript 5.5+, pino, zod, pg, Vitest, ESLint, Prettier), development commands (`dev`, `build`, `start`, `test`, `lint`), and Docker Compose structure — done as part of this creative phase.
3. Hand off to `/banyan-build TASK-001` Phase 1 (project foundation: package.json, tsconfig, Docker Compose, ESLint/Prettier, config layer, .env.example).

---

ARCHITECTURE CREATIVE COMPLETE
Document: memory-bank/creative/TASK-001-platform-architecture.md
Decision: Flat src/ layout with `AppError`+namespaced JSON envelope, pino+AsyncLocalStorage logger, dotenv+zod config, raw pg.Pool — all under OpenTelemetry-first observability.
