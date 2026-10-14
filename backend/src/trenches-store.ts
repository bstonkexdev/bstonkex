// Cupcak8 Swap — Trenches Store
// Redis-compatible in-memory store: hashes, sorted sets, TTL cache.
// Same API shape as Redis — swap to ioredis later without changing callers.

type HashValue = Record<string, string>;
type ZSetEntry = { member: string; score: number };

const hashes = new Map<string, HashValue>();
const zsets = new Map<string, ZSetEntry[]>();
const cache = new Map<string, { value: unknown; expiresAt: number }>();

// ── Hash Operations ─────────────────────────────────────────

export function hset(key: string, field: string, value: string): void {
  if (!hashes.has(key)) hashes.set(key, {});
  hashes.get(key)![field] = value;
}

export function hsetAll(key: string, obj: Record<string, string>): void {
  const existing = hashes.get(key) ?? {};
  hashes.set(key, { ...existing, ...obj });
}

export function hget(key: string, field: string): string | null {
  return hashes.get(key)?.[field] ?? null;
}

export function hgetall(key: string): Record<string, string> | null {
  return hashes.get(key) ? { ...hashes.get(key)! } : null;
}

export function hdel(key: string, field: string): void {
  delete hashes.get(key)?.[field];
}

/** Set field only if it does not exist (Redis HSETNX). */
export function hsetnx(key: string, field: string, value: string): boolean {
  if (!hashes.has(key)) hashes.set(key, {});
  const h = hashes.get(key)!;
  if (field in h) return false;
  h[field] = value;
  return true;
}

/** Increment a hash field by a float value (Redis HINCRBYFLOAT). */
export function hincrbyfloat(key: string, field: string, increment: number): number {
  if (!hashes.has(key)) hashes.set(key, {});
  const h = hashes.get(key)!;
  const current = parseFloat(h[field] || '0') || 0;
  const next = current + increment;
  h[field] = String(next);
  return next;
}

export function del(key: string): void {
  hashes.delete(key);
  zsets.delete(key);
  cache.delete(key);
}

// ── Pipeline (batched atomic operations) ─────────────────────

type PipelineOp = () => void;

class Pipeline {
  private ops: PipelineOp[] = [];

  hset(key: string, field: string, value: string): this {
    this.ops.push(() => hset(key, field, value));
    return this;
  }

  hsetnx(key: string, field: string, value: string): this {
    this.ops.push(() => hsetnx(key, field, value));
    return this;
  }

  hincrbyfloat(key: string, field: string, increment: number): this {
    this.ops.push(() => hincrbyfloat(key, field, increment));
    return this;
  }

  hsetAll(key: string, obj: Record<string, string>): this {
    this.ops.push(() => hsetAll(key, obj));
    return this;
  }

  zadd(key: string, score: number, member: string): this {
    this.ops.push(() => zadd(key, score, member));
    return this;
  }

  exec(): void {
    for (const op of this.ops) op();
    this.ops = [];
  }
}

/** Create a pipeline for batched atomic operations (mirrors Redis pipeline). */
export function pipeline(): Pipeline {
  return new Pipeline();
}

// ── Sorted Set Operations ───────────────────────────────────

export function zadd(key: string, score: number, member: string): void {
  if (!zsets.has(key)) zsets.set(key, []);
  const entries = zsets.get(key)!;
  const idx = entries.findIndex(e => e.member === member);
  if (idx >= 0) entries[idx].score = score;
  else entries.push({ member, score });
  entries.sort((a, b) => a.score - b.score);
}

export function zrevrange(key: string, start: number, stop: number): string[] {
  const entries = [...(zsets.get(key) ?? [])].reverse();
  const end = stop === -1 ? entries.length : stop + 1;
  return entries.slice(start, end).map(e => e.member);
}

export function zrange(key: string, start: number, stop: number): string[] {
  const entries = zsets.get(key) ?? [];
  const end = stop === -1 ? entries.length : stop + 1;
  return entries.slice(start, end).map(e => e.member);
}

export function zscore(key: string, member: string): number | null {
  return zsets.get(key)?.find(e => e.member === member)?.score ?? null;
}

export function zcard(key: string): number {
  return zsets.get(key)?.length ?? 0;
}

export function zrem(key: string, member: string): void {
  const entries = zsets.get(key);
  if (!entries) return;
  const idx = entries.findIndex(e => e.member === member);
  if (idx >= 0) entries.splice(idx, 1);
}

// ── TTL Cache (for security audits, enrichment) ────────────

export function setCached(key: string, value: unknown, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

// ── Stats ───────────────────────────────────────────────────

export function getStoreStats() {
  return {
    hashes: hashes.size,
    zsets: zsets.size,
    cacheEntries: cache.size,
  };
}
