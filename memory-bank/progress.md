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
