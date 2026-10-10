/**
 * PostgreSQL Connection Pool — Railway Postgres via DATABASE_URL.
 *
 * The connection string is read from process.env.DATABASE_URL at runtime.
 * It is NEVER logged, NEVER sent to the frontend, and NEVER written to files.
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let lastError: string | null = null;
let connected = false;

/** Create (or return) the singleton connection pool. */
export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — PostgreSQL is not configured');
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Railway Postgres uses SSL by default
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
      ? undefined
      : { rejectUnauthorized: false },
  });

  pool.on('error', (err) => {
    lastError = err.message;
    connected = false;
    console.error('[DB] Pool error:', err.message);
  });

  return pool;
}

/** Check if DATABASE_URL is configured. */
export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Ping the database and return true if reachable. */
export async function pingDb(): Promise<boolean> {
  if (!isDbConfigured()) {
    lastError = 'DATABASE_URL not configured';
    return false;
  }
  try {
    const p = getPool();
    const result = await p.query('SELECT 1 AS ok');
    connected = result.rows[0]?.ok === 1;
    lastError = null;
    return connected;
  } catch (err: any) {
    lastError = err.message;
    connected = false;
    return false;
  }
}

/** Get current connection status without logging secrets. */
export function getDbStatus(): { configured: boolean; connected: boolean; lastError: string | null } {
  return {
    configured: isDbConfigured(),
    connected,
    lastError,
  };
}

/** Gracefully close the pool. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    connected = false;
  }
}

/** Execute a query with automatic error context. */
export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  const p = getPool();
  return p.query(text, params);
}

/** Run a function inside a transaction. Rolls back on error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
