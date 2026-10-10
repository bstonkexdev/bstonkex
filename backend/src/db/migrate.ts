/**
 * Migration Runner — repeatable, versioned SQL migrations.
 *
 * Migrations live in src/db/migrations/*.sql and are applied in order.
 * A schema_migrations table tracks which migrations have been applied.
 * Each migration runs inside a transaction — if it fails, nothing is committed.
 *
 * Usage:
 *   node dist/db/migrate.js          # apply pending migrations
 *   npm run migrate                  # same (via package.json script)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, isDbConfigured } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface MigrationFile {
  version: string;
  filename: string;
  sql: string;
}

/** Read all migration files from the migrations directory. */
function loadMigrations(): MigrationFile[] {
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Lexical sort = chronological order (001_, 002_, ...)

  return files.map(filename => {
    const version = filename.replace('.sql', '');
    const sql = readFileSync(join(dir, filename), 'utf-8');
    return { version, filename, sql };
  });
}

/** Ensure the schema_migrations table exists. */
async function ensureMigrationsTable(client: any): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Get list of already-applied migration versions. */
async function getAppliedVersions(client: any): Promise<Set<string>> {
  const result = await client.query('SELECT version FROM schema_migrations');
  return new Set(result.rows.map((r: any) => r.version));
}

/**
 * Apply all pending migrations.
 * Uses pg_advisory_lock to prevent concurrent migration races.
 * Returns the list of newly applied migration versions.
 */
export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not set — cannot run migrations');
  }

  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // Advisory lock prevents concurrent backend instances from racing
    // on the same migration. Blocks until lock is acquired.
    await client.query('SELECT pg_advisory_lock(727272)');
    console.log('[MIGRATE] Advisory lock acquired');

    await ensureMigrationsTable(client);
    const appliedVersions = await getAppliedVersions(client);
    const migrations = loadMigrations();

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }

      console.log(`[MIGRATE] Applying ${migration.filename}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
          [migration.version, migration.filename]
        );
        await client.query('COMMIT');
        applied.push(migration.version);
        console.log(`[MIGRATE] ✓ ${migration.version} applied`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE] ✗ ${migration.version} failed: ${err.message}`);
        throw err;
      }
    }

    return { applied, skipped };
  } finally {
    // Always release the advisory lock (safe even if not held)
    try { await client.query('SELECT pg_advisory_unlock(727272)'); } catch { /* not held */ }
    client.release();
  }
}

/** Get migration status (for health checks). */
export async function getMigrationStatus(): Promise<{ total: number; applied: number; pending: number }> {
  if (!isDbConfigured()) {
    return { total: 0, applied: 0, pending: 0 };
  }

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await ensureMigrationsTable(client);
      const appliedVersions = await getAppliedVersions(client);
      const migrations = loadMigrations();
      const pending = migrations.filter(m => !appliedVersions.has(m.version));
      return {
        total: migrations.length,
        applied: migrations.length - pending.length,
        pending: pending.length,
      };
    } finally {
      client.release();
    }
  } catch {
    return { total: 0, applied: 0, pending: 0 };
  }
}

// ── CLI entry point ──────────────────────────────────────────
// When run directly (node dist/db/migrate.js), apply migrations and exit.
const isMain = process.argv[1]?.includes('migrate');
if (isMain) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(`[MIGRATE] Done. Applied: ${applied.length}, Skipped: ${skipped.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MIGRATE] Failed:', err.message);
      process.exit(1);
    });
}
