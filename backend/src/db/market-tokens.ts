/**
 * Market Tokens — Durable PostgreSQL storage for discovered tokens.
 * 
 * The trenches-store is in-memory only. This module provides write-through
 * persistence so token data survives server restarts.
 * 
 * On boot: load all tokens from PostgreSQL → seed trenches-store → terminal shows data
 * During runtime: every new token is written to both trenches-store AND PostgreSQL
 */

import { query, isDbConfigured } from './pool.js';

export interface MarketTokenRecord {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  chain?: string;
  launchpad?: string;
  spotPrice?: string;
  virtualMcap?: string;
  priceChange24h?: string;
  bondingCurveProgress?: string;
  holders?: string;
  volume24h?: string;
  liquidity?: string;
  buys24h?: string;
  sells24h?: string;
  uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  dexId?: string;
  pairAddress?: string;
  txHash?: string;
  source?: string;
  createdAt?: string;
}

function log(level: 'info' | 'warn' | 'error', msg: string) {
  console[level](`[MarketTokens] ${msg}`);
}

/**
 * Upsert a token record. Updates existing records (preserving first_seen_at).
 */
export async function upsertMarketToken(token: MarketTokenRecord): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    await query(`
      INSERT INTO market_tokens (
        mint, name, symbol, image, chain, launchpad,
        spot_price, virtual_mcap, price_change_24h, bonding_curve_progress,
        holders, volume_24h, liquidity, buys_24h, sells_24h,
        uri, twitter, telegram, website, dex_id, pair_address, tx_hash,
        source, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22,
        $23, NOW(), NOW()
      )
      ON CONFLICT (mint) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, 'Unknown'), market_tokens.name),
        symbol = COALESCE(NULLIF(EXCLUDED.symbol, '???'), market_tokens.symbol),
        image = COALESCE(NULLIF(EXCLUDED.image, ''), market_tokens.image),
        spot_price = CASE WHEN EXCLUDED.spot_price > 0 THEN EXCLUDED.spot_price ELSE market_tokens.spot_price END,
        virtual_mcap = CASE WHEN EXCLUDED.virtual_mcap > 0 THEN EXCLUDED.virtual_mcap ELSE market_tokens.virtual_mcap END,
        price_change_24h = EXCLUDED.price_change_24h,
        bonding_curve_progress = EXCLUDED.bonding_curve_progress,
        holders = CASE WHEN EXCLUDED.holders > 0 THEN EXCLUDED.holders ELSE market_tokens.holders END,
        volume_24h = CASE WHEN EXCLUDED.volume_24h > 0 THEN EXCLUDED.volume_24h ELSE market_tokens.volume_24h END,
        liquidity = CASE WHEN EXCLUDED.liquidity > 0 THEN EXCLUDED.liquidity ELSE market_tokens.liquidity END,
        buys_24h = EXCLUDED.buys_24h,
        sells_24h = EXCLUDED.sells_24h,
        uri = COALESCE(NULLIF(EXCLUDED.uri, ''), market_tokens.uri),
        twitter = COALESCE(NULLIF(EXCLUDED.twitter, ''), market_tokens.twitter),
        telegram = COALESCE(NULLIF(EXCLUDED.telegram, ''), market_tokens.telegram),
        website = COALESCE(NULLIF(EXCLUDED.website, ''), market_tokens.website),
        dex_id = COALESCE(NULLIF(EXCLUDED.dex_id, ''), market_tokens.dex_id),
        pair_address = COALESCE(NULLIF(EXCLUDED.pair_address, ''), market_tokens.pair_address),
        tx_hash = COALESCE(NULLIF(EXCLUDED.tx_hash, ''), market_tokens.tx_hash),
        updated_at = NOW()
    `, [
      token.mint, token.name, token.symbol, token.image, token.chain, token.launchpad,
      parseFloat(token.spotPrice) || 0, parseFloat(token.virtualMcap) || 0,
      parseFloat(token.priceChange24h) || 0, parseFloat(token.bondingCurveProgress) || 0,
      parseInt(token.holders) || 0, parseFloat(token.volume24h) || 0,
      parseFloat(token.liquidity) || 0, parseInt(token.buys24h) || 0, parseInt(token.sells24h) || 0,
      token.uri, token.twitter, token.telegram, token.website,
      token.dexId, token.pairAddress, token.txHash,
      token.source,
    ]);
    return true;
  } catch (err: any) {
    log('warn', `Upsert failed for ${token.mint}: ${err.message}`);
    return false;
  }
}

/**
 * Batch upsert multiple tokens in a single transaction.
 */
export async function upsertMarketTokensBatch(tokens: MarketTokenRecord[]): Promise<number> {
  if (!isDbConfigured() || tokens.length === 0) return 0;
  let count = 0;
  // Process in batches of 50 to avoid overwhelming the connection
  for (let i = 0; i < tokens.length; i += 50) {
    const batch = tokens.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map(t => upsertMarketToken(t)));
    count += results.filter(r => r.status === 'fulfilled' && r.value).length;
  }
  return count;
}

/**
 * Load all tokens from PostgreSQL, ordered by most recently updated.
 * Used on boot to seed the in-memory trenches-store.
 */
export async function loadAllTokens(limit = 500): Promise<MarketTokenRecord[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await query(`
      SELECT * FROM market_tokens
      ORDER BY updated_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      image: row.image || '',
      chain: row.chain,
      launchpad: row.launchpad,
      spotPrice: String(row.spot_price || 0),
      virtualMcap: String(row.virtual_mcap || 0),
      priceChange24h: String(row.price_change_24h || 0),
      bondingCurveProgress: String(row.bonding_curve_progress || 0),
      holders: String(row.holders || 0),
      volume24h: String(row.volume_24h || 0),
      liquidity: String(row.liquidity || 0),
      buys24h: String(row.buys_24h || 0),
      sells24h: String(row.sells_24h || 0),
      uri: row.uri || '',
      twitter: row.twitter || '',
      telegram: row.telegram || '',
      website: row.website || '',
      dexId: row.dex_id || '',
      pairAddress: row.pair_address || '',
      txHash: row.tx_hash || '',
      source: row.source || 'db',
      createdAt: row.created_at ? String(new Date(row.created_at).getTime()) : String(Date.now()),
    }));
  } catch (err: any) {
    log('warn', `Load failed: ${err.message}`);
    return [];
  }
}

/**
 * Get token count for diagnostics.
 */
export async function getTokenCount(): Promise<number> {
  if (!isDbConfigured()) return 0;
  try {
    const result = await query('SELECT COUNT(*) as count FROM market_tokens');
    return parseInt(result.rows[0]?.count) || 0;
  } catch {
    return 0;
  }
}

/**
 * Get token counts grouped by chain (for persistence diagnostics).
 */
export async function getTokensByChain(): Promise<Record<string, number>> {
  if (!isDbConfigured()) return {};
  try {
    const result = await query(
      'SELECT chain, COUNT(*)::text as count FROM market_tokens GROUP BY chain ORDER BY count DESC'
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows as any[]) {
      counts[row.chain] = parseInt(row.count);
    }
    return counts;
  } catch {
    return {};
  }
}

/**
 * Paginated token query — fetches directly from PostgreSQL.
 * Supports chain/launchpad filtering and sort by updated_at, volume, mcap.
 * Does NOT load all 81K into memory — uses OFFSET/LIMIT.
 */
export interface PaginatedQueryOpts {
  chain?: string;
  launchpad?: string;
  sortBy?: 'updated_at' | 'volume_24h' | 'virtual_mcap' | 'price_change_24h';
  sortDir?: 'DESC' | 'ASC';
  offset?: number;
  limit?: number;
}

export interface PaginatedResult {
  tokens: MarketTokenRecord[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  error?: string;
}

export async function queryTokensPaginated(opts: PaginatedQueryOpts = {}): Promise<PaginatedResult> {
  if (!isDbConfigured()) return { tokens: [], total: 0, offset: 0, limit: 50, hasMore: false };

  const { chain, launchpad, sortBy = 'updated_at', sortDir = 'DESC', offset = 0, limit = 50 } = opts;
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);

  // Whitelist sort columns to prevent SQL injection
  const allowedSorts = new Set(['updated_at', 'volume_24h', 'virtual_mcap', 'price_change_24h', 'created_at']);
  const safeSortBy = allowedSorts.has(sortBy) ? sortBy : 'updated_at';

  try {
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (chain) {
      conditions.push(`chain = $${paramIdx++}`);
      params.push(chain);
    }
    if (launchpad) {
      conditions.push(`launchpad = $${paramIdx++}`);
      params.push(launchpad);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching rows
    const countSql = `SELECT COUNT(*) as count FROM market_tokens ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0]?.count) || 0;

    // Fetch page
    const dataSql = `SELECT * FROM market_tokens ${whereClause} ORDER BY ${safeSortBy} ${sortDir} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    const dataResult = await query(dataSql, [...params, safeLimit, safeOffset]);

    const tokens: MarketTokenRecord[] = dataResult.rows.map((row: any) => ({
      mint: row.mint,
      name: row.name,
      symbol: row.symbol,
      image: row.image || '',
      chain: row.chain,
      launchpad: row.launchpad,
      spotPrice: String(row.spot_price || 0),
      virtualMcap: String(row.virtual_mcap || 0),
      priceChange24h: String(row.price_change_24h || 0),
      bondingCurveProgress: String(row.bonding_curve_progress || 0),
      holders: String(row.holders || 0),
      volume24h: String(row.volume_24h || 0),
      liquidity: String(row.liquidity || 0),
      buys24h: String(row.buys_24h || 0),
      sells24h: String(row.sells_24h || 0),
      uri: row.uri || '',
      twitter: row.twitter || '',
      telegram: row.telegram || '',
      website: row.website || '',
      dexId: row.dex_id || '',
      pairAddress: row.pair_address || '',
      txHash: row.tx_hash || '',
      source: row.source || 'db',
      createdAt: row.created_at ? String(new Date(row.created_at).getTime()) : String(Date.now()),
    }));

    return { tokens, total, offset: safeOffset, limit: safeLimit, hasMore: safeOffset + safeLimit < total };
  } catch (err: any) {
    log('error', `Paginated query failed: ${err.message} (SQL params: chain=${chain || 'any'}, launchpad=${launchpad || 'any'}, sortBy=${safeSortBy})`);
    return { tokens: [], total: 0, offset: 0, limit: safeLimit, hasMore: false, error: err.message };
  }
}

/**
 * Ensure the market_tokens table exists (idempotent migration).
 */
export async function ensureMarketTokensTable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS market_tokens (
        mint            TEXT PRIMARY KEY,
        name            TEXT NOT NULL DEFAULT 'Unknown',
        symbol          TEXT NOT NULL DEFAULT '???',
        image           TEXT DEFAULT '',
        chain           TEXT NOT NULL DEFAULT 'sol',
        launchpad       TEXT NOT NULL DEFAULT 'pumpfun',
        spot_price      NUMERIC DEFAULT 0,
        virtual_mcap    NUMERIC DEFAULT 0,
        price_change_24h NUMERIC DEFAULT 0,
        bonding_curve_progress NUMERIC DEFAULT 0,
        holders         INTEGER DEFAULT 0,
        volume_24h      NUMERIC DEFAULT 0,
        liquidity       NUMERIC DEFAULT 0,
        buys_24h        INTEGER DEFAULT 0,
        sells_24h       INTEGER DEFAULT 0,
        uri             TEXT DEFAULT '',
        twitter         TEXT DEFAULT '',
        telegram        TEXT DEFAULT '',
        website         TEXT DEFAULT '',
        dex_id          TEXT DEFAULT '',
        pair_address    TEXT DEFAULT '',
        tx_hash         TEXT DEFAULT '',
        source          TEXT DEFAULT 'bootstrap',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Ensure indexes
    await query('CREATE INDEX IF NOT EXISTS idx_market_tokens_chain ON market_tokens(chain)');
    await query('CREATE INDEX IF NOT EXISTS idx_market_tokens_launchpad ON market_tokens(launchpad)');
    await query('CREATE INDEX IF NOT EXISTS idx_market_tokens_chain_lp ON market_tokens(chain, launchpad)');
    await query('CREATE INDEX IF NOT EXISTS idx_market_tokens_updated ON market_tokens(updated_at DESC)');
    log('info', 'market_tokens table ready');
    return true;
  } catch (err: any) {
    log('warn', `Table creation failed: ${err.message}`);
    return false;
  }
}