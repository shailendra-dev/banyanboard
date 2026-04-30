# Archive: TASK-001 Phase 2 — Logger & Tracing Middleware

## Metadata
- **Task ID**: TASK-001
- **Phase**: 2 of 4
- **Complexity**: Level 3
- **Phase Started**: 2026-04-28 (interrupted); resumed 2026-04-30
- **Phase Completed**: 2026-04-30
- **Roadmap Link**: FEAT-001 (BanyanBoard v0.1.0 Foundation)

---

## Phase Goal

Establish the structured logging and W3C Trace Context infrastructure that every subsequent feature will build on. This phase is a prerequisite for Phase 3 (HTTP Layer), which wires the middleware into an Express app.

---

## What Was Built

### Core Deliverables

| File | Purpose |
|------|---------|
| `src/logger/index.ts` | pino + AsyncLocalStorage logger factory; lazy module-level singleton |
| `src/logger/http.ts` | pino-http request-logger middleware (owned by `src/logger/` per ESLint rule) |
| `src/telemetry/index.ts` | OTel NodeSDK bootstrap; reads `OTEL_*` env vars before config validates |
| `src/middleware/traceContext.ts` | Enters ALS scope per request (OTel HTTP instrumentation handles span creation) |
| `src/middleware/requestLogger.ts` | Thin re-export of `requestLoggerMiddleware` from `src/logger/http.ts` |
| `src/services/.gitkeep` | Placeholder — prevents fat-route-handler anti-pattern in FEAT-002 |
| `src/types/.gitkeep` | Placeholder — home for shared TypeScript types in FEAT-002+ |
| `tests/unit/logger.test.ts` | 4 unit tests — JSON output, required fields, trace propagation |
| `tests/setup/otel.ts` | Registers `AsyncLocalStorageContextManager` for tests |
| `vitest.config.ts` | Added `setupFiles: ['tests/setup/otel.ts']` |

### Test Results
- **8/8 tests passing** (4 config from Phase 1 + 4 logger from Phase 2)
- **Build**: PASS (`tsc -p tsconfig.build.json`)
- **Lint**: PASS (`eslint . && tsc --noEmit`)

---

## Key Decisions & Rationale

### 1. `requestLoggerMiddleware` lives in `src/logger/http.ts`, not `src/middleware/`

The ESLint `no-restricted-imports` rule restricts `pino` and `pino-http` to `src/logger/`. Moving the pino-http factory into `src/logger/http.ts` keeps pino ownership consolidated; `src/middleware/requestLogger.ts` is a thin re-export. This was the correct architectural call — discovered during the lint pass.

### 2. OTel context manager must be registered in tests

Without the OTel SDK running, `@opentelemetry/api` uses a `NoopContextManager` — `context.with()` is a no-op and `trace.getActiveSpan()` always returns `undefined`. The fix: `tests/setup/otel.ts` registers `AsyncLocalStorageContextManager` before any test runs. Added to `vitest.config.ts` as a `setupFiles` entry.

### 3. Custom `timestamp` field via pino's timestamp function

The AC requires a field named `timestamp` (ISO 8601). pino's `stdTimeFunctions.isoTime` names the field `time`. Used a custom function `(): string => \`,"timestamp":"${new Date().toISOString()}"\`` to match the AC exactly.

### 4. `createLogger(cfg, dest?)` factory for testability

The production module uses a lazy singleton backed by the `config` Proxy. Tests call `createLogger(testConfig, memoryStream)` directly — they never touch `process.env` or the singleton. This keeps unit tests hermetic and avoids requiring `DATABASE_URL` in test setup.

### 5. pino-http `customLogLevel` return type

TypeScript requires `LevelWithSilent` (a pino union type), not `string`, for `customLogLevel`. Discovered during the build pass — needed an explicit import of `type { LevelWithSilent } from 'pino'`.

---

## Test Coverage

| Test | File | AC Covered |
|------|------|-----------|
| Log line is valid JSON | logger.test.ts | AC-HAPPY-2 |
| Required fields: service, level, timestamp | logger.test.ts | AC-HAPPY-2 |
| traceId/spanId from active OTel span | logger.test.ts | AC-HAPPY-2, AC-HAPPY-3 |
| No traceId when no span active | logger.test.ts | Baseline behavior |

---

## Files Changed

- `src/logger/index.ts` — **New**: pino + ALS logger with `createLogger()`, `getLogger()`, `logger`, `runWithContext()`
- `src/logger/http.ts` — **New**: pino-http request-logger factory
- `src/telemetry/index.ts` — **New**: OTel NodeSDK bootstrap
- `src/middleware/traceContext.ts` — **New**: ALS scope entry middleware
- `src/middleware/requestLogger.ts` — **New**: re-export of `requestLoggerMiddleware`
- `src/services/.gitkeep`, `src/types/.gitkeep` — **New**: placeholder directories
- `tests/unit/logger.test.ts` — **New**: 4 logger unit tests
- `tests/setup/otel.ts` — **New**: OTel context manager registration
- `vitest.config.ts` — **Updated**: `setupFiles` added
- `memory-bank/techContext.md` — **Updated**: OTel test pattern documented
- `memory-bank/progress.md` — **Updated**: Phase 2 summary appended

---

## Commit Reference

- `dc4e410` — "Phase 2: Logger & Tracing Middleware (TASK-001)" (also brings in all Phase 1 scaffolding which was untracked)

---

## What Phase 3 Depends On

Phase 3 (HTTP Layer & Health Endpoint) will wire these Phase 2 modules into an Express app:
- Import `./telemetry/index.js` first in `server.ts` (side-effect init)
- Call `createApp()` in `app.ts` with middleware order: `traceContextMiddleware` → `express.json()` → `requestLoggerMiddleware` → routes → `notFoundHandler` → `errorHandler`
- Create `src/errors/AppError.ts` + `src/db/index.ts` + `src/routes/health.ts`
- Wire `src/app.ts` + `src/server.ts`
