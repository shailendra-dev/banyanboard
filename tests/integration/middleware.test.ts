/**
 * Integration tests for Express middleware behaviour (Phase 3 & 4 — TDD)
 *
 * Phase 3 tests:
 *   1. Global error handler returns JSON (not HTML) with the correct envelope and traceId.
 *   2. Authorization header value is not present in log output (pino redact).
 *
 * Phase 4 tests (added in Phase 4):
 *   3. Password field value is not present in log output (pino redact — *.password path).
 *   4. W3C traceparent header traceId propagates to getLogger() output (OTel context enrichment).
 *   5. No console.log / console.error calls exist in src/ (AC-NFR-1 ESLint enforcement).
 *
 * Acceptance criteria covered:
 *   AC-ERROR-1 — Unhandled route errors return structured JSON and are logged at error level
 *   AC-HAPPY-3 — Incoming traceparent propagated through request log
 *   AC-NFR-1   — No console.log/console.error in production source code
 *   AC-NFR-3   — No sensitive data in logs (Authorization header, password body field)
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express, { type RequestHandler } from 'express';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import { context as otelContext, trace, TraceFlags } from '@opentelemetry/api';
import type { IncomingMessage, ServerResponse } from 'node:http';
import request from 'supertest';
import { createLogger, type LoggerConfig } from '../../src/logger/index.js';
import { traceContextMiddleware } from '../../src/middleware/traceContext.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const TEST_CONFIG: LoggerConfig = {
  LOG_LEVEL: 'info',
  LOG_FORMAT: 'json',
  SERVICE_NAME: 'test',
  SERVICE_VERSION: '0.0.0',
  NODE_ENV: 'test',
};

/** Build an in-memory capture stream and a collector for its lines. */
function makeCapture(): { chunks: Buffer[]; stream: Writable } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  return { chunks, stream };
}

// ---------------------------------------------------------------------------
// Phase 3: Error handler & Authorization redaction
// ---------------------------------------------------------------------------

describe('error handler', () => {
  it('returns JSON (not HTML) with the error envelope and traceId field', async () => {
    const testApp = express();
    testApp.use(traceContextMiddleware);
    testApp.get('/boom', (_req, _res, next) => {
      next(new Error('test programmer error'));
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/boom');

    expect(res.status).toBe(500);
    expect(res.type).toMatch(/json/);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'INTERNAL_ERROR');
    expect(res.body.error).toHaveProperty('message', 'Internal Server Error');
    // traceId field must be present (may be empty string when no OTel span is active)
    expect(res.body.error).toHaveProperty('traceId');
    expect(typeof res.body.error.traceId).toBe('string');
  });
});

describe('request logger middleware — sensitive header redaction', () => {
  it('does not log the Authorization header value (AC-NFR-3)', async () => {
    const { chunks, stream } = makeCapture();
    const { logger: testLogger } = createLogger(TEST_CONFIG, stream);

    // Tests are exempt from the no-restricted-imports rule that restricts pino-http
    // to src/logger/ — this lets us test the full pino redact pipeline directly.
    const capturingLogMiddleware = pinoHttp<IncomingMessage, ServerResponse>({
      logger: testLogger,
      serializers: {
        req: (req: IncomingMessage) => ({
          method: req.method,
          url: req.url,
          headers: req.headers,
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    });

    const testApp = express();
    testApp.use(capturingLogMiddleware);
    testApp.get('/test', (_req, res) => res.json({ ok: true }));

    await request(testApp).get('/test').set('Authorization', 'Bearer super-secret-token');

    const logOutput = chunks.map((c) => c.toString('utf8')).join('\n');
    expect(logOutput).not.toContain('super-secret-token');
    expect(logOutput).toContain('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Password redaction, traceparent propagation, no-console assertion
// ---------------------------------------------------------------------------

describe('logger — password field redaction', () => {
  it('does not log password field values in log objects (AC-NFR-3)', () => {
    const { chunks, stream } = makeCapture();
    const { logger: testLogger } = createLogger(TEST_CONFIG, stream);

    // Simulate a route that logs a user object (e.g., during auth debugging).
    // pino's *.password redact path must censor the value.
    testLogger.info({ body: { password: 'secret123' } }, 'request body inspection');

    const logOutput = chunks.map((c) => c.toString('utf8')).join('\n');
    expect(logOutput).not.toContain('secret123');
    expect(logOutput).toContain('[REDACTED]');
  });
});

describe('traceparent propagation', () => {
  it('traceId from incoming W3C traceparent header appears in getLogger() output (AC-HAPPY-3)', async () => {
    const knownTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const knownSpanId = '00f067aa0ba902b7';
    const traceparent = `00-${knownTraceId}-${knownSpanId}-01`;

    const { chunks, stream } = makeCapture();
    const { getLogger: getTestLogger } = createLogger(TEST_CONFIG, stream);

    // Simulate OTel HTTP auto-instrumentation: extract traceparent and enter the
    // OTel span context so that getLogger() enriches log lines with that traceId.
    // In production this is handled automatically by @opentelemetry/auto-instrumentations-node.
    const otelSimMiddleware: RequestHandler = (req, _res, next) => {
      const header = req.headers['traceparent'];
      if (typeof header === 'string') {
        const parts = header.split('-');
        const traceId = parts[1] ?? '';
        const spanId = parts[2] ?? '';
        const spanCtx = { traceId, spanId, traceFlags: TraceFlags.SAMPLED };
        const span = trace.wrapSpanContext(spanCtx);
        const ctx = trace.setSpan(otelContext.active(), span);
        otelContext.with(ctx, () => next());
      } else {
        next();
      }
    };

    const testApp = express();
    testApp.use(otelSimMiddleware);
    testApp.get('/traced', (_req, res) => {
      // getTestLogger() reads the active OTel span set by otelSimMiddleware above.
      getTestLogger().info('traced request handled');
      res.json({ ok: true });
    });

    await request(testApp).get('/traced').set('traceparent', traceparent);

    const logLines = chunks
      .map((c) => c.toString('utf8').trim())
      .filter(Boolean);

    expect(logLines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logLines[0]!) as Record<string, unknown>;
    expect(parsed['traceId']).toBe(knownTraceId);
  });
});

describe('no-console assertion', () => {
  it('contains no console.log or console.error calls in src/ (AC-NFR-1)', () => {
    // Resolve the project root from this file's location so the test works
    // regardless of which directory the developer invokes vitest from.
    const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');

    // grep exits with code 1 when no matches are found (the correct/passing case)
    // and exits 0 when matches are found (fail).
    const { status, stdout, stderr } = spawnSync(
      'grep',
      ['-r', '--include=*.ts', 'console\\.', 'src/'],
      { encoding: 'utf8', cwd: projectRoot },
    );
    expect(stderr, `grep failed: ${stderr}`).toBe('');
    expect(status).toBe(1);
    expect(stdout).toBe('');
  });
});
