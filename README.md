# BanyanBoard API

A clean, production-ready Express API built with TypeScript, featuring structured logging, OpenTelemetry tracing, and strict configuration validation. Designed for self-hosting with Docker Compose.

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 22+ (for local development)

### Run the Full Stack

```bash
docker compose up
```

This starts:
- **API**: `http://localhost:3000` (configurable via `PORT` env var)
- **PostgreSQL**: Runs in a container; data persists in a named volume

Once both services are healthy, verify the API is running:

```bash
curl -s http://localhost:3000/health | jq
```

Expected response:
```json
{
  "status": "ok",
  "service": "banyanboard-api",
  "version": "0.1.0",
  "db": "connected"
}
```

## Development

### Install Dependencies

```bash
npm install
```

### Run in Watch Mode

Start the PostgreSQL service in the background:
```bash
docker compose up db -d
```

Start the API in watch mode (auto-reloads on file changes):
```bash
npm run dev
```

### Run Tests

Run all tests (unit + integration):
```bash
npm test
```

Run only unit tests (no database required):
```bash
npm run test:unit
```

Run only integration tests (requires running PostgreSQL):
```bash
npm run test:integration
```

Watch mode (re-runs on file changes):
```bash
npm run test:watch
```

### Linting and Type Checking

Check code quality, types, and formatting:
```bash
npm run lint
```

Auto-fix linting issues and format code:
```bash
npm run lint:fix
```

Type-check only (no ESLint):
```bash
npm run typecheck
```

## Configuration

All configuration is supplied via environment variables (12-Factor App). See `.env.example` for all available variables.

Copy `.env.example` to `.env` for local development:
```bash
cp .env.example .env
```

Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | One of: `development`, `test`, `production` |
| `PORT` | No | `3000` | HTTP listen port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `LOG_LEVEL` | No | `info` | Log verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `LOG_FORMAT` | No | `json` | Log format: `json` (production) or `text` (pretty-print for dev) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | In prod | — | OpenTelemetry collector endpoint |

For a complete list, see `src/config/index.ts` (the schema with defaults) or `.env.example`.

## Project Structure

```
banyanboard/
├── src/
│   ├── server.ts              # Process entrypoint
│   ├── app.ts                 # Express app factory
│   ├── config/                # Configuration validation (zod + dotenv)
│   ├── logger/                # Structured logging with tracing (pino)
│   ├── errors/                # Error hierarchy (AppError base class)
│   ├── middleware/            # Express middleware (tracing, logging, error handling)
│   ├── routes/                # HTTP route handlers
│   ├── services/              # Business logic (empty in Phase 1)
│   ├── db/                    # PostgreSQL connection and query abstraction
│   ├── telemetry/             # OpenTelemetry SDK initialization
│   └── types/                 # Shared TypeScript types
├── tests/
│   ├── unit/                  # Pure unit tests (no network, no DB)
│   └── integration/           # Integration tests (spin up the app, hit endpoints)
├── docker-compose.yml         # Development stack (API + PostgreSQL)
├── Dockerfile                 # Multi-stage build for the API service
├── package.json
├── tsconfig.json
└── .env.example               # Template for environment variables
```

## Architecture Highlights

### Observability

Every request gets a **W3C Trace Context** and is logged as structured JSON:

```json
{
  "timestamp": "2026-04-28T14:23:01.123Z",
  "level": "info",
  "service": "banyanboard-api",
  "version": "0.1.0",
  "env": "development",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "method": "GET",
  "path": "/health",
  "statusCode": 200,
  "durationMs": 1.234,
  "msg": "http request"
}
```

Traces can be exported to any OpenTelemetry-compatible collector (Jaeger, Tempo, Datadog, etc.) by setting `OTEL_EXPORTER_OTLP_ENDPOINT`.

### Error Handling

All errors are mapped to a consistent JSON shape with a `traceId` that matches the request's trace context, making debugging production issues straightforward:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
  }
}
```

### Security

- All sensitive data (passwords, tokens, auth headers) is redacted from logs
- No `console.log` in production code (enforced by ESLint)
- Database credentials are never hardcoded (read from `DATABASE_URL` env var)
- Configuration failures are reported clearly at startup (fail-fast principle)

## Building for Production

Build the TypeScript to JavaScript:
```bash
npm run build
```

Output goes to `dist/`. The Docker image uses this:
```bash
docker compose up --build
```

Or build manually:
```bash
docker build -t banyanboard-api:0.1.0 .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgres://..." \
  -e NODE_ENV=production \
  -e LOG_FORMAT=json \
  -e OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318" \
  banyanboard-api:0.1.0
```

## Troubleshooting

### API won't start with `DATABASE_URL is required`

Set the `DATABASE_URL` environment variable:
```bash
export DATABASE_URL="postgres://banyan:banyan@localhost:5432/banyanboard"
docker compose up
```

Or edit `.env` and add the URL.

### PostgreSQL container exits immediately

Check the logs:
```bash
docker compose logs db
```

Common causes:
- Port 5432 already in use on the host
- Insufficient disk space
- Permission issues on the volume

### Logs are hard to read

Switch to pretty-printed text format for development:
```bash
LOG_FORMAT=text npm run dev
```

Or when using Docker:
```bash
docker compose logs api -f | docker run --rm -i pino-pretty
```

## Documentation

- **Architecture and patterns**: See `memory-bank/systemPatterns.md`
- **Technology stack and commands**: See `memory-bank/techContext.md`
- **Product context**: See `memory-bank/productBrief.md`
- **Development roadmap**: See `memory-bank/roadmap.md`

## License

(To be determined)
