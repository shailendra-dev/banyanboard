# Progress Log

## 2026-04-28 — Phase 1: Project Foundation — COMPLETE (TASK-001)

### What Was Built
- `package.json`: banyanboard-api manifest with all deps (express, zod, dotenv, pg, pino) and devDeps (vitest, typescript, eslint 9, prettier)
- `tsconfig.json` / `tsconfig.build.json`: TypeScript strict mode; NodeNext module resolution; build excludes tests
- `vitest.config.ts`: Vitest 2, node environment, module isolation enabled
- `eslint.config.js`: ESLint 9 flat config — `no-console: error` on src/, `no-restricted-imports` enforcing module ownership (pg→db/, pino→logger/, dotenv→config/), with correct carve-outs per owner
- `.prettierrc`: Standard formatting config
- `.env.example`: Documents all env vars (PORT, DATABASE_URL, LOG_LEVEL, LOG_FORMAT, LOG_OUTPUT, OTEL_*)
- `docker-compose.yml`: API + postgres:16 services; postgres healthcheck; API depends_on healthy postgres; credentials via POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB env vars (not hardcoded)
- `.gitignore`: node_modules, dist, .env, coverage
- `src/config/index.ts`: zod + dotenv config module; `loadConfig(env?)` factory for hermetic tests; frozen Proxy singleton; aggregated error on missing required vars; DATABASE_URL validated as URL
- `README.md`: Quick start, dev commands, env var reference, project structure, architecture highlights

### Test Summary
- Tests: 4/4 passing (tests/unit/config.test.ts)
- Batches: 1 executed (Config Module)
- Code Review: APPROVED (0 blocking, 4 recommended applied)
- Lint: PASS
- Build: PASS (tsc -p tsconfig.build.json)

### Files Created
- `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`
- `eslint.config.js`, `.prettierrc`, `.env.example`, `.gitignore`
- `docker-compose.yml`
- `src/config/index.ts`
- `tests/unit/config.test.ts`
- `README.md`

### Security Notes
- 2 DEDICATED-TASK security items deferred to projectbrief.md:
  - vitest 2→4 (GHSA-4w7w-66w2-5vf9, GHSA-67mh-4wv8-2f99) — dev-only, LOW priority
  - uuid transitive via OTel (GHSA-w5hq-g745-h8pq) — not triggerable by OTel usage, LOW priority

### Technical Debt / Notes
- None introduced. The Proxy singleton pattern for `config` is a deliberate trade-off (test hermeticity) documented inline.

**Phase 1 Archive**: `memory-bank/archive/archive-TASK-001-phase1.md`

---

## 2026-04-30 — Phase 2: Logger & Tracing Middleware — COMPLETE (TASK-001)

### What Was Built
- `src/logger/index.ts`: pino + AsyncLocalStorage logger; `createLogger(cfg, dest?)` factory; lazy module-level singleton (`getLogger`, `logger`, `runWithContext`); traceId/spanId enrichment from active OTel span; pino redact for authorization/cookie/password/token/secret; `LOG_FORMAT=text` pipes through pino-pretty for dev
- `src/logger/http.ts`: pino-http request-logger middleware factory; lives in `src/logger/` per ESLint ownership rule; renames `responseTime` → `durationMs`; serializes method/url/statusCode only (no request bodies per AC-NFR-3)
- `src/telemetry/index.ts`: OTel NodeSDK bootstrap; reads `OTEL_*` env vars directly (before config validates); respects `OTEL_SDK_DISABLED`; exports `shutdownTelemetry()` for graceful shutdown in server.ts
- `src/middleware/traceContext.ts`: enters ALS scope per request via `runWithContext()`; OTel HTTP instrumentation handles W3C traceparent extraction/span creation before this runs
- `src/middleware/requestLogger.ts`: thin re-export of `requestLoggerMiddleware` from `src/logger/http.ts`
- `src/services/.gitkeep`, `src/types/.gitkeep`: placeholder dirs (prevent fat-route-handler anti-pattern; see FEAT-002)
- `tests/unit/logger.test.ts`: 4 tests — valid JSON output; required fields (service, level, timestamp); traceId propagated from known OTel span; no traceId when no span active
- `tests/setup/otel.ts`: registers `AsyncLocalStorageContextManager` for tests so `context.with()` propagates spans
- `vitest.config.ts`: added `setupFiles: ['tests/setup/otel.ts']`

### Test Summary
- Tests: 8/8 passing (4 config + 4 logger)
- Code Review: APPROVED (import moved to top; no blocking issues)
- Lint: PASS
- Build: PASS

### Key Decision
- `requestLoggerMiddleware` factory lives in `src/logger/http.ts` (not `src/middleware/`) because pino-http ownership is scoped to `src/logger/` by ESLint rule. `src/middleware/requestLogger.ts` re-exports it.

### Security Notes
- No new security debt introduced. Pino redact list is comprehensive (authorization, cookie, set-cookie, password, token, secret at root and nested paths).
- OTel telemetry reads `OTEL_SDK_DISABLED` directly from `process.env` (intentional: must initialize before config validation).

**Phase 2 Archive**: `memory-bank/archive/archive-TASK-001-phase2.md`

---

## 2026-04-30 — Phase 4: Tests & Verification — COMPLETE (TASK-001)

### What Was Built
- `tests/integration/middleware.test.ts` (extended from Phase 3): added 3 tests:
  1. **Password redaction** — `createLogger` with memStream + `testLogger.info({ body: { password: 'secret123' } })` confirms `*.password` redact path censors the value to `[REDACTED]` (AC-NFR-3)
  2. **Traceparent propagation** — custom `otelSimMiddleware` extracts the W3C `traceparent` header and enters the OTel span context via `otelContext.with()`; route handler uses `getTestLogger().info()` which reads the active span; asserts parsed log `traceId` matches header value (AC-HAPPY-3)
  3. **No-console assertion** — `spawnSync('grep', ['-r', '--include=*.ts', 'console\\.', 'src/'])` with `cwd: projectRoot`; `stderr` checked first for path-resolution failures; `status === 1` (grep no-match exit) confirms zero `console.*` calls in `src/` (AC-NFR-1)

### Test Summary
- Tests: 16/16 passing (4 config + 4 logger + 5 middleware + 3 health)
- Code Review: APPROVED (0 blocking, 2 recommended — both applied: `cwd` option on spawnSync; stderr diagnostic check)
- Lint: PASS
- Build: PASS

### Notes
- All Phase 4 tests passed on first run — the verification confirmed the platform implementation from Phases 1-3 is correct
- `otelContext.with(ctx, () => next())` reliably propagates through Express 4's router because `AsyncLocalStorageContextManager` (registered in `tests/setup/otel.ts`) propagates ALS context through all async continuations

---

---

## Task Archive: TASK-001

**Task**: Express API with TypeScript (FEAT-001 / v0.1.0 Foundation)
**Status**: ARCHIVED
**Date**: 2026-04-30
**Archive**: `memory-bank/archive/archive-TASK-001.md`

---

## 2026-04-30 — Phase 3: HTTP Layer & Health Endpoint — COMPLETE (TASK-001)

### What Was Built
- `src/errors/AppError.ts`: `AppError` base class with `statusCode`, `code`, `expose`, `details`, `cause`; concrete subclasses `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `PayloadTooLargeError`, `InternalError`; `Object.setPrototypeOf` restores prototype chain for reliable `instanceof`
- `src/db/index.ts`: `pg.Pool` with `max:10 / idleTimeoutMillis:30s / connectionTimeoutMillis:5s`; exports `query()`, `ping()`, `shutdown()`, `getPool()`; pool error events logged via `logger` singleton
- `src/routes/health.ts`: `GET /health` → `{ status, service, version, db }`; 200 when `ping()` resolves true, 503 when false; uses `.then().catch(next)` pattern for Express 4 async safety
- `src/middleware/errorHandler.ts`: 4-arg Express error handler; `instanceof AppError` distinguishes operational from programmer errors; operational errors use `err.statusCode` + `err.expose` guard on message; programmer errors → generic 500 with `INTERNAL_ERROR`; `traceId` from `getTraceId()` helper (kept inside `src/logger/`)
- `src/middleware/notFoundHandler.ts`: converts unmatched routes to `NotFoundError('Route not found')`
- `src/app.ts`: `createApp()` factory; middleware order: `traceContextMiddleware → express.json({ limit: '100kb' }) → requestLoggerMiddleware → healthRouter → notFoundHandler → errorHandler`
- `src/server.ts`: process entrypoint; lazy config/logger after telemetry init; graceful shutdown drains HTTP server → DB pool → telemetry SDK (in sequence, 10s force-exit timeout)
- `src/logger/index.ts` (updated): added `getTraceId()` helper — returns active OTel span traceId or empty string; keeps `@opentelemetry/api` usage inside `src/logger/` per ownership rule
- `src/logger/http.ts` (updated): request serializer now includes `headers` field so pino's redact paths censor `Authorization`/`Cookie` values
- `eslint.config.js` (updated): `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'` for both src/ and tests/; disabled `no-unsafe-assignment` + `no-unsafe-member-access` in tests/ (supertest `res.body` is `any`)
- `vitest.config.ts` (updated): added `env: { DATABASE_URL, NODE_ENV: 'test' }` so lazy config Proxy can initialize during integration tests

### Test Summary
- Tests: 13/13 passing (4 config + 4 logger + 3 health + 2 middleware)
- Code Review: APPROVED (0 blocking, 4 recommended — all applied)
- Lint: PASS
- Build: PASS

### Files Created
- `src/errors/AppError.ts`, `src/db/index.ts`, `src/routes/health.ts`
- `src/middleware/errorHandler.ts`, `src/middleware/notFoundHandler.ts`
- `src/app.ts`, `src/server.ts`
- `tests/integration/health.test.ts`, `tests/integration/middleware.test.ts`

### Key Decisions
- `getTraceId()` helper exported from `src/logger/index.ts` keeps the `@opentelemetry/api` import boundary inside the logger module, consistent with `systemPatterns.md` ownership rules
- `.then().catch(next)` pattern used in health route for Express 4 async handler safety (Express 5 will allow `async` handlers directly)
- `shutdownTelemetry()` called after `pool.end()` in graceful shutdown to drain in-flight spans before exit
- `Object.setPrototypeOf(this, new.target.prototype)` in AppError constructor is required — without it, `instanceof AppError` fails after TypeScript transpilation
