/**
 * Market Token Persistence — PostgreSQL-backed token storage.
 * 
 * Replaces the ephemeral trenches-store for durable token data.
 * On server boot, tokens are loaded from PostgreSQL into the in-memory
 * store so the terminal is populated immediately — no API fetch needed.
 * 
 * All discovered tokens are upserted with ON CONFLICT (mint) so duplicates
 * are safe and the latest data wins.
 */

import { query, isDbConfigured } from './pool.js';

export interface MarketTokenRow {
  mint: string;
  chain: string;
  launchpad: string;
  name: string;
  symbol: string;
  image: string;
  spot_price: string;
  virtual_mcap: string;
  price_change_24h: string;
  bonding_curve_progress: string;
  holders: number;
  volume_24h: string;
  liquidity: string;
  buys_24h: number;
  sells_24h: number;
  uri: string;
  twitter: string;
  telegram: string;
  website: string;
  dex_id: string;
  pair_address: string;
  tx_hash: string;
  discovered_at: string;
  updated_at: string;
  source: string;
}

/**
 * Upsert a token into PostgreSQL. Safe to call repeatedly — duplicates merge.
 */
export interface MarketTokenRecord {
  mint: string;
  chain?: string;
  launchpad?: string;
  name?: string;
  symbol?: string;
  image?: string;
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
}

export async function upsertMarketToken(token: MarketTokenRecord): Promise<boolean> {
  if (!isDbConfigured()) return false;

  try {
    await query(`
      INSERT INTO market_tokens (
        mint, chain, launchpad, name, symbol, image,
        spot_price, virtual_mcap, price_change_24h, bonding_curve_progress,
        holders, volume_24h, liquidity, buys_24h, sells_24h,
        uri, twitter, telegram, website, dex_id, pair_address, tx_hash, source
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23
      )
      ON CONFLICT (mint) DO UPDATE SET
        chain = COALESCE(NULLIF(EXCLUDED.chain, 'sol'), market_tokens.chain),
        launchpad = COALESCE(NULLIF(EXCLUDED.launchpad, 'pumpfun'), market_tokens.launchpad),
        name = CASE WHEN EXCLUDED.name != 'Unknown' THEN EXCLUDED.name ELSE market_tokens.name END,
        symbol = CASE WHEN EXCLUDED.symbol != '???' THEN EXCLUDED.symbol ELSE market_tokens.symbol END,
        image = CASE WHEN EXCLUDED.image != '' THEN EXCLUDED.image ELSE market_tokens.image END,
        spot_price = CASE WHEN EXCLUDED.spot_price > 0 THEN EXCLUDED.spot_price ELSE market_tokens.spot_price END,
        virtual_mcap = CASE WHEN EXCLUDED.virtual_mcap > 0 THEN EXCLUDED.virtual_mcap ELSE market_tokens.virtual_mcap END,
        price_change_24h = EXCLUDED.price_change_24h,
        bonding_curve_progress = EXCLUDED.bonding_curve_progress,
        volume_24h = CASE WHEN EXCLUDED.volume_24h > 0 THEN EXCLUDED.volume_24h ELSE market_tokens.volume_24h END,
        liquidity = CASE WHEN EXCLUDED.liquidity > 0 THEN EXCLUDED.liquidity ELSE market_tokens.liquidity END,
        buys_24h = EXCLUDED.buys_24h,
        sells_24h = EXCLUDED.sells_24h,
        uri = CASE WHEN EXCLUDED.uri != '' THEN EXCLUDED.uri ELSE market_tokens.uri END,
        twitter = CASE WHEN EXCLUDED.twitter != '' THEN EXCLUDED.twitter ELSE market_tokens.twitter END,
        telegram = CASE WHEN EXCLUDED.telegram != '' THEN EXCLUDED.telegram ELSE market_tokens.telegram END,
        website = CASE WHEN EXCLUDED.website != '' THEN EXCLUDED.website ELSE market_tokens.website END,
        tx_hash = CASE WHEN EXCLUDED.tx_hash != '' THEN EXCLUDED.tx_hash ELSE market_tokens.tx_hash END,
        source = EXCLUDED.source
    `, [
      token.mint,
      token.chain || 'sol',
      token.launchpad || 'pumpfun',
      token.name || 'Unknown',
      token.symbol || '???',
      token.image || '',
      parseFloat(token.spotPrice || '0') || 0,
      parseFloat(token.virtualMcap || '0') || 0,
      parseFloat(token.priceChange24h || '0') || 0,
      parseFloat(token.bondingCurveProgress || '0') || 0,
      parseInt(token.holders || '0') || 0,
      parseFloat(token.volume24h || '0') || 0,
      parseFloat(token.liquidity || '0') || 0,
      parseInt(token.buys24h || '0') || 0,
      parseInt(token.sells24h || '0') || 0,
      token.uri || '',
      token.twitter || '',
      token.telegram || '',
      token.website || '',
      token.dexId || '',
      token.pairAddress || '',
      token.txHash || '',
      token.source || 'unknown',
    ]);
    return true;
  } catch (err: any) {
    // Silent fail — DB persistence is best-effort
    console.error(`[MarketDB] upsert failed for ${token.mint}: ${err.message}`);
    return false;
  }
}

/**
 * Bulk upsert tokens (batched, efficient for bootstrap).
 */
export async function upsertMarketTokensBatch(tokens: Parameters<typeof upsertMarketToken>[0][]): Promise<number> {
  if (!isDbConfigured() || tokens.length === 0) return 0;
  let count = 0;
  // Batch in groups of 50 to avoid overwhelming the connection pool
  for (let i = 0; i < tokens.length; i += 50) {
    const batch = tokens.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map(t => upsertMarketToken(t)));
    count += results.filter(r => r.status === 'fulfilled' && r.value).length;
  }
  return count;
}

/**
 * Load all tokens from PostgreSQL, optionally filtered by chain/launchpad.
 * Used on server boot to seed the in-memory store instantly.
 */
export async function loadMarketTokens(opts?: {
  chain?: string;
  launchpad?: string;
  limit?: number;
  orderBy?: string;
}): Promise<MarketTokenRow[]> {
  if (!isDbConfigured()) return [];

  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts?.chain) {
      conditions.push(`chain = $${idx++}`);
      params.push(opts.chain);
    }
    if (opts?.launchpad) {
      conditions.push(`launchpad = $${idx++}`);
      params.push(opts.launchpad);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit || 500;
    const orderBy = opts?.orderBy || 'discovered_at DESC';

    const result = await query(
      `SELECT * FROM market_tokens ${where} ORDER BY ${orderBy} LIMIT ${idx}`,
      [...params, limit]
    );
    return result.rows as MarketTokenRow[];
  } catch (err: any) {
    console.error(`[MarketDB] loadMarketTokens failed: ${err.message}`);
    return [];
  }
}

/**
 * Get token count by chain (for diagnostics).
 */
export async function getTokenCounts(): Promise<Record<string, number>> {
  if (!isDbConfigured()) return {};

  try {
    const result = await query(
      `SELECT chain, COUNT(*)::text as count FROM market_tokens GROUP BY chain ORDER BY count DESC`
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
 * Check if the market_tokens table exists.
 */
export async function ensureMarketTokensTable(): Promise<boolean> {
  if (!isDbConfigured()) return false;

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS market_tokens (
        mint            TEXT PRIMARY KEY,
        chain           TEXT NOT NULL DEFAULT 'sol',
        launchpad       TEXT NOT NULL DEFAULT 'pumpfun',
        name            TEXT NOT NULL DEFAULT 'Unknown',
        symbol          TEXT NOT NULL DEFAULT '???',
        image           TEXT DEFAULT '',
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
        discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source          TEXT DEFAULT 'unknown'
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_market_tokens_chain_lp ON market_tokens(chain, launchpad)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_market_tokens_discovered ON market_tokens(discovered_at DESC)`);
    return true;
  } catch (err: any) {
    console.error(`[MarketDB] ensureMarketTokensTable failed: ${err.message}`);
    return false;
  }
}