import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logger/index.js';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database ping failed');
    return false;
  }
}

export async function shutdown(): Promise<void> {
  await pool.end();
}

export function getPool(): Pool {
  return pool;
}
