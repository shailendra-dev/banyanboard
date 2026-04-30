/**
 * Logger module unit tests (Phase 2 — TDD)
 *
 * These tests define the contract for src/logger/index.ts before implementation.
 * They will FAIL until the Coding Agent creates the module.
 *
 * Design under test:
 *   createLogger(cfg, dest?) — factory that returns { logger, getLogger, runWithContext }
 *   getLogger()  — returns a child pino logger enriched with the active OTel span's
 *                  traceId/spanId via AsyncLocalStorage
 *
 * Acceptance criteria covered:
 *   AC-HAPPY-2 — Every HTTP request produces a structured JSON log line containing
 *                traceId, spanId, service, level, timestamp
 *   AC-HAPPY-3 — Incoming W3C traceparent header is propagated through the request
 *   AC-NFR-1   — No console.log/console.error (enforced by ESLint, not tested here)
 *   AC-NFR-3   — No sensitive data in logs (redaction tested in Phase 3 integration tests)
 *
 * Test override pattern:
 *   Tests use createLogger(testConfig, dest) to write logs to an in-memory Writable.
 *   Tests do NOT touch process.env or the module-level singleton.
 *   OTel span context is set up via context.with(trace.setSpan(...)) — no HTTP server needed.
 */

import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { context as otelContext, trace, type SpanContext, TraceFlags } from '@opentelemetry/api';
import { createLogger } from '../../src/logger/index.js';

// Minimal config for the logger (does NOT require DATABASE_URL).
const TEST_CONFIG = {
  LOG_LEVEL: 'debug' as const,
  LOG_FORMAT: 'json' as const,
  SERVICE_NAME: 'test-service',
  SERVICE_VERSION: '0.0.0',
  NODE_ENV: 'test' as const,
};

/** Create an in-memory Writable and the captured lines array. */
function makeCapture(): { lines: string[]; dest: Writable } {
  const lines: string[] = [];
  const dest = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      const text = chunk.toString('utf8').trim();
      if (text) lines.push(text);
      cb();
    },
  });
  return { lines, dest };
}

/** Build an OTel span context with the given traceId/spanId. */
function makeSpanContext(traceId: string, spanId: string): SpanContext {
  return { traceId, spanId, traceFlags: TraceFlags.SAMPLED };
}

describe('createLogger', () => {
  describe('log output format', () => {
    it('produces valid JSON on every log call', () => {
      const { lines, dest } = makeCapture();
      const { logger: log } = createLogger(TEST_CONFIG, dest);

      log.info('hello from test');

      expect(lines).toHaveLength(1);
      expect(() => { JSON.parse(lines[0]!); }).not.toThrow();
    });

    it('includes service, level, and timestamp fields in every log line', () => {
      const { lines, dest } = makeCapture();
      const { logger: log } = createLogger(TEST_CONFIG, dest);

      log.info('check fields');

      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

      // Required base fields per AC-HAPPY-2
      expect(parsed).toHaveProperty('service', TEST_CONFIG.SERVICE_NAME);
      expect(parsed).toHaveProperty('level', 'info');
      // Timestamp must be an ISO 8601 string (named "timestamp")
      expect(parsed).toHaveProperty('timestamp');
      expect(typeof parsed['timestamp']).toBe('string');
      expect(String(parsed['timestamp'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('getLogger — OTel trace context enrichment', () => {
    it('includes traceId and spanId from the active OTel span', () => {
      const { lines, dest } = makeCapture();
      const { getLogger } = createLogger(TEST_CONFIG, dest);

      const knownTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const knownSpanId = '00f067aa0ba902b7';

      const span = trace.wrapSpanContext(makeSpanContext(knownTraceId, knownSpanId));
      const ctx = trace.setSpan(otelContext.active(), span);

      otelContext.with(ctx, () => {
        const log = getLogger();
        log.info('propagated trace');
      });

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

      // AC-HAPPY-2: traceId and spanId must be present when a span is active
      expect(parsed).toHaveProperty('traceId', knownTraceId);
      expect(parsed).toHaveProperty('spanId', knownSpanId);
    });

    it('produces no traceId or spanId when no OTel span is active', () => {
      const { lines, dest } = makeCapture();
      const { getLogger } = createLogger(TEST_CONFIG, dest);

      // Run outside any OTel context — simulates startup/shutdown log calls
      const log = getLogger();
      log.info('startup message');

      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;

      // No active span → no trace enrichment (base logger returned as-is)
      expect(parsed).not.toHaveProperty('traceId');
      expect(parsed).not.toHaveProperty('spanId');
    });
  });
});
