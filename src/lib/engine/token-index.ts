// Cupcak8 Swap — Internal Token Index (Step 4 Hardened)
// Gitlawb is the source of truth. In-memory Maps are a cache only.
// Collection failures are surfaced via health status — never silently swallowed.
import { gitlawb } from '../gitlawb';
import type { ChainId } from '../config';
import type { TokenIndexRecord, DiscoveryCursor, AdapterHealth } from './discovery/types';

// ── Persistence health ──────────────────────────────────────

export interface PersistenceHealth {
  tokenIndexOk: boolean;
  cursorOk: boolean;
  healthOk: boolean;
  lastError: string | null;
  lastErrorAt: number | null;
}

const persistHealth: PersistenceHealth = {
  tokenIndexOk: true, cursorOk: true, healthOk: true,
  lastError: null, lastErrorAt: null,
};

function recordError(collection: string, error: any): void {
  const msg = `${collection}: ${error?.message || error}`;
  persistHealth.lastError = msg;
  persistHealth.lastErrorAt = Date.now();
  if (collection === 'token_index') persistHealth.tokenIndexOk = false;
  else if (collection === 'discovery_cursors') persistHealth.cursorOk = false;
  else if (collection === 'discovery_health') persistHealth.healthOk = false;
}

function recordSuccess(collection: string): void {
  if (collection === 'token_index') persistHealth.tokenIndexOk = true;
  else if (collection === 'discovery_cursors') persistHealth.cursorOk = true;
  else if (collection === 'discovery_health') persistHealth.healthOk = true;
}

export function getPersistenceHealth(): PersistenceHealth {
  return { ...persistHealth };
}

// ── Collections ─────────────────────────────────────────────

const tokenCol = () => gitlawb.db.collection<TokenIndexRecord>('token_index', { visibility: 'owner' });
const cursorCol = () => gitlawb.db.collection<DiscoveryCursor>('discovery_cursors', { visibility: 'owner' });
const healthCol = () => gitlawb.db.collection<AdapterHealth>('discovery_health', { visibility: 'owner' });

// ── In-memory cache (fast lookup only — Gitlawb is source of truth) ──

const indexCache = new Map<string, { record: TokenIndexRecord; remoteConfirmed: boolean }>();
const cursorCache = new Map<string, DiscoveryCursor>();

function cacheKey(chainId: ChainId, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

// ── Token Index CRUD ────────────────────────────────────────

/**
 * Idempotent insert. Returns true if new, false if duplicate.
 * On remote failure: caches locally AND returns a status the caller can inspect.
 * The record IS written to Gitlawb — if that fails, it is NOT silently kept as if it were.
 */
export async function indexToken(record: TokenIndexRecord): Promise<{ added: boolean; persisted: boolean }> {
  const key = cacheKey(record.chainId, record.address);

  // Check cache first (fast dedup)
  const cached = indexCache.get(key);
  if (cached?.remoteConfirmed) return { added: false, persisted: true };

  try {
    const col = tokenCol();
    // Check remote for dedup
    const { records } = await col.list({ limit: 500 });
    const exists = records.some(r =>
      r.data.chainId === record.chainId &&
      r.data.address.toLowerCase() === record.address.toLowerCase()
    );
    if (exists) {
      indexCache.set(key, { record, remoteConfirmed: true });
      recordSuccess('token_index');
      return { added: false, persisted: true };
    }

    await col.create({ ...record, createdAt: Date.now(), updatedAt: Date.now() });
    indexCache.set(key, { record, remoteConfirmed: true });
    recordSuccess('token_index');
    return { added: true, persisted: true };
  } catch (e) {
    // Surface the error — do NOT pretend the record is persisted
    recordError('token_index', e);
    // Cache locally to avoid duplicate insert attempts in this session
    indexCache.set(key, { record, remoteConfirmed: false });
    return { added: false, persisted: false };
  }
}

/** Batch insert. Returns { added, persisted, failed }. */
export async function indexTokens(records: TokenIndexRecord[]): Promise<{ added: number; persisted: number; failed: number }> {
  let added = 0, persisted = 0, failed = 0;
  for (const r of records) {
    const result = await indexToken(r);
    if (result.added) added++;
    if (result.persisted) persisted++;
    else failed++;
  }
  return { added, persisted, failed };
}

/** Get a token. Tries cache, then paginated Gitlawb search. Returns null if not found. */
export async function getToken(chainId: ChainId, address: string): Promise<TokenIndexRecord | null> {
  const key = cacheKey(chainId, address);
  const cached = indexCache.get(key);
  if (cached) return cached.record;

  try {
    // Paginated search (handles >200 records)
    const all = await listAllIndexedTokens({ chainId });
    const found = all.find(t => t.address.toLowerCase() === address.toLowerCase());
    if (found) { recordSuccess('token_index'); return found; }
    recordSuccess('token_index');
  } catch (e) {
    recordError('token_index', e);
  }
  return null;
}

/**
 * List ALL tokens using cursor pagination (retrieves beyond first page).
 * Uses the Gitlawb `nextBefore` cursor to paginate through all records.
 * Deduplicates by (chainId, address) across pages.
 */
export async function listAllIndexedTokens(opts?: {
  chainId?: ChainId;
  launchpadId?: string;
  maxPages?: number;
}): Promise<TokenIndexRecord[]> {
  const maxPages = opts?.maxPages ?? 10; // safety cap
  const allTokens = new Map<string, TokenIndexRecord>();
  let before: string | undefined = undefined;

  try {
    for (let page = 0; page < maxPages; page++) {
      const result = await tokenCol().list({ limit: 200, ...(before ? { before } : {}) });

      for (const r of result.records) {
        const k = cacheKey(r.data.chainId, r.data.address);
        if (!allTokens.has(k)) {
          allTokens.set(k, r.data);
          indexCache.set(k, { record: r.data, remoteConfirmed: true });
        }
      }

      // If no nextBefore cursor, we've fetched all records
      if (!result.nextBefore || result.records.length === 0) break;
      before = result.nextBefore;
    }

    recordSuccess('token_index');
  } catch (e) {
    recordError('token_index', e);
    // Return whatever we have from cache on remote failure
    for (const [k, v] of indexCache) {
      if (!allTokens.has(k)) allTokens.set(k, v.record);
    }
  }

  let tokens = Array.from(allTokens.values());
  if (opts?.chainId) tokens = tokens.filter(t => t.chainId === opts.chainId);
  if (opts?.launchpadId) tokens = tokens.filter(t => t.launchpadId === opts.launchpadId);
  return tokens.sort((a, b) => b.launchTimestamp - a.launchTimestamp);
}

/** List tokens (first page only). Gitlawb is source of truth; cache is fallback on remote failure. */
export async function listIndexedTokens(opts?: {
  chainId?: ChainId;
  launchpadId?: string;
  limit?: number;
}): Promise<TokenIndexRecord[]> {
  try {
    const { records } = await tokenCol().list({ limit: opts?.limit ?? 500 });
    // Update cache with remote data
    for (const r of records) {
      const k = cacheKey(r.data.chainId, r.data.address);
      indexCache.set(k, { record: r.data, remoteConfirmed: true });
    }
    recordSuccess('token_index');

    let tokens = records.map(r => r.data);
    if (opts?.chainId) tokens = tokens.filter(t => t.chainId === opts.chainId);
    if (opts?.launchpadId) tokens = tokens.filter(t => t.launchpadId === opts.launchpadId);
    return tokens.sort((a, b) => b.launchTimestamp - a.launchTimestamp);
  } catch (e) {
    // Remote unavailable — return cache but flag health
    recordError('token_index', e);
    let tokens = Array.from(indexCache.values()).map(v => v.record);
    if (opts?.chainId) tokens = tokens.filter(t => t.chainId === opts.chainId);
    if (opts?.launchpadId) tokens = tokens.filter(t => t.launchpadId === opts.launchpadId);
    return tokens.sort((a, b) => b.launchTimestamp - a.launchTimestamp);
  }
}

/** Update market data on an indexed token. */
export async function updateMarketData(
  chainId: ChainId,
  address: string,
  data: Partial<Pick<TokenIndexRecord, 'price' | 'volume24h' | 'liquidity' | 'marketCap' | 'name' | 'symbol' | 'icon' | 'marketDataStatus' | 'lastEnrichedAt' | 'routeVerified' | 'routeVerifiedAt' | 'routeProvider' | 'routeDirection' | 'routeError' | 'routeBuyVerified' | 'routeSellVerified' | 'routeBothVerified' | 'marketState' | 'bondingCurveProgress' | 'priceSource' | 'liquidityType'>>
): Promise<boolean> {
  const key = cacheKey(chainId, address);
  const cached = indexCache.get(key);
  if (cached) {
    Object.assign(cached.record, data, { updatedAt: Date.now() });
  }

  try {
    const col = tokenCol();
    const { records } = await col.list({ limit: 500 });
    const rec = records.find(r =>
      r.data.chainId === chainId &&
      r.data.address.toLowerCase() === address.toLowerCase()
    );
    if (rec) {
      await col.update(rec.id, { ...data, updatedAt: Date.now() });
      recordSuccess('token_index');
      return true;
    }
    return false;
  } catch (e) {
    recordError('token_index', e);
    return false;
  }
}

/**
 * Update a token's market lifecycle state on its EXISTING record.
 * Called on create/complete/migrate events — updates in place by (chainId, mint)
 * so a token tracked through creation → curve trading → completion → PumpSwap
 * migration NEVER produces a duplicate record or duplicated volume.
 * On migrate, also switches market-data sourcing off the bonding curve
 * (priceSource 'dex_pair') so post-migration pricing comes from the AMM pool.
 * No-op when the record does not exist yet (create flow inserts it via indexToken).
 */
export async function updateTokenLifecycle(
  chainId: ChainId,
  mint: string,
  lifecycle: {
    marketState?: TokenIndexRecord['marketState'];
    bondingCurveProgress?: number | null;
    priceSource?: TokenIndexRecord['priceSource'];
    liquidityType?: TokenIndexRecord['liquidityType'];
  }
): Promise<boolean> {
  return updateMarketData(chainId, mint, lifecycle);
}

// ── Cursor Management ───────────────────────────────────────

function cursorKey(chainId: ChainId, adapterId: string): string {
  return `${chainId}:${adapterId}`;
}

/** Get cursor. Returns default if not found. */
export async function getCursor(chainId: ChainId, adapterId: string): Promise<DiscoveryCursor> {
  const key = cursorKey(chainId, adapterId);
  if (cursorCache.has(key)) return cursorCache.get(key)!;

  try {
    const { records } = await cursorCol().list({ limit: 50 });
    const rec = records.find(r => r.data.chainId === chainId && r.data.adapterId === adapterId);
    if (rec) {
      cursorCache.set(key, rec.data);
      recordSuccess('discovery_cursors');
      return rec.data;
    }
    recordSuccess('discovery_cursors');
  } catch (e) {
    recordError('discovery_cursors', e);
  }

  const defaultCursor: DiscoveryCursor = {
    chainId, adapterId,
    blockNumber: null, solanaSlot: null,
    lastRunAt: null, lastSuccessAt: null,
  };
  cursorCache.set(key, defaultCursor);
  return defaultCursor;
}

/**
 * Save cursor. Only advances forward — never regresses.
 * Returns true if persisted to Gitlawb successfully.
 */
export async function saveCursor(cursor: DiscoveryCursor): Promise<boolean> {
  const key = cursorKey(cursor.chainId, cursor.adapterId);
  const existing = cursorCache.get(key);

  // Forward-only: don't allow regression
  if (existing) {
    if (cursor.blockNumber !== null && existing.blockNumber !== null && cursor.blockNumber < existing.blockNumber) {
      cursor.blockNumber = existing.blockNumber;
    }
    if (cursor.solanaSlot !== null && existing.solanaSlot !== null && cursor.solanaSlot < existing.solanaSlot) {
      cursor.solanaSlot = existing.solanaSlot;
    }
  }

  cursorCache.set(key, cursor);

  try {
    const col = cursorCol();
    const { records } = await col.list({ limit: 50 });
    const rec = records.find(r => r.data.chainId === cursor.chainId && r.data.adapterId === cursor.adapterId);
    if (rec) {
      await col.update(rec.id, cursor);
    } else {
      await col.create(cursor);
    }
    recordSuccess('discovery_cursors');
    return true;
  } catch (e) {
    recordError('discovery_cursors', e);
    return false;
  }
}

// ── Health Tracking ─────────────────────────────────────────

const healthCache = new Map<string, AdapterHealth>();

export async function saveHealth(health: AdapterHealth): Promise<void> {
  healthCache.set(health.adapterId, health);
  try {
    const col = healthCol();
    const { records } = await col.list({ limit: 20 });
    const rec = records.find(r => r.data.adapterId === health.adapterId);
    if (rec) await col.update(rec.id, health);
    else await col.create(health);
    recordSuccess('discovery_health');
  } catch (e) {
    recordError('discovery_health', e);
  }
}

export function getHealthSync(adapterId: string): AdapterHealth | null {
  return healthCache.get(adapterId) ?? null;
}

export async function getAllHealth(): Promise<AdapterHealth[]> {
  if (healthCache.size > 0) return Array.from(healthCache.values());
  try {
    const { records } = await healthCol().list({ limit: 20 });
    for (const r of records) healthCache.set(r.data.adapterId, r.data);
    recordSuccess('discovery_health');
    return records.map(r => r.data);
  } catch (e) {
    recordError('discovery_health', e);
    return [];
  }
}

// ── Stats ───────────────────────────────────────────────────

export function getIndexStats(): { cached: number; cursors: number; health: PersistenceHealth } {
  return { cached: indexCache.size, cursors: cursorCache.size, health: getPersistenceHealth() };
}
