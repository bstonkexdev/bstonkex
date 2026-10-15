/**
 * BSTONKEX — Bootstrap Market Seeder
 * 
 * Fetches existing market data from DexScreener on server boot so the
 * terminal is populated immediately. Runs non-blocking on startup and
 * refreshes every 5 minutes.
 * 
 * Data sources (all free, no API key required):
 * - /token-profiles/latest/v1  → recently active tokens across all chains
 * - /token-boosts/latest/v1    → trending/boosted tokens
 * - /latest/dex/tokens/{addr}  → full pair data (price, volume, liquidity)
 * 
 * Coverage: Solana, BSC, Base, PulseChain, Ink, Tron, and any chain
 * tracked by DexScreener. Bonding-curve tokens without DEX pairs are
 * NOT covered by DexScreener — those come from live WS/PumpPortal only.
 * 
 * Limitations:
 * - DexScreener data is ~1-2 minutes delayed vs on-chain
 * - Historical OHLCV/volume not available from free API
 * - GeckoTerminal can fill Solana-specific gaps (rate-limited)
 */

import { hsetAll, zadd, hgetall } from './trenches-store.js';
import { upsertMarketToken, upsertMarketTokensBatch, loadAllTokens, ensureMarketTokensTable } from './db/market-tokens.js';
import { isDbConfigured } from './db/pool.js';
import * as fs from 'fs';
import * as path from 'path';

const DEXSCREENER_API = 'https://api.dexscreener.com';
const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'market-snapshot.json');
const SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Chain mapping: DexScreener chainId → our internal key
const CHAIN_MAP: Record<string, string> = {
  solana: 'sol',
  bsc: 'bsc',
  base: 'base',
  pulsechain: 'rh',
  ink: 'ink',
  tron: 'tron',
  archway: 'arc',
  stable: 'stable',
};

// DEX → launchpad attribution
const DEX_LAUNCHPAD_MAP: Record<string, string> = {
  'pumpfun': 'pumpfun',
  'pump-swap': 'pumpfun',
  'pumpswap': 'pumpfun',
  'raydium': 'pumpfun', // most Raydium tokens migrated from pumpfun
  'raydium-v4': 'pumpfun',
  'raydium-cp': 'pumpfun',
  'raydium-clmm': 'pumpfun',
  'meteora': 'pumpfun',
  'meteora-dlmm': 'pumpfun',
  'orca': 'pumpfun',
  'whirlpool': 'pumpfun',
  'jupiter': 'pumpfun',
  'pancakeswap': 'fourmeme',
  'pancakeswap-v3': 'fourmeme',
  'four-meme': 'fourmeme',
  'four.meme': 'fourmeme',
  'flap': 'flap',
  'flap.sh': 'flap',
  'stonkfun': 'stonkfun',
  'uniswap': 'openlaunch',
  'uniswap-v3': 'openlaunch',
  'aerodrome': 'openlaunch',
  'aerodrome-slipstream': 'openlaunch',
  'base-swap': 'openlaunch',
  'sushiswap': 'openlaunch',
};

// GeckoTerminal DEX → launchpad
const GECKO_LP_MAP: Record<string, string> = {
  'pump-fun': 'pumpfun',
  'pump-swap': 'pumpfun',
  'raydium': 'pumpfun',
  'raydium-v4': 'pumpfun',
  'raydium-cp': 'pumpfun',
  'raydium-clmm': 'pumpfun',
  'meteora': 'pumpfun',
  'meteora-dlmm': 'pumpfun',
  'orca': 'pumpfun',
  'whirlpool': 'pumpfun',
};

interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  volume?: { h24?: number; h1?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  txns?: { h24?: { buys: number; sells: number } };
  priceChange?: { h24?: number };
  info?: { imageUrl?: string };
}

// Dedup across refreshes
const seededMints = new Set<string>();
let isSeeding = false;
let lastSeedAt = 0;
let seedCount = 0;
let bootstrapReady = false;
let bootstrapReadyCallbacks: Array<() => void> = [];

/** Check if the initial bootstrap has completed at least once. */
export function isBootstrapReady(): boolean {
  return bootstrapReady;
}

/** Wait for bootstrap to complete (resolves immediately if already done). */
export function waitForBootstrap(): Promise<void> {
  if (bootstrapReady) return Promise.resolve();
  return new Promise(resolve => bootstrapReadyCallbacks.push(resolve));
}

function log(level: 'info' | 'warn' | 'error', msg: string) {
  console[level](`[BootstrapSeed] ${msg}`);
}

// ── PostgreSQL Preload (runs async on import) ──────────────────
// Loads tokens from PostgreSQL into the in-memory store.
// This is the primary persistence layer — survives restarts/deploys.
(async () => {
  if (!isDbConfigured()) {
    log('warn', 'PostgreSQL not configured — using JSON snapshot fallback only');
    return;
  }
  try {
    await ensureMarketTokensTable();
    const dbTokens = await loadAllTokens(2000);
    let pgCount = 0;
    for (const t of dbTokens) {
      if (!t.mint || seededMints.has(t.mint)) continue;
      hsetAll(`token:${t.mint}`, {
        mint: t.mint, chain: t.chain, launchpad: t.launchpad,
        name: t.name, symbol: t.symbol, image: t.image || '',
        spotPrice: t.spotPrice, virtualMcap: t.virtualMcap,
        priceChange24h: t.priceChange24h,
        bondingCurveProgress: t.bondingCurveProgress,
        holders: t.holders, volume24h: t.volume24h,
        liquidity: t.liquidity, buys24h: t.buys24h,
        sells24h: t.sells24h,
        createdAt: t.createdAt,
        uri: t.uri, twitter: t.twitter, telegram: t.telegram,
        website: t.website, dexId: t.dexId, pairAddress: t.pairAddress,
      });
      const ts = parseInt(t.createdAt) || Date.now();
      zadd(`trenches:${t.chain}:${t.launchpad}:trending`, ts, t.mint);
      zadd(`trenches:${t.chain}:${t.launchpad}:new`, ts, t.mint);
      zadd(`trenches:${t.chain}:${t.launchpad}`, ts, t.mint);
      zadd(`trenches:${t.launchpad}`, ts, t.mint);
      zadd(`tokens:${t.chain}`, ts, t.mint);
      seededMints.add(t.mint);
      seedCount++;
      pgCount++;
    }
    if (pgCount > 0) {
      bootstrapReady = true;
      log('info', `POSTGRESQL PRELOAD: ${pgCount} tokens loaded from database`);
    }
  } catch (err: any) {
    log('warn', `PostgreSQL preload skipped: ${err.message}`);
  }
})();

// ── Synchronous Preload (runs at import time, before API serves) ──
// Loads JSON snapshot into trenches-store INSTANTLY — no async needed.
// PostgreSQL load happens async in runSeedCycle but JSON provides <1ms startup.
try {
  if (fs.existsSync(SNAPSHOT_PATH)) {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    if (raw?.tokens && Array.isArray(raw.tokens) && (Date.now() - (raw.savedAt || 0)) < SNAPSHOT_TTL_MS) {
      const preloadCount = seedTokensToStore(raw.tokens);
      if (preloadCount > 0) {
        bootstrapReady = true;
        log('info', `SYNCHRONOUS PRELOAD: ${preloadCount} tokens from JSON snapshot`);
      }
    }
  }
} catch { /* preload is best-effort */ }

async function fetchJson(url: string, timeoutMs = 10_000): Promise<any | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function attributeLaunchpad(dexId: string): string {
  return DEX_LAUNCHPAD_MAP[dexId?.toLowerCase()] || 'openlaunch';
}

function mapChain(dexChainId: string): string {
  return CHAIN_MAP[dexChainId?.toLowerCase()] || dexChainId?.toLowerCase() || 'sol';
}

function ingestPair(pair: DexPair): void {
  const address = pair.baseToken?.address;
  if (!address || seededMints.has(address)) return;

  const chain = mapChain(pair.chainId);
  const launchpad = attributeLaunchpad(pair.dexId);
  const price = parseFloat(pair.priceUsd || '0');
  const volume24h = pair.volume?.h24 || 0;
  const liquidity = pair.liquidity?.usd || 0;
  const change24h = pair.priceChange?.h24 || 0;
  const marketCap = pair.marketCap || pair.fdv || 0;
  const txns = pair.txns?.h24 || { buys: 0, sells: 0 };
  const imageUrl = pair.info?.imageUrl || '';

  // Write token hash
  hsetAll(`token:${address}`, {
    mint: address,
    symbol: pair.baseToken?.symbol || '???',
    name: pair.baseToken?.name || 'Unknown',
    chain,
    launchpad,
    image: imageUrl,
    spotPrice: String(price),
    virtualMcap: String(marketCap),
    priceChange24h: String(change24h),
    bondingCurveProgress: liquidity > 0 ? '100' : '0', // DEX-listed = graduated
    holders: '0', // Not available from DexScreener
    createdAt: String(pair.pairCreatedAt || Date.now()),
    volume24h: String(volume24h),
    liquidity: String(liquidity),
    buys24h: String(txns.buys || 0),
    sells24h: String(txns.sells || 0),
    dexId: pair.dexId || '',
    pairAddress: pair.pairAddress || '',
    uri: '',
    twitter: '', telegram: '', website: '',
  });

  // Index into sorted sets
  const now = pair.pairCreatedAt || Date.now();
  zadd(`trenches:${chain}:${launchpad}:trending`, now, address);
  zadd(`trenches:${chain}:${launchpad}:new`, now, address);
  zadd(`trenches:${chain}:${launchpad}`, now, address);
  zadd(`trenches:${launchpad}`, now, address);
  zadd(`tokens:${chain}`, now, address);

  seededMints.add(address);
  seedCount++;

  // Persist to PostgreSQL (non-blocking, best-effort)
  upsertMarketToken({
    mint: address, chain, launchpad,
    name: pair.baseToken?.name, symbol: pair.baseToken?.symbol,
    image: imageUrl,
    spotPrice: String(price), virtualMcap: String(marketCap),
    priceChange24h: String(change24h),
    bondingCurveProgress: liquidity > 0 ? '100' : '0',
    volume24h: String(volume24h), liquidity: String(liquidity),
    buys24h: String(txns.buys || 0), sells24h: String(txns.sells || 0),
    dexId: pair.dexId, pairAddress: pair.pairAddress,
    source: 'dexscreener',
  }).catch(() => {});
}

/**
 * Fetch and ingest trending/boosted tokens from DexScreener.
 * These are the most actively traded tokens across all chains.
 */
async function seedFromDexScreener(): Promise<number> {
  let count = 0;

  // 1. Token profiles (recently active)
  const profiles = await fetchJson(`${DEXSCREENER_API}/token-profiles/latest/v1`);
  if (Array.isArray(profiles)) {
    // Batch fetch pair data for up to 30 tokens (DexScreener allows comma-separated)
    const addresses = profiles
      .map((p: any) => p.tokenAddress)
      .filter((a: string) => a && !seededMints.has(a))
      .slice(0, 30);

    if (addresses.length > 0) {
      // DexScreener allows up to 30 addresses comma-separated
      const batchUrl = `${DEXSCREENER_API}/latest/dex/tokens/${addresses.join(',')}`;
      const batchData = await fetchJson(batchUrl);
      if (batchData?.pairs) {
        for (const pair of batchData.pairs) {
          // Only ingest the most liquid pair per token
          const existing = hgetall(`token:${pair.baseToken?.address}`);
          if (!existing || !existing.spotPrice || parseFloat(existing.spotPrice) === 0) {
            ingestPair(pair);
            count++;
          }
        }
      }
    }
  }

  // 2. Token boosts (trending/promoted)
  const boosts = await fetchJson(`${DEXSCREENER_API}/token-boosts/latest/v1`);
  if (Array.isArray(boosts)) {
    const addresses = boosts
      .map((b: any) => b.tokenAddress)
      .filter((a: string) => a && !seededMints.has(a))
      .slice(0, 30);

    if (addresses.length > 0) {
      const batchUrl = `${DEXSCREENER_API}/latest/dex/tokens/${addresses.join(',')}`;
      const batchData = await fetchJson(batchUrl);
      if (batchData?.pairs) {
        for (const pair of batchData.pairs) {
          ingestPair(pair);
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Fetch new pools from GeckoTerminal for Solana (comprehensive coverage).
 * Covers Pump.fun, Raydium, Meteora, Orca, and all other Solana DEXes.
 */
async function seedFromGeckoTerminal(): Promise<number> {
  let count = 0;

  for (const network of ['solana', 'bsc', 'base']) {
    const data = await fetchJson(`${GECKOTERMINAL_API}/networks/${network}/new_pools?page=1`);
    if (!data?.data) continue;

    for (const pool of data.data) {
      try {
        const attrs = pool.attributes || {};
        const baseTokenId = pool.relationships?.base_token?.data?.id || '';
        const dexId = pool.relationships?.dex?.data?.id || '';
        const address = baseTokenId.split('_').slice(1).join('_');
        if (!address || seededMints.has(address)) continue;

        const chain = mapChain(network);
        const launchpad = GECKO_LP_MAP[dexId] || attributeLaunchpad(dexId);
        const price = parseFloat(attrs.base_token_price_usd || '0');
        const volume24h = parseFloat(attrs.volume_usd?.h24 || '0');
        const liquidity = parseFloat(attrs.reserve_in_usd || '0');
        const marketCap = parseFloat(attrs.fdv_usd || attrs.market_cap_usd || '0');
        const nameParts = (attrs.name || '').split(' / ');
        const name = nameParts[0] || 'Unknown';
        const symbol = nameParts[1] || nameParts[0]?.slice(0, 6) || '???';

        hsetAll(`token:${address}`, {
          mint: address,
          symbol,
          name,
          chain,
          launchpad,
          image: '',
          spotPrice: String(price),
          virtualMcap: String(marketCap),
          priceChange24h: '0',
          bondingCurveProgress: liquidity > 100 ? '100' : '0',
          holders: '0',
          createdAt: attrs.pool_created_at ? String(new Date(attrs.pool_created_at).getTime()) : String(Date.now()),
          volume24h: String(volume24h),
          liquidity: String(liquidity),
          buys24h: '0', sells24h: '0',
          dexId,
          pairAddress: attrs.address || '',
          uri: '',
          twitter: '', telegram: '', website: '',
        });

        const now = Date.now();
        zadd(`trenches:${chain}:${launchpad}:trending`, now, address);
        zadd(`trenches:${chain}:${launchpad}:new`, now, address);
        zadd(`trenches:${chain}:${launchpad}`, now, address);
        zadd(`trenches:${launchpad}`, now, address);
        zadd(`tokens:${chain}`, now, address);

        seededMints.add(address);
        seedCount++;
        count++;

        // Persist to PostgreSQL (non-blocking)
        upsertMarketToken({
          mint: address, chain, launchpad,
          name, symbol,
          spotPrice: String(price), virtualMcap: String(marketCap),
          bondingCurveProgress: liquidity > 100 ? '100' : '0',
          volume24h: String(volume24h), liquidity: String(liquidity),
          dexId, pairAddress: attrs.address,
          source: 'geckoterminal',
        }).catch(() => {});
      } catch { /* skip malformed pool */ }
    }
  }

  return count;
}

// ── Snapshot Persistence (crash recovery) ───────────────────────

/**
 * Persist all tokens to PostgreSQL (durable) and local JSON file (fast fallback).
 */
async function persistTokens(): Promise<void> {
  // Collect all token records from trenches-store
  const tokens: any[] = [];
  for (const mint of seededMints) {
    const t = hgetall(`token:${mint}`);
    if (t && t.mint) tokens.push(t);
  }
  if (tokens.length === 0) return;

  // Primary: PostgreSQL (survives Railway restarts)
  if (isDbConfigured()) {
    try {
      const dbTokens = tokens.map(t => ({
        mint: t.mint, name: t.name || 'Unknown', symbol: t.symbol || '???',
        image: t.image || '', chain: t.chain || 'sol', launchpad: t.launchpad || 'pumpfun',
        spotPrice: t.spotPrice || '0', virtualMcap: t.virtualMcap || '0',
        priceChange24h: t.priceChange24h || '0', bondingCurveProgress: t.bondingCurveProgress || '0',
        holders: t.holders || '0', volume24h: t.volume24h || '0', liquidity: t.liquidity || '0',
        buys24h: t.buys24h || '0', sells24h: t.sells24h || '0',
        uri: t.uri || '', twitter: t.twitter || '', telegram: t.telegram || '', website: t.website || '',
        dexId: t.dexId || '', pairAddress: t.pairAddress || '', txHash: t.txHash || '',
        source: 'bootstrap', createdAt: t.createdAt || String(Date.now()),
      }));
      const saved = await upsertMarketTokensBatch(dbTokens);
      log('info', `PostgreSQL: persisted ${saved}/${dbTokens.length} tokens`);
    } catch (err: any) {
      log('warn', `PostgreSQL persist failed: ${err.message}`);
    }
  }

  // Fallback: JSON snapshot file (fast local recovery if PG is down)
  try {
    const dir = path.dirname(SNAPSHOT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify({
      savedAt: Date.now(),
      count: tokens.length,
      tokens,
    }));
    log('info', `JSON snapshot: ${tokens.length} tokens`);
  } catch (err: any) {
    log('warn', `JSON snapshot save failed: ${err.message}`);
  }
}

/**
 * Load previously discovered tokens into trenches-store.
 * Priority: PostgreSQL (durable) → JSON snapshot (fallback).
 */
async function loadPersistedTokens(): Promise<number> {
  let loaded = 0;

  // Priority 1: PostgreSQL (always survives restarts)
  if (isDbConfigured()) {
    try {
      await ensureMarketTokensTable();
      const dbTokens = await loadAllTokens(2000);
      if (dbTokens.length > 0) {
        loaded = seedTokensToStore(dbTokens.map(t => ({
          mint: t.mint, name: t.name, symbol: t.symbol, image: t.image,
          chain: t.chain, launchpad: t.launchpad, spotPrice: t.spotPrice,
          virtualMcap: t.virtualMcap, priceChange24h: t.priceChange24h,
          bondingCurveProgress: t.bondingCurveProgress, holders: t.holders,
          volume24h: t.volume24h, liquidity: t.liquidity,
          buys24h: t.buys24h, sells24h: t.sells24h,
          uri: t.uri, twitter: t.twitter, telegram: t.telegram, website: t.website,
          createdAt: t.createdAt,
        })));
        log('info', `PostgreSQL: loaded ${loaded} tokens`);
        return loaded;
      }
    } catch (err: any) {
      log('warn', `PostgreSQL load failed: ${err.message}`);
    }
  }

  // Priority 2: JSON snapshot file (fast local fallback)
  try {
    if (!fs.existsSync(SNAPSHOT_PATH)) return 0;
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    if (!raw?.tokens || !Array.isArray(raw.tokens)) return 0;
    if (Date.now() - (raw.savedAt || 0) > SNAPSHOT_TTL_MS) {
      log('info', 'JSON snapshot expired, will refetch');
      return 0;
    }
    loaded = seedTokensToStore(raw.tokens);
    log('info', `JSON snapshot: loaded ${loaded} tokens`);
    return loaded;
  } catch (err: any) {
    log('warn', `JSON snapshot load failed: ${err.message}`);
    return 0;
  }
}

/** Seed an array of token records into trenches-store (deduplicates). */
function seedTokensToStore(tokens: any[]): number {
  let loaded = 0;
  for (const t of tokens) {
    if (!t.mint || seededMints.has(t.mint)) continue;
    hsetAll(`token:${t.mint}`, t);
    const chain = t.chain || 'sol';
    const lp = t.launchpad || 'pumpfun';
    const ts = parseInt(t.createdAt) || Date.now();
    zadd(`trenches:${chain}:${lp}:trending`, ts, t.mint);
    zadd(`trenches:${chain}:${lp}:new`, ts, t.mint);
    zadd(`trenches:${chain}:${lp}`, ts, t.mint);
    zadd(`trenches:${lp}`, ts, t.mint);
    zadd(`tokens:${chain}`, ts, t.mint);
    seededMints.add(t.mint);
    seedCount++;
    loaded++;
  }
  return loaded;
}

// ── PumpPortal REST API (recent Solana bonding-curve tokens) ───

async function seedFromPumpPortal(): Promise<number> {
  let count = 0;
  try {
    // PumpPortal has no public REST list endpoint, but we can use
    // the frontend-api proxy for recently created tokens
    const urls = [
      'https://pumpportal.fun/api/data?limit=50&sort=trending',
      'https://frontend-api-v3.pump.fun/coins?limit=50&sort=created_timestamp&order=DESC',
    ];

    for (const url of urls) {
      try {
        const data = await fetchJson(url, 8000);
        const items = Array.isArray(data) ? data : data?.coins || data?.data || [];
        for (const item of items) {
          if (!item.mint && !item.address) continue;
          const mint = (item.mint || item.address).toLowerCase();
          if (seededMints.has(mint)) continue;

          const price = item.vSolInBondingCurve && item.vTokensInBondingCurve
            ? item.vSolInBondingCurve / item.vTokensInBondingCurve
            : parseFloat(item.price || '0');

          hsetAll(`token:${mint}`, {
            mint,
            symbol: item.symbol || '???',
            name: item.name || 'Unknown',
            chain: 'sol',
            launchpad: 'pumpfun',
            image: item.image || '',
            spotPrice: String(price),
            virtualMcap: String(price * 1e9),
            priceChange24h: '0',
            bondingCurveProgress: item.vSolInBondingCurve
              ? String(Math.min(100, (item.vSolInBondingCurve / 85) * 100))
              : '0',
            holders: '0',
            createdAt: String(item.created_timestamp || item.createdAt || Date.now()),
            uri: item.uri || '',
            twitter: '', telegram: '', website: '',
          });

          const ts = Date.now();
          zadd('trenches:sol:pumpfun:trending', ts, mint);
          zadd('trenches:sol:pumpfun:new', ts, mint);
          zadd('trenches:sol:pumpfun', ts, mint);
          zadd('trenches:pumpfun', ts, mint);
          zadd('tokens:sol', ts, mint);

          seededMints.add(mint);
          seedCount++;
          count++;

          // Persist to PostgreSQL (non-blocking)
          upsertMarketToken({
            mint, chain: 'sol', launchpad: 'pumpfun',
            name: item.name, symbol: item.symbol,
            image: item.image || '',
            spotPrice: String(price), virtualMcap: String(price * 1e9),
            bondingCurveProgress: item.vSolInBondingCurve
              ? String(Math.min(100, (item.vSolInBondingCurve / 85) * 100))
              : '0',
            uri: item.uri || '',
            source: 'pumpportal',
          }).catch(() => {});
        }
      } catch { /* skip */ }
    }
    log('info', `PumpPortal REST: ${count} tokens ingested`);
  } catch (err: any) {
    log('warn', `PumpPortal REST failed: ${err.message}`);
  }
  return count;
}

/**
 * Run a full seed cycle. Called on boot and every 5 minutes.
 */
async function runSeedCycle(): Promise<void> {
  if (isSeeding) return;
  isSeeding = true;
  const start = Date.now();

  try {
    log('info', 'Starting bootstrap seed cycle...');

    // Phase 1: Load from PostgreSQL/JSON if in-memory store is empty
    if (seedCount === 0 || seededMints.size === 0) {
      const persisted = await loadPersistedTokens();
      if (persisted > 0) {
        log('info', `Loaded ${persisted} persisted tokens`);
        if (!bootstrapReady && seededMints.size > 0) {
          bootstrapReady = true;
          for (const cb of bootstrapReadyCallbacks) cb();
          bootstrapReadyCallbacks = [];
        }
      }
    }

    // Phase 2: Fetch from all live sources (parallel)
    const [dexCount, geckoCount, ppCount] = await Promise.all([
      seedFromDexScreener(),
      seedFromGeckoTerminal(),
      seedFromPumpPortal(),
    ]);
    log('info', `DexScreener: ${dexCount}, GeckoTerminal: ${geckoCount}, PumpPortal: ${ppCount}`);

    const totalHashes = seededMints.size;
    const elapsed = Date.now() - start;
    lastSeedAt = Date.now();

    // Persist to PostgreSQL + JSON snapshot (durable storage)
    await persistTokens();

    log('info', `Seed cycle complete: ${totalHashes} total tokens, ${elapsed}ms elapsed`);

    // Mark bootstrap as ready (even if partial — we have some data)
    if (!bootstrapReady && seededMints.size > 0) {
      bootstrapReady = true;
      for (const cb of bootstrapReadyCallbacks) cb();
      bootstrapReadyCallbacks = [];
      log('info', `═══ Bootstrap READY: ${seededMints.size} tokens available ═══`);
    }
  } catch (err: any) {
    log('error', `Seed cycle failed: ${err.message}`);
    // Mark ready anyway — don't block the API forever on failure
    if (!bootstrapReady) {
      bootstrapReady = true;
      for (const cb of bootstrapReadyCallbacks) cb();
      bootstrapReadyCallbacks = [];
    }
  } finally {
    isSeeding = false;
  }
}

/**
 * Start the bootstrap seeder. Non-blocking.
 * - Immediate first seed on boot
 * - Refreshes every 5 minutes
 */
export function startBootstrapSeed(): void {
  log('info', '═══ Bootstrap Market Seeder starting ═══');

  // Run immediately on boot (non-blocking)
  runSeedCycle().then(() => {
    log('info', `Initial seed complete: ${seedCount} tokens in store`);
  });

  // Refresh every 5 minutes
  setInterval(() => {
    runSeedCycle();
  }, 5 * 60 * 1000);
}

/**
 * Get seeder health for diagnostics.
 */
export function getSeederHealth() {
  return {
    isSeeding,
    lastSeedAt,
    totalTokensSeeded: seedCount,
    uniqueMints: seededMints.size,
  };
}