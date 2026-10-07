// BSTONKEX Cache — TTL-based in-memory cache with stale-while-revalidate

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  staleTtl: number; // Serve stale data while revalidating up to this TTL
}

const store = new Map<string, CacheEntry<any>>();
let hits = 0;
let misses = 0;

/** Get from cache. Returns { data, stale } — stale=true means data exists but expired (within staleTtl). */
export function cacheGet<T>(key: string): { data: T; stale: boolean } | null {
  const entry = store.get(key);
  if (!entry) { misses++; return null; }
  const age = Date.now() - entry.timestamp;
  if (age < entry.ttl) { hits++; return { data: entry.data as T, stale: false }; }
  if (age < entry.staleTtl) { hits++; return { data: entry.data as T, stale: true }; }
  store.delete(key);
  misses++;
  return null;
}

/** Set in cache with TTL (ms) and optional stale TTL (default 5x TTL). */
export function cacheSet<T>(key: string, data: T, ttlMs: number, staleTtlMs?: number): void {
  store.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
    staleTtl: staleTtlMs ?? ttlMs * 5,
  });
}

/** Get or compute. If stale, returns stale data and triggers background revalidation. */
export async function cacheGetOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs: number,
  staleTtlMs?: number,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached && !cached.stale) return cached.data;
  if (cached?.stale) {
    // Return stale, revalidate in background
    compute().then(data => cacheSet(key, data, ttlMs, staleTtlMs)).catch(() => {});
    return cached.data;
  }
  const data = await compute();
  cacheSet(key, data, ttlMs, staleTtlMs);
  return data;
}

/** Invalidate a specific key. */
export function cacheInvalidate(key: string): void {
  store.delete(key);
}

/** Invalidate all keys matching a prefix. */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Clear all cache. */
export function cacheClearAll(): void {
  store.clear();
  hits = 0;
  misses = 0;
}

/** Cache stats for health monitoring. */
export function cacheStats(): { size: number; hits: number; misses: number; hitRate: number } {
  const total = hits + misses;
  return { size: store.size, hits, misses, hitRate: total > 0 ? hits / total : 0 };
}

// ── Common cache keys ────────────────────────────────────────
export const CACHE_KEYS = {
  nativePrice: (chain: string) => `price:native:${chain}`,
  tokenPrice: (chain: string, addr: string) => `price:token:${chain}:${addr}`,
  tokenMeta: (chain: string, addr: string) => `meta:${chain}:${addr}`,
  trending: 'market:trending',
  search: (q: string) => `search:${q}`,
  candles: (chain: string, pool: string, tf: string) => `candles:${chain}:${pool}:${tf}`,
  gasPrice: (chain: string) => `gas:${chain}`,
  balance: (chain: string, wallet: string) => `balance:${chain}:${wallet}`,
  health: 'system:health',
  quote: (key: string) => `quote:${key}`,
  discovery: (cat: string) => `discovery:${cat}`,
  pairs: (chain: string) => `pairs:${chain}`,
  marketAll: 'market:all',
};

// ── TTLs (ms) ────────────────────────────────────────────────
export const TTL = {
  PRICE: 15_000,          // 15s — prices update frequently
  TOKEN_META: 300_000,    // 5min — metadata rarely changes
  TRENDING: 60_000,       // 1min — trending list refreshes
  SEARCH: 30_000,         // 30s — search results
  CANDLES: 60_000,        // 1min — candles update per timeframe
  GAS: 10_000,            // 10s — gas fluctuates
  BALANCE: 20_000,        // 20s — balances change on tx
  HEALTH: 30_000,         // 30s — health check interval
  QUOTE: 8_000,           // 8s — quotes expire quickly
  DISCOVERY: 45_000,      // 45s — market discovery refresh
  NEW_PAIRS: 30_000,      // 30s — new pairs update
} as const;