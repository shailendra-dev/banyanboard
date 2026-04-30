/**
 * Integration tests for GET /health (Phase 3 — TDD)
 *
 * Tests the health endpoint against a real Express app with the DB module mocked.
 * No actual PostgreSQL connection is required.
 *
 * Acceptance criteria covered:
 *   AC-HAPPY-1 — Health endpoint returns correct structured response
 *   AC-ERROR-2 — DB-unavailable condition reflected in health check (503)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/db/index.js', () => ({
  ping: vi.fn().mockResolvedValue(true),
  query: vi.fn(),
  getPool: vi.fn(),
  shutdown: vi.fn(),
}));

import { createApp } from '../../src/app.js';
import * as db from '../../src/db/index.js';

describe('GET /health', () => {
  const app = createApp();

  beforeEach(() => {
    vi.mocked(db.ping).mockResolvedValue(true);
  });

  it('returns 200 with required JSON fields when DB is connected', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: expect.any(String),
      version: expect.any(String),
      db: 'connected',
    });
  });

  it('reflects actual ping() return value: db is connected when ping resolves true', async () => {
    vi.mocked(db.ping).mockResolvedValue(true);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.db).toBe('connected');
  });

  it('returns 503 with db: disconnected when ping resolves false', async () => {
    vi.mocked(db.ping).mockResolvedValue(false);

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'degraded',
      db: 'disconnected',
    });
  });
});
