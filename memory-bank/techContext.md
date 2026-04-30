# Technology Context

> Tech stack, infrastructure, and development commands for BanyanBoard.
> Established by FEAT-001 (TASK-001 creative phase, 2026-04-28).
> See `memory-bank/creative/TASK-001-platform-architecture.md` for the rationale behind each choice.

---

## Technology Stack

### Runtime

| Concern | Choice | Version | Notes |
|---------|--------|---------|-------|
| Runtime | Node.js | 22 LTS | Active LTS at time of project start; ESM-native; AsyncLocalStorage stable since 16 |
| Language | TypeScript | 5.5+ | `strict` mode mandatory; `noUncheckedIndexedAccess` enabled |
| HTTP framework | Express | 4.x | Stable, ubiquitous; the v5 line is still rolling out — stay on 4.x for FEAT-001 |
| Database | PostgreSQL | 16 | Latest stable major; pinned in docker-compose.yml |

### Application libraries

| Concern | Library | Version | Why |
|---------|---------|---------|-----|
| PostgreSQL driver | `pg` | ^8.x | Mature, no ORM; only `src/db/` imports it |
| Logger | `pino` | ^9.x | Fastest JSON logger in Node; native structured output |
| Logger pretty-printer (dev) | `pino-pretty` | ^11.x | `LOG_FORMAT=text` transport for human-readable dev logs |
| Request logger middleware | `pino-http` | ^10.x | Configured against the singleton pino instance |
| Config validation | `zod` | ^3.x | Type-safe runtime schema; aggregated error reporting |
| Env loader | `dotenv` | ^16.x | Reads `.env` for local dev; no-op when env vars come from Docker Compose |
| OpenTelemetry SDK | `@opentelemetry/sdk-node` | ^0.x (latest) | Tracer provider, processor, exporter wiring |
| OpenTelemetry auto-instrumentations | `@opentelemetry/auto-instrumentations-node` | ^0.x (latest) | HTTP server, HTTP client, pg instrumentation |
| OpenTelemetry API | `@opentelemetry/api` | ^1.x | Stable; used by application code to read the active span |
| OpenTelemetry OTLP HTTP exporter | `@opentelemetry/exporter-trace-otlp-http` | ^0.x (latest) | Trace export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| OpenTelemetry semantic conventions | `@opentelemetry/semantic-conventions` | ^1.x | Standard attribute names |

### Testing

| Concern | Library | Version | Why |
|---------|---------|---------|-----|
| Test runner | Vitest | ^2.x | Native TS, native ESM, fast, Vite-style watch mode |
| HTTP integration | supertest | ^7.x | Build requests against `createApp()` without binding a port |
| OTel context in tests | `@opentelemetry/context-async-hooks` | (transitive from sdk-node) | Registered in `tests/setup/otel.ts`; without it, `context.with()` is a no-op and trace enrichment tests fail |

### Linting & formatting

| Tool | Purpose |
|------|---------|
| ESLint 9 (flat config) | TypeScript strict rules + `no-console` rule (blocking) + `no-restricted-imports` (block direct `pg`/`pino`/`process.env` imports outside their owner modules) |
| `@typescript-eslint/parser` + plugin | TypeScript-aware linting |
| Prettier | Formatting; runs on save and in CI |
| TypeScript `tsc --noEmit` | Pure type-checking pass; included in `npm run lint` |

### Future libraries (not added in FEAT-001)

| Feature | Library | Notes |
|---------|---------|-------|
| FEAT-002 password hashing | `bcrypt` | Per productBrief; cost factor configurable via env |
| FEAT-002 sessions | `express-session` + `connect-pg-simple` | Session store backed by the same `pg.Pool` |
| FEAT-002 migrations | `node-pg-migrate` | Plain SQL migration files; `npm run migrate` |
| FEAT-004+ query builder (if needed) | `kysely` | Re-evaluate at FEAT-004 planning; raw SQL is acceptable until then |
| FEAT-005 frontend | React + Vite + TypeScript | Out of scope for v0.1.0 |

---

## Infrastructure

### Docker Compose

`docker-compose.yml` at repo root defines two services:

```yaml
services:
  api:
    build: .
    ports:
      - "${PORT:-3000}:${PORT:-3000}"
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgres://banyan:banyan@db:5432/banyanboard
      LOG_LEVEL: debug
      LOG_FORMAT: text
      LOG_OUTPUT: stdout
      SERVICE_NAME: banyanboard-api
      SERVICE_VERSION: 0.1.0
      OTEL_TRACES_SAMPLER_ARG: 1.0
      OTEL_SDK_DISABLED: "true"   # disable OTLP export in dev unless a collector is up
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "require('node:http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 10s

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: banyan
      POSTGRES_PASSWORD: banyan
      POSTGRES_DB: banyanboard
    volumes:
      - banyan-pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U banyan -d banyanboard"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  banyan-pg-data:
```

- `api` waits for `db` to be healthy before starting.
- `api` healthcheck is the same `/health` endpoint that AC-HAPPY-1 verifies.
- The default port is `3000` (configurable via `PORT`).
- The data volume `banyan-pg-data` persists across `docker compose down`/`up` cycles. Use `docker compose down -v` to wipe.

### Dockerfile (multi-stage)

- **Stage 1 — builder**: `node:22-alpine`, `npm ci`, `npm run build` (TypeScript → JS in `dist/`).
- **Stage 2 — runtime**: `node:22-alpine`, copy `dist/` and production deps, run as non-root user, `CMD ["node", "dist/server.js"]`.

### Network model

- `api` and `db` communicate over the default Docker Compose bridge network.
- Only `api`'s port is exposed to the host (PostgreSQL stays internal — operator can override for backups via `pg_dump` on the host with `docker compose exec`).

---

## Development Commands

All commands are run from the repository root unless noted.

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies (one-time / on lockfile change) |
| `npm run dev` | Start the API in watch mode (`tsx watch src/server.ts`) — requires a running PG (use `docker compose up db -d`) |
| `npm run build` | Compile TypeScript to `dist/` (`tsc -p tsconfig.build.json`) |
| `npm start` | Run the compiled app (`node dist/server.js`) — used inside the Docker image |
| `npm test` | Run the full Vitest suite (unit + integration); requires a running PG for integration tests |
| `npm run test:unit` | Run only `tests/unit/**` (no DB required) |
| `npm run test:integration` | Run only `tests/integration/**` (requires PG) |
| `npm run lint` | ESLint + Prettier check + `tsc --noEmit` (typecheck) |
| `npm run lint:fix` | ESLint --fix + Prettier --write |
| `npm run typecheck` | `tsc --noEmit` only |
| `docker compose up` | Start API + PG; the operator-facing entry point |
| `docker compose up --build` | Rebuild the API image, then start |
| `docker compose down` | Stop and remove containers (keeps the volume) |
| `docker compose down -v` | Stop, remove containers, and wipe the PG volume |
| `docker compose logs -f api` | Tail JSON logs from the API container (pipe to `jq` for pretty-print) |

---

## Component Structure

See `memory-bank/systemPatterns.md` Directory Structure section for the canonical `src/` tree. Quick recap:

| Folder | Owner | Imports allowed by |
|--------|-------|--------------------|
| `src/server.ts` | Process entrypoint | All app code |
| `src/app.ts` | App factory | All app code (creates the Express instance) |
| `src/telemetry/` | OpenTelemetry SDK | Only `server.ts` (side-effect import at top of file) |
| `src/config/` | Reads `process.env`, validates with zod | Anyone |
| `src/logger/` | Owns pino instance, AsyncLocalStorage | Anyone |
| `src/errors/` | `AppError` hierarchy | Anyone |
| `src/middleware/` | Express middleware | `app.ts` |
| `src/routes/` | HTTP route handlers | `app.ts` |
| `src/services/` | Business logic (FEAT-002+) | Routes, other services |
| `src/db/` | `pg.Pool` and query helpers | Services (and the health route's DB ping) |
| `src/types/` | Shared TypeScript types | Anyone |

---

## Environment Variables (`.env.example`)

The canonical list lives in `src/config/index.ts` (zod schema). `.env.example` at repo root documents each one with sample values and a one-line description. Operators copy `.env.example` → `.env` and edit values. Docker Compose passes these through to the `api` service.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | One of `development`, `test`, `production` |
| `PORT` | No | `3000` | HTTP listen port |
| `SERVICE_NAME` | No | `banyanboard-api` | Identifier in logs and traces |
| `SERVICE_VERSION` | No | `0.1.0` | Version in logs and traces |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `LOG_LEVEL` | No | `info` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `LOG_FORMAT` | No | `json` | `json` (production) or `text` (dev pretty-print) |
| `LOG_OUTPUT` | No | `stdout` | `stdout` / `file` / `both` |
| `LOG_FILE_PATH` | If `LOG_OUTPUT` includes `file` | — | Path to log file |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | In production | — | OTel collector URL (e.g., `http://otel-collector:4318`) |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | No | `http/protobuf` | `http/protobuf` or `grpc` |
| `OTEL_SERVICE_NAME` | No | (`SERVICE_NAME`) | Override service name for traces |
| `OTEL_TRACES_SAMPLER` | No | `parentbased_traceidratio` | Sampler strategy |
| `OTEL_TRACES_SAMPLER_ARG` | No | `1.0` | Sampling ratio (0..1); recommend `0.1` in prod |
| `OTEL_SDK_DISABLED` | No | `false` | Disable all telemetry (useful for tests) |

---

## TypeScript Configuration

`tsconfig.json` (development; extends `@tsconfig/node22`):

```json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "moduleResolution": "NodeNext",
    "module": "NodeNext",
    "target": "ES2023",
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "declaration": false,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

`tsconfig.build.json` extends the above and excludes test files.

---

## ESLint Configuration

Flat config (`eslint.config.js`):

- `@typescript-eslint/recommended-type-checked` rules
- `no-console` rule: **error** in `src/**`, allowed in `tests/**` and `scripts/**`
- `no-restricted-imports`: forbid direct imports of `pg`, `pino`, `dotenv`, `@opentelemetry/sdk-*`, and any `process` access outside their owner modules (`src/db/`, `src/logger/`, `src/config/`, `src/telemetry/`)
- Prettier integration via `eslint-config-prettier` (turn off conflicting rules)

---

## Health Check Contract

`GET /health` response (HTTP 200 when DB connected, HTTP 503 when not):

```json
{
  "status": "ok",
  "service": "banyanboard-api",
  "version": "0.1.0",
  "db": "connected"
}
```

When DB is unreachable:

```json
{
  "status": "degraded",
  "service": "banyanboard-api",
  "version": "0.1.0",
  "db": "disconnected"
}
```

The API process never crashes due to DB connectivity loss — the pool retries; the health endpoint reports current state.

---

## Document History

| Date | Change |
|------|--------|
| 2026-04-28 | Initial creation; established by FEAT-001 (TASK-001) creative phase. |
| 2026-04-30 | Phase 2: Added logger module (pino + ALS), telemetry init, trace-context middleware, request-logger middleware. Added `tests/setup/otel.ts` and `@opentelemetry/context-async-hooks` test pattern. |
