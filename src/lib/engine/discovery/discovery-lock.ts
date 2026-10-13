// Cupcak8 Swap — Discovery Advisory Lock
// Gitlawb-based lock to prevent concurrent discovery workers across browser sessions.
// TTL-based: lock auto-expires after LOCK_TTL_MS to handle crashed/tab-closed sessions.
import { gitlawb } from '../../gitlawb';

const LOCK_TTL_MS = 300_000;      // 5 minutes — Solana RPC calls are slow on public endpoints
const LOCK_RENEWAL_MS = 60_000;   // Renew lock every 60s during active work

interface LockRecord {
  lockedBy: string;    // session identifier
  acquiredAt: number;
  expiresAt: number;
}

function sessionId(): string {
  // Generate a per-tab/session identifier (not persisted across reloads)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const MY_SESSION = sessionId();

function lockCol() {
  return gitlawb.db.collection<any>('discovery_lock', { visibility: 'owner' });
}

/**
 * Try to acquire the discovery lock. Returns true if acquired.
 * Respects TTL — expired locks are treated as free.
 */
export async function acquireLock(): Promise<boolean> {
  try {
    const col = lockCol();
    const { records } = await col.list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy !== undefined);

    if (existing) {
      const lock = existing.data;
      // Check if expired
      if (Date.now() < lock.expiresAt && lock.lockedBy !== MY_SESSION) {
        return false; // held by another session
      }
      // Expired or ours — take over
      await col.update(existing.id, {
        lockedBy: MY_SESSION,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + LOCK_TTL_MS,
      });
      return true;
    }

    // No lock record — create one
    await col.create({
      lockedBy: MY_SESSION,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + LOCK_TTL_MS,
    });
    return true;
  } catch {
    // If lock service is unavailable, allow operation (fail-open with caution)
    // This prevents lock-service outage from blocking all discovery
    return true;
  }
}

/** Release the discovery lock (only if we hold it). */
export async function releaseLock(): Promise<void> {
  try {
    const col = lockCol();
    const { records } = await col.list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy === MY_SESSION);
    if (existing) {
      await col.update(existing.id, {
        lockedBy: '',
        acquiredAt: 0,
        expiresAt: 0, // immediately free
      });
    }
  } catch { /* best-effort release */ }
}

/** Renew the lock (call periodically during long-running work to prevent TTL expiry). */
export async function renewLock(): Promise<boolean> {
  try {
    const col = lockCol();
    const { records } = await col.list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy === MY_SESSION);
    if (existing) {
      await col.update(existing.id, { expiresAt: Date.now() + LOCK_TTL_MS });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Check if the lock is currently held (by anyone). Stale locks (expired) are treated as free. */
export async function isLocked(): Promise<boolean> {
  try {
    const { records } = await lockCol().list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy !== undefined && r.data.lockedBy !== '');
    return existing ? Date.now() < existing.data.expiresAt : false;
  } catch {
    return false;
  }
}

/**
 * Force-expire a stale lock (admin operation).
 * Only expires locks that are past their TTL — safe to call at any time.
 */
export async function forceExpireStaleLock(): Promise<boolean> {
  try {
    const col = lockCol();
    const { records } = await col.list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy !== undefined && r.data.lockedBy !== '');
    if (existing && Date.now() >= existing.data.expiresAt) {
      await col.update(existing.id, { lockedBy: '', acquiredAt: 0, expiresAt: 0 });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Get the current lock holder info (for health display). */
export async function getLockInfo(): Promise<LockRecord | null> {
  try {
    const { records } = await lockCol().list({ limit: 5 });
    const existing = records.find(r => r.data.lockedBy !== undefined && r.data.lockedBy !== '');
    return existing?.data ?? null;
  } catch {
    return null;
  }
}
