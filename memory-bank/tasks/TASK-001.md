# TASK-001: Express API with TypeScript

**Complexity**: Level 3
**Status**: CREATIVE_COMPLETE
**Roadmap Link**: FEAT-001
**Branch**: feature/FEAT-001-express-api-typescript
**Worktree**: N/A

## Task Description

Foundation milestone (FEAT-001 in v0.1.0). Set up the Express + TypeScript backend with the clean-architecture folder layout (favoring simplicity over clever abstractions per project constraints). Includes:

- PostgreSQL connection
- Docker Compose dev environment
- Base middleware (request logging, error handling, JSON parsing)
- Structured logging with traceId per the Observability Standards in CLAUDE.md
- Health-check endpoint

No domain features yet — this is purely the platform. The architectural decisions made here (folder layout, error-handling shape, logger abstraction) cascade to every later feature, which is why FEAT-001 is classified Level 3 and warrants `/banyan-creative` to lock in the layout before building.

## Specification

**Feature Type**: NFR/Infrastructure
**Primary Persona**: Pat (Self-Host Operator) — DevOps-savvy engineer who runs `docker compose up`, manages backups, and applies updates. Pat's definition of "working" is: the stack comes up cleanly, the health endpoint responds, and the logs are machine-readable JSON he can pipe to a log aggregator.
**Creative Exploration Needed**: Yes — four open design questions must be resolved before implementation. See "Creative Exploration Needed" section below.

### Codebase Baseline

Repository at `/root/banyanboard` is **greenfield**: only `CLAUDE.md` and `memory-bank/` exist. No source files, no `package.json`, no Docker configuration, no test infrastructure. `systemPatterns.md` and `techContext.md` are stubs — FEAT-001 is the milestone that establishes both. The creative phase output must populate these stubs as a required deliverable alongside the working code.

### Operator Invocation

This is an infrastructure feature with no end-user UI. The operator-level invocation surface is:

- **Primary command**: `docker compose up` from the repository root starts the API service and a PostgreSQL instance.
- **Externally-observable endpoint**: `GET http://localhost:<PORT>/health` (PORT is configurable via env var, defaulting to a value chosen in the creative phase — likely 3000).
- **Visibility**: Port is configurable via `PORT` env var; default is chosen and documented during implementation.
- **Confidence**: MEDIUM — port default is a low-stakes convention (3000 is near-universal for Node dev); the creative phase should confirm it and document it in `techContext.md`.

### Verification Method

- **Test method**:
  1. `docker compose up` (or `docker compose up --build`) from repo root — verify exit-free startup within 30 seconds with API and DB containers both healthy.
  2. `curl -sf http://localhost:<PORT>/health` — verify HTTP 200 with JSON body.
  3. Integration test suite (path TBD in creative phase, likely `npm test` targeting a test-compose profile or a local running instance) — covers middleware chain, error shape, and traceId propagation.
  4. Log inspection: capture stdout of a sample request and verify JSON log shape contains required fields.
- **Success metrics**:
  - `docker compose up` produces no `Error` or `panic` lines in stdout/stderr within 30 seconds.
  - `GET /health` returns HTTP 200 with JSON body containing at minimum: `{ "status": "ok", "service": "<name>", "version": "<semver>", "db": "connected" }`.
  - Every request log line (stdout) is valid JSON and contains `traceId`, `spanId`, `service`, `level`, `timestamp` fields.
  - A request with `traceparent` header propagates the incoming trace; a request without one generates a new trace (both verifiable by inspecting `traceId` in the log output).
  - An uncaught error in a route returns HTTP 500 with a JSON error body (shape decided in creative phase) and logs at `level=error` with the same `traceId` as the request.
  - Zero `console.log` or `console.error` calls in production source code (verifiable by ESLint rule or grep).
  - Zero hardcoded values for `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT`, or `OTEL_*` env vars in source code.
- **Observable at**: stdout JSON logs (immediate, on every request); `GET /health` response body; future OTEL collector at `OTEL_EXPORTER_OTLP_ENDPOINT` once configured by the operator.
- **Verification frequency**: One-time per deployment + on every `docker compose up` in CI (future).
- **Confidence**: HIGH for the health endpoint shape and log field list (both derived directly from CLAUDE.md Observability Standards and productBrief NFRs). MEDIUM for the exact test command form (depends on creative-phase decisions about test infrastructure).

### Acceptance Criteria

#### AC-ENTRY-1: Operator can start the full stack with a single command
**Priority**: MUST

**Given** Pat has cloned the repository and has Docker and Docker Compose available on the host
**When** Pat runs `docker compose up` from the repository root
**Then**:
- Both the API container and the PostgreSQL container reach a healthy state within 30 seconds
- No `Error:`, `FATAL`, or unhandled exception lines appear in combined stdout/stderr
- The API logs a structured JSON startup message at `level=info` that includes `service`, `version`, and the bound `port`

**Verification**:
- [ ] Integration test or smoke script asserts exit-free startup
- [ ] Log line contains required JSON fields on startup

#### AC-HAPPY-1: Health endpoint returns correct structured response
**Priority**: MUST

**Given** the stack is running (`docker compose up` completed successfully)
**When** Pat runs `curl -sf http://localhost:<PORT>/health`
**Then**:
- HTTP status 200 is returned
- Response `Content-Type` is `application/json`
- Response body is a JSON object containing at minimum:
  - `"status": "ok"`
  - `"service": "<configured service name>"`
  - `"version": "<semver string from package.json>"`
  - `"db": "connected"` (confirming live PostgreSQL connectivity)
- Response time is under 200ms (API p95 target from productBrief NFRs; health check should be well under)

**Verification**:
- [ ] Integration test asserts HTTP 200 and all four JSON fields
- [ ] Test asserts `db` field reflects actual DB state (not hardcoded string)

#### AC-HAPPY-2: Every HTTP request produces a structured JSON log line
**Priority**: MUST

**Given** the stack is running and request logging middleware is active
**When** any HTTP request is made to any registered route (including `/health`)
**Then** a single JSON log line is written to stdout containing:
- `traceId` — a valid 32-character hex string (W3C Trace Context format)
- `spanId` — a valid 16-character hex string
- `service` — the configured service name
- `level` — one of `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- `timestamp` — ISO 8601 datetime string
- `method`, `path`, `statusCode`, `durationMs` — HTTP request metadata

**Verification**:
- [ ] Integration test captures stdout, parses as JSON, asserts all required fields present
- [ ] Test asserts `traceId` matches pattern `/^[0-9a-f]{32}$/`

#### AC-HAPPY-3: Incoming W3C `traceparent` header is propagated through the request
**Priority**: MUST

**Given** the stack is running with tracing middleware active
**When** a request is made with a valid `traceparent` header (e.g., `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`)
**Then**:
- The `traceId` in the request log matches the trace ID from the incoming `traceparent` header (i.e., `4bf92f3577b34da6a3ce929d0e0e4736`)
- A new `spanId` is generated for this span (different from the parent span ID in the header)

**Given** a request is made WITHOUT a `traceparent` header
**Then**:
- A new `traceId` is generated (a fresh 32-char hex string not derived from any header)
- The log line contains this new `traceId`

**Verification**:
- [ ] Integration test sends request with known `traceparent`, parses log, asserts `traceId` matches
- [ ] Integration test sends request without header, asserts `traceId` is a freshly generated non-empty string

#### AC-ERROR-1: Unhandled route errors return structured JSON and are logged at error level
**Priority**: MUST

**Given** the stack is running with the global error-handling middleware registered
**When** a request is made to a route that throws an unhandled `Error` (simulated in a test route)
**Then**:
- HTTP status 500 is returned (or appropriate error status if the error carries one)
- Response `Content-Type` is `application/json`
- Response body matches the error JSON shape decided in the creative phase (at minimum: `{ "error": { "message": "...", "traceId": "..." } }`)
- A log line at `level=error` is written to stdout containing the `traceId` matching the response body, the error message, and a stack trace field
- The error is NOT propagated to Express's default HTML error handler (no HTML in error response body)

**Verification**:
- [ ] Integration test triggers a thrown error in a test route, asserts HTTP 500 + JSON body shape
- [ ] Test asserts `traceId` in response body matches `traceId` in the error log line
- [ ] Test asserts response `Content-Type` is `application/json`, not `text/html`

#### AC-ERROR-2: Database-unavailable condition is reflected in health check
**Priority**: MUST

**Given** the API is running but PostgreSQL is unreachable (e.g., DB container stopped or connection refused)
**When** Pat runs `curl http://localhost:<PORT>/health`
**Then**:
- HTTP status 503 (Service Unavailable) is returned
- Response body is JSON containing `"db": "disconnected"` (or equivalent field indicating DB is not reachable)
- The API process itself does not crash — it continues accepting requests

**Verification**:
- [ ] Integration test stops DB container mid-run, asserts health endpoint returns 503
- [ ] Test asserts API process remains alive and recovers when DB is restored

#### AC-NFR-1: No `console.log` or `console.error` in production source code
**Priority**: MUST

**Given** the codebase is built and linted
**When** a linter or static analysis tool scans `src/` (or equivalent source directory)
**Then**:
- Zero occurrences of `console.log`, `console.error`, `console.warn`, or `console.debug` are found in production source files
- All logging goes through the structured logger abstraction chosen in the creative phase

**Verification**:
- [ ] ESLint rule `no-console` is configured and passes in CI
- [ ] `grep -r "console\." src/` returns no results in production source paths

#### AC-NFR-2: All configuration is supplied via environment variables — no hardcoded values
**Priority**: MUST

**Given** the source code is inspected
**When** the following environment variables are unset: `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `LOG_FORMAT`, `LOG_OUTPUT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`
**Then**:
- The application either applies documented defaults (read from config layer) or fails with a clear startup error listing the missing variable
- No literal values for these settings appear as hardcoded strings in source files outside of `.env.example` or documentation

**Verification**:
- [ ] Config unit test asserts each required variable is read from `process.env` (not hardcoded)
- [ ] Test asserts missing required vars produce a startup error with the variable name in the message

#### AC-NFR-3: No sensitive data in logs
**Priority**: MUST

**Given** the request logging middleware is active
**When** a request is made that carries a `Cookie` header, `Authorization` header, or a request body with fields named `password`, `token`, or `secret`
**Then**:
- The log line does NOT include the value of the `Cookie` or `Authorization` header
- The log line does NOT include raw password/token/secret values from the request body
- Header and body fields may be logged by name (e.g., `"authorization": "[REDACTED]"`) but not by value

**Verification**:
- [ ] Integration test sends request with `Authorization: Bearer test-token`, asserts log line does not contain `test-token`
- [ ] Integration test sends request with JSON body `{"password":"secret123"}`, asserts log line does not contain `secret123`

#### AC-NFR-4: Platform imposes no more than 50ms baseline overhead on request handling
**Priority**: SHOULD

**Given** the middleware chain is active (request logging, JSON parsing, traceId injection, error handler)
**When** a no-op route (one that does no DB work) receives a request on the same host as the API
**Then**:
- p95 response time is under 50ms (leaving the 200ms productBrief budget for domain work in later features)

**Verification**:
- [ ] Load test or benchmark script (e.g., `autocannon` or `wrk`) against `/health` with DB connected, asserts p95 < 50ms
- [ ] **Note**: This is a SHOULD — if it cannot be met, it must be documented with justification before marking FEAT-001 complete

### Scope Boundaries

- **In scope**:
  - Express + TypeScript project scaffold with TypeScript strict mode
  - Clean-architecture folder layout (shape decided in creative phase; simple over clever)
  - Docker Compose configuration: API service + PostgreSQL service; a single `docker compose up` from repo root starts both
  - PostgreSQL connection pool (connection string via `DATABASE_URL` env var)
  - Base middleware: JSON body parsing (`express.json()`), request logging (structured JSON), W3C Trace Context traceId injection, global error handler
  - `GET /health` endpoint: returns 200/503 + JSON body with service name, version, DB connectivity status
  - Structured logger abstraction (library and injection pattern decided in creative phase)
  - Config layer (validation approach decided in creative phase)
  - `.env.example` documenting all required environment variables
  - ESLint + Prettier configuration enforcing the no-console rule and TypeScript strict standards
  - `package.json` with `dev`, `build`, `start`, `test`, and `lint` scripts
  - `tsconfig.json` with strict mode enabled
  - `techContext.md` and `systemPatterns.md` updated with the chosen patterns (creative-phase deliverable)

- **Out of scope**:
  - Any domain feature: authentication, users, boards, columns, cards, labels, due dates (all deferred to FEAT-002+)
  - Database migrations tooling (deferred — will be needed by FEAT-002 when the first schema appears; FEAT-001 only needs a live DB connection to verify)
  - Frontend / React scaffolding
  - CI/CD pipeline configuration (out of scope for v0.1.0)
  - SMTP or email infrastructure
  - OpenTelemetry Collector deployment (the API must emit OTEL-compatible structured logs; the collector itself is operator-managed and outside this milestone)
  - Session store, JWT, or any auth-related middleware

- **Dependencies**:
  - Docker and Docker Compose available on the developer/operator host
  - Node.js version to be confirmed in creative phase (LTS at time of implementation; likely Node 22 LTS)
  - PostgreSQL version to be confirmed in creative phase (likely PG 16)
  - Logger library, config library, and DB access approach — all decided in creative phase

- **NFR implications**:
  - **Observability**: OpenTelemetry-first per CLAUDE.md. LOG_LEVEL, LOG_FORMAT, LOG_OUTPUT, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME, OTEL_TRACES_SAMPLER_ARG must all be configurable via env vars. No `console.log` in production code.
  - **Performance**: Platform baseline must not exceed 50ms p95 overhead (leaving headroom for the 200ms productBrief API target).
  - **Security**: No sensitive data in logs. Database credentials via `DATABASE_URL` env var only — never in source.
  - **Accessibility**: N/A (no UI in this milestone).
  - **12-Factor**: All config via env vars. Dev/prod parity maintained via Docker Compose for local development.

### Creative Exploration Needed

Yes — the creative phase must resolve the following four questions before implementation begins. These are flagged LOW-to-MEDIUM confidence because multiple equally valid approaches exist and the choice cascades to every subsequent feature.

1. **Folder layout shape** — Three candidate approaches for the `src/` directory:
   - `src/{routes,middleware,services,db,config,logger}` — flat, pragmatic, no layer abstraction naming
   - `src/{interfaces,application,infrastructure,config}` — clean-architecture naming without DI overhead
   - `src/{api,core,infra}` — three-zone split
   Creative must pick ONE and document it in `systemPatterns.md`. Constraint: favor simplicity; do not introduce a DI container.

2. **Error-handling shape** — Three decisions within this:
   - Custom error class hierarchy (e.g., `AppError` with `statusCode`) vs. plain `Error` + a type-checking middleware
   - JSON error response envelope shape (e.g., `{ error: { code, message, traceId } }` vs. `{ message, traceId, code }`)
   - How the global Express error handler distinguishes operational errors from programmer errors
   Creative must produce a concrete error class definition and response schema.

3. **Logger abstraction** — Three questions:
   - Library: `pino` (fast, JSON-native) vs. `winston` (flexible) vs. raw OTel Logs API (forward-compatible but immature Node support at time of writing)
   - Injection pattern: module-level singleton vs. per-request child logger vs. AsyncLocalStorage-based context propagation for traceId
   - How traceId flows through async work without explicit parameter threading
   Creative must produce the logger interface and the traceId propagation pattern.

4. **Config layer** — Three questions:
   - Parsing/validation: `dotenv` + `zod` schema vs. `node-config` vs. plain `process.env` with manual checks
   - Where config lives in the folder layout (e.g., `src/config/index.ts` exporting a typed `config` object)
   - How tests override config values (env var injection vs. test helpers vs. module mocking)
   Creative must produce the config module signature and the test-override pattern.

5. **Database access shape for the platform layer** (MEDIUM confidence — lower stakes than the above four, but worth confirming):
   - Raw `pg` Pool with query helpers vs. a thin query builder (e.g., `kysely`) vs. defer ORM choice entirely to FEAT-002
   - The health check needs a live DB ping; the approach chosen here must not preclude FEAT-002's schema migration tooling
   Creative may resolve this or explicitly defer with a documented reason.

## User Journey Definition

**Feature Type**: NFR/Infrastructure
**Creative Phase Required**: Yes - Architecture Design (folder layout, error-handling shape, logger abstraction, config layer, DB access shape)

### NFR Verification (Infrastructure Features)
- **Test method**: `docker compose up` startup smoke + `curl /health` + integration test suite (path confirmed in creative phase) + stdout log inspection
- **Success metrics**: 200 from `/health` with correct JSON body; all request logs valid JSON with required OTel fields; p95 baseline overhead < 50ms; zero console.log in production source; zero hardcoded config values
- **Observable at**: stdout JSON logs on every request; `GET /health` response body; future OTel collector at `OTEL_EXPORTER_OTLP_ENDPOINT`

### Acceptance Criteria
See **Specification** section above for the full AC set (AC-ENTRY-1, AC-HAPPY-1 through AC-HAPPY-3, AC-ERROR-1 through AC-ERROR-2, AC-NFR-1 through AC-NFR-4).

## Test Strategy

### Approach
- **Emphasis**: Integration-first — this is an infrastructure feature; the primary verification is observing the middleware chain, traceId propagation, error shape, and health endpoint behavior end-to-end against a live stack.
- **Target test count**: 16 tests across all phases (justified: 10 ACs, several with two test cases each)

### File Organization
- **New test files** (greenfield — all are new):
  - `tests/unit/config.test.ts` — config module reads from env, missing required vars error with var name
  - `tests/unit/logger.test.ts` — log output fields match required shape (traceId, spanId, service, level, timestamp)
  - `tests/integration/health.test.ts` — `/health` returns 200 + correct JSON fields; DB-down returns 503
  - `tests/integration/middleware.test.ts` — traceId propagation (with/without `traceparent`), request log shape, error handler JSON shape + traceId, sensitive header redaction, no HTML in error responses
- **Extend existing**: N/A (greenfield)

### What NOT to Test
- Express routing internals — covered by the framework
- `pg` Pool connection mechanics — covered by the pg library's own tests
- Docker networking — tested by the smoke script, not unit tests
- TypeScript compilation — covered by `tsc --noEmit` in lint/build scripts
- ESLint rule enforcement — verified by the `lint` script in CI, not a test file

### Per-Phase Test Guidance
- **Phase 1** (Foundation): 4 tests — `config.test.ts`: reads PORT/DATABASE_URL/LOG_LEVEL from env; fails with clear error on missing required var; documents defaults for optional vars
- **Phase 2** (Logger & Tracing): 4 tests — `logger.test.ts`: log line is valid JSON; contains traceId/spanId/service/level/timestamp; traceId propagates from incoming `traceparent`; new traceId generated when no header present
- **Phase 3** (HTTP Layer & Health): 5 tests — `health.test.ts`: HTTP 200 + JSON body fields; `db: connected` reflects live state; HTTP 503 when DB unreachable. `middleware.test.ts`: error route returns JSON (not HTML) with traceId; `Authorization` header not in log value
- **Phase 4** (Verification): 3 tests — `middleware.test.ts`: `password` field not logged; `traceparent` propagation cross-checked between request and log; no-console lint assertion (grep or ESLint report)

## Implementation Roadmap

- [x] Phase 1: Project Foundation — package.json, tsconfig, Docker Compose, ESLint/Prettier, config layer, .env.example ✓ (2026-04-28, 4/4 tests, APPROVED)
- [x] Phase 2: Logger & Tracing Middleware — structured logger abstraction, W3C Trace Context injection/propagation, request logging middleware ✓ (2026-04-30, 8/8 tests, APPROVED)
- [x] Phase 3: HTTP Layer & Health Endpoint — Express app wiring, JSON body parsing, global error handler, `GET /health` with DB ping ✓ (2026-04-30, 13/13 tests, APPROVED)
- [ ] Phase 4: Tests & Verification — integration test suite (all ACs), ESLint no-console pass, performance baseline smoke, `docker compose up` smoke check

## Creative Phases

- [x] Architecture Design → COMPLETE (2026-04-28) — `memory-bank/creative/TASK-001-platform-architecture.md`
  - Q1: Flat pragmatic layout (`src/{routes,middleware,services,db,config,logger,errors,telemetry,types}` + `app.ts` + `server.ts`)
  - Q2: `AppError` class hierarchy + `{ error: { code, message, traceId, details? } }` envelope
  - Q3: pino + AsyncLocalStorage (module singleton for startup; `getLogger()` for request-scoped logging)
  - Q4: dotenv + zod schema; `loadConfig(env?)` for hermetic test overrides
  - Q5: Raw `pg.Pool` with thin helpers (`query`, `ping`, `getPool`, `shutdown`); ORM deferred to FEAT-004

---

## Execution State

**Build Status**: IDLE
**Current Build**: Phase 3: HTTP Layer & Health Endpoint — COMPLETE
**Build Started**: 2026-04-30
**Phase Number**: 3 of 4 COMPLETE
**Is Multi-Phase**: YES
**Current Step**: IDLE — awaiting /banyan-build TASK-001 for Phase 4
**Can Resume**: NO (clean state)

### Active Sub-Agents
- None

### Completed Steps
- BUILD Phase 2 Steps (2026-04-30):
  - Step 3: Test Writer — 4 tests in tests/unit/logger.test.ts, RED state confirmed
  - Step 4: Coding Agent — src/logger/index.ts, src/logger/http.ts, src/telemetry/index.ts, src/middleware/traceContext.ts, src/middleware/requestLogger.ts, tests/setup/otel.ts, vitest.config.ts (setupFiles added)
  - Step 6: Tests 8/8 PASS (4 config + 4 logger)
  - Step 7: Build PASS, Lint PASS (after fixing pino-http import pattern, customLogLevel type, import placement)
  - Step 8: Code Review APPROVED — import moved to top; no blocking issues
  - Step 9: Documentation — techContext.md updated (OTel test pattern, document history); progress.md Phase 2 entry added
  - Step 10: Memory bank updated — tasks.md Phase 2/4, TASK-001.md Phase 2 checked

- Step 0: Task TASK-001 created from FEAT-001 (2026-04-28)
- Step 0.2: Phase gate passed — task registered in tasks.md
- Step 0.5: No user-supplied agent rules; index check skipped
- Step 1 (plan): Fresh planning session (no resumption needed)
- Step 2 (plan): Roadmap link confirmed (FEAT-001)
- Step 3 (plan): Spec Writer Agent (Sonnet) completed — spec written, human approved
- Step 4 (plan): Codebase analysis — greenfield confirmed; no existing patterns
- Step 5 (plan): Implementation plan created — 4 phases, 16 tests, 1 Architecture Design creative phase
- Step 6 (plan): Validation gate passed — all NFR fields concrete, spec approved
- Creative: Architecture Design Agent (Opus) — COMPLETE (2026-04-28)
  - Output: memory-bank/creative/TASK-001-platform-architecture.md
  - systemPatterns.md populated (7 Guiding Principles + patterns)
  - techContext.md populated (full tech stack + commands)
- BUILD Phase 1 Steps:
  - Step 0.5: No git repo (projectbrief: Repository=No) — working in /root/banyanboard
  - Step 0.6: Phase gate passed — roadmap phases present, Architecture Design creative complete
  - Step 1: Phase 1 identified — Project Foundation
  - Step 2: Level 3 implementation rules loaded
  - Step 3: Test Writer (Sonnet) — 4 tests in tests/unit/config.test.ts, RED state confirmed; project scaffolded
  - Step 4: Coding Agent (Sonnet) — src/config/index.ts implemented; 4/4 tests GREEN
  - Step 5: 1 batch (Config Module), no parallelization needed
  - Step 6: Batch 1 (Config Module) — 4/4 PASS
  - Step 7: Integration verification — Tests 4/4 PASS, Build PASS, Lint PASS (after dist/ ignore fix)
  - Step 8: Code Review (Sonnet) — APPROVED, 0 blocking; 4 recommended applied; 2 security items → projectbrief
  - Step 9: Documentation (Haiku) — README.md created; config/index.ts inline comments enhanced; techContext.md + systemPatterns.md verified accurate
  - Step 10: Memory bank updated — Phase 1 marked complete in roadmap, progress.md updated, tasks.md registry updated
