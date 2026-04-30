/**
 * Integration tests for Express middleware behaviour (Phase 3 — TDD)
 *
 * Tests two behaviours that need the full middleware stack to verify:
 *   1. Global error handler returns JSON (not HTML) with the correct envelope and traceId field.
 *   2. Authorization header value is not present in log output (pino redact).
 *
 * Acceptance criteria covered:
 *   AC-ERROR-1 — Unhandled route errors return structured JSON and are logged at error level
 *   AC-NFR-3   — No sensitive data in logs (Authorization header value redacted)
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
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
    const chunks: Buffer[] = [];
    const memStream = new Writable({
      write(chunk: Buffer, _enc: string, cb: () => void) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
    });

    const { logger: testLogger } = createLogger(TEST_CONFIG, memStream);

    // Build a capturing pinoHttp instance with headers in the serializer.
    // Tests are exempt from the no-restricted-imports rule that restricts
    // pino-http to src/logger/ — this lets us test the redact pipeline directly.
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

    await request(testApp)
      .get('/test')
      .set('Authorization', 'Bearer super-secret-token');

    const logOutput = chunks.map((c) => c.toString('utf8')).join('\n');
    expect(logOutput).not.toContain('super-secret-token');
    expect(logOutput).toContain('[REDACTED]');
  });
});
