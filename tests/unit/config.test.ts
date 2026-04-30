/**
 * Config module unit tests (Phase 1 — TDD)
 *
 * These tests define the contract for src/config/index.ts before that module
 * is implemented. They will FAIL until the Coding Agent creates the module.
 *
 * Design under test:
 *   loadConfig(env?) — accepts an optional env map; validates with zod; throws
 *   on missing required vars with the variable name in the error message.
 *
 * Acceptance criteria covered:
 *   AC-NFR-2 — All configuration is supplied via environment variables;
 *               missing required vars produce a startup error naming the variable.
 *
 * Test override pattern (per systemPatterns.md):
 *   Tests do NOT mutate process.env. They call loadConfig({ ...vars }) with a
 *   custom env map. This keeps tests hermetic and runnable in any order.
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

// Minimal valid env containing all required fields. Tests spread this and
// override individual fields to keep each test self-contained.
const VALID_ENV = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/testdb',
};

describe('loadConfig', () => {
  // ── Happy path ────────────────────────────────────────────────────────────

  it('reads PORT from environment and coerces it to a number', () => {
    // Arrange: provide a custom PORT as a string (env vars are always strings)
    const env = { ...VALID_ENV, PORT: '4000' };

    // Act
    const cfg = loadConfig(env);

    // Assert: PORT is coerced to a number by the schema
    expect(cfg.PORT).toBe(4000);
    expect(typeof cfg.PORT).toBe('number');
  });

  it('reads DATABASE_URL from environment and exposes it on the config object', () => {
    // Arrange
    const dbUrl = 'postgres://banyan:secret@db:5432/banyanboard';
    const env = { ...VALID_ENV, DATABASE_URL: dbUrl };

    // Act
    const cfg = loadConfig(env);

    // Assert: the exact URL is preserved (no transformation)
    expect(cfg.DATABASE_URL).toBe(dbUrl);
  });

  it('defaults LOG_LEVEL to "info" when the variable is not set', () => {
    // Arrange: env does not include LOG_LEVEL
    const env = { ...VALID_ENV };

    // Act
    const cfg = loadConfig(env);

    // Assert: schema default applies
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  // ── Error boundary ────────────────────────────────────────────────────────

  it('throws with DATABASE_URL in the error message when the variable is absent', () => {
    // Arrange: omit the only required variable
    const env = {};

    // Act & Assert: the thrown error must name the missing variable so that
    // operators can immediately identify what to fix (AC-NFR-2, "Fail fast" principle)
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });
});
