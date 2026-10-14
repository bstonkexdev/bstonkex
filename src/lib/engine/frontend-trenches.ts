// Cupcak8 Swap — Frontend Trenches Store
// Mirrors the backend's Redis pipeline (HSET token:<mint>, ZADD trenches:<chain>:<launchpad>)
// so the UI has instant access to all tokens without waiting for API responses.
//
// Architecture (matching ave.ai):
//   [All Data Sources] → HSET token:<mint> → ZADD sorted sets → UI reads
//
// Data sources that feed this store:
//   1. PumpPortal WS (real-time new tokens + trades)
//   2. market-bootstrapper (DexScreener + GeckoTerminal + PumpPortal REST)
//   3. Solana trade stream (on-chain DEX logs)
//   4. Backend API (/api/tokens/cached, /api/tokens/trenches/:launchpad)

export interface TrenchToken {
  mint: string;
  chain: string;
  launchpad: string;
  symbol: string;
  name: string;
  image: string;
  spotPrice: string;
  virtualMcap: string;
  priceChange24h: string;
  bondingCurveProgress: string;
  holders: string;
  volume24h: string;
  liquidity: string;
  buys24h: string;
  sells24h: string;
  pairAddress: string;
  dexId: string;
  createdAt: number;
  updatedAt: number;
  source: string;
}

// ── In-Memory Store (mirrors backend Redis) ──────────────────

const tokenHash = new Map<string, TrenchToken>(); // token:<mint>
const sortedSets = new Map<string, Map<string, number>>(); // trenches:<chain>:<launchpad>:<filter>

// Listeners for real-time UI updates
type TokenListener = (token: TrenchToken, action: 'create' | 'update') => void;
const listeners = new Set<TokenListener>();

/**
 * Subscribe to token store changes.
 * Returns unsubscribe function.
 */
export function onTrenchToken(cb: TokenListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(token: TrenchToken, action: 'create' | 'update') {
  for (const cb of listeners) {
    try { cb(token, action); } catch { /* listener error */ }
  }
}

// ── HSET token:<mint> ────────────────────────────────────────

/**
 * Store a token (HSET token:<mint>).
 * Creates if new, updates if existing. Emits to listeners.
 */
export function hsetToken(token: Partial<TrenchToken> & { mint: string }): void {
  const existing = tokenHash.get(token.mint);
  const now = Date.now();

  if (existing) {
    // Merge: only overwrite non-empty fields
    if (token.chain) existing.chain = token.chain;
    if (token.launchpad) existing.launchpad = token.launchpad;
    if (token.symbol && token.symbol !== '???') existing.symbol = token.symbol;
    if (token.name && token.name !== 'Unknown') existing.name = token.name;
    if (token.image) existing.image = token.image;
    if (token.spotPrice && token.spotPrice !== '0') existing.spotPrice = token.spotPrice;
    if (token.virtualMcap && token.virtualMcap !== '0') existing.virtualMcap = token.virtualMcap;
    if (token.priceChange24h && token.priceChange24h !== '0') existing.priceChange24h = token.priceChange24h;
    if (token.bondingCurveProgress) existing.bondingCurveProgress = token.bondingCurveProgress;
    if (token.holders && token.holders !== '0') existing.holders = token.holders;
    if (token.volume24h && token.volume24h !== '0') existing.volume24h = token.volume24h;
    if (token.liquidity && token.liquidity !== '0') existing.liquidity = token.liquidity;
    if (token.buys24h && token.buys24h !== '0') existing.buys24h = token.buys24h;
    if (token.sells24h && token.sells24h !== '0') existing.sells24h = token.sells24h;
    if (token.pairAddress) existing.pairAddress = token.pairAddress;
    if (token.dexId) existing.dexId = token.dexId;
    if (token.source) existing.source = token.source;
    existing.updatedAt = now;
    emit(existing, 'update');
  } else {
    const full: TrenchToken = {
      mint: token.mint,
      chain: token.chain || 'sol',
      launchpad: token.launchpad || 'unknown',
      symbol: token.symbol || '???',
      name: token.name || 'Unknown',
      image: token.image || '',
      spotPrice: token.spotPrice || '0',
      virtualMcap: token.virtualMcap || '0',
      priceChange24h: token.priceChange24h || '0',
      bondingCurveProgress: token.bondingCurveProgress || '0',
      holders: token.holders || '0',
      volume24h: token.volume24h || '0',
      liquidity: token.liquidity || '0',
      buys24h: token.buys24h || '0',
      sells24h: token.sells24h || '0',
      pairAddress: token.pairAddress || '',
      dexId: token.dexId || '',
      createdAt: token.createdAt || now,
      updatedAt: now,
      source: token.source || 'unknown',
    };
    tokenHash.set(token.mint, full);

    // Auto-index into sorted sets
    addToSortedSets(full, now);

    emit(full, 'create');
  }
}

/**
 * Get a single token (HGETALL token:<mint>).
 */
export function hgetToken(mint: string): TrenchToken | null {
  return tokenHash.get(mint) ?? null;
}

/**
 * Get all tokens.
 */
export function getAllTokens(): TrenchToken[] {
  return [...tokenHash.values()];
}

// ── ZADD sorted sets ─────────────────────────────────────────

function getOrCreateZSet(key: string): Map<string, number> {
  if (!sortedSets.has(key)) sortedSets.set(key, new Map());
  return sortedSets.get(key)!;
}

function addToSortedSets(token: TrenchToken, score: number): void {
  const { chain, launchpad, mint } = token;

  // trenches:<chain>:<launchpad>:new
  getOrCreateZSet(`trenches:${chain}:${launchpad}:new`).set(mint, score);
  // trenches:<chain>:<launchpad>:trending
  getOrCreateZSet(`trenches:${chain}:${launchpad}:trending`).set(mint, score);
  // trenches:<chain>:<launchpad>
  getOrCreateZSet(`trenches:${chain}:${launchpad}`).set(mint, score);
  // trenches:<launchpad>
  getOrCreateZSet(`trenches:${launchpad}`).set(mint, score);
  // tokens:<chain>
  getOrCreateZSet(`tokens:${chain}`).set(mint, score);
  // tokens:all
  getOrCreateZSet('tokens:all').set(mint, score);
}

/**
 * ZADD — add token to a sorted set.
 */
export function zadd(key: string, score: number, member: string): void {
  getOrCreateZSet(key).set(member, score);
}

/**
 * ZRANGE — get members from sorted set (by score, descending = newest/trending first).
 */
export function zrange(key: string, start: number, stop: number): string[] {
  const zset = sortedSets.get(key);
  if (!zset) return [];
  const entries = [...zset.entries()].sort((a, b) => b[1] - a[1]); // Descending
  return entries.slice(start, stop === -1 ? undefined : stop + 1).map(e => e[0]);
}

/**
 * ZCARD — get size of sorted set.
 */
export function zcard(key: string): number {
  return sortedSets.get(key)?.size ?? 0;
}

// ── High-Level Query API ─────────────────────────────────────

export interface QueryOptions {
  chain?: string;
  launchpad?: string;
  filter?: 'trending' | 'new' | 'bonding' | 'migrated' | 'gainers' | 'losers' | 'volume';
  limit?: number;
  offset?: number;
}

/**
 * Query tokens from the store (mirrors /api/tokens/cached).
 * Returns sorted, filtered token list.
 */
export function queryTokens(options: QueryOptions = {}): TrenchToken[] {
  const { chain = 'sol', launchpad, filter = 'trending', limit = 50, offset = 0 } = options;

  // Determine which sorted set to read from
  let key: string;
  if (launchpad) {
    key = filter === 'new' ? `trenches:${chain}:${launchpad}:new` : `trenches:${chain}:${launchpad}:trending`;
  } else {
    key = `tokens:${chain}`;
  }

  // Get members from sorted set
  const members = zrange(key, 0, -1);
  let tokens = members.map(m => tokenHash.get(m)).filter((t): t is TrenchToken => !!t);

  // Apply filter
  switch (filter) {
    case 'bonding':
      tokens = tokens.filter(t => parseFloat(t.bondingCurveProgress) < 100);
      break;
    case 'migrated':
      tokens = tokens.filter(t => parseFloat(t.bondingCurveProgress) >= 100);
      break;
    case 'gainers':
      tokens = tokens.filter(t => parseFloat(t.priceChange24h) > 0);
      break;
    case 'losers':
      tokens = tokens.filter(t => parseFloat(t.priceChange24h) < 0);
      break;
    case 'volume':
      tokens.sort((a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h));
      break;
    case 'trending':
    default:
      // Already sorted by score (timestamp) — trending = newest with activity
      tokens.sort((a, b) => {
        const volA = parseFloat(a.volume24h) + parseFloat(a.virtualMcap);
        const volB = parseFloat(b.volume24h) + parseFloat(b.virtualMcap);
        return volB - volA;
      });
      break;
  }

  return tokens.slice(offset, offset + limit);
}

/**
 * Get store stats for diagnostics.
 */
export function getTrenchStats(): { totalTokens: number; totalZSets: number; byChain: Record<string, number> } {
  const byChain: Record<string, number> = {};
  for (const t of tokenHash.values()) {
    byChain[t.chain] = (byChain[t.chain] || 0) + 1;
  }
  return {
    totalTokens: tokenHash.size,
    totalZSets: sortedSets.size,
    byChain,
  };
}

/**
 * Bulk ingest tokens (from bootstrapper or backend API).
 */
export function bulkIngest(tokens: Partial<TrenchToken> & { mint: string }[]): void {
  for (const t of tokens) hsetToken(t);
}