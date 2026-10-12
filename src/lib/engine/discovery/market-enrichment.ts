// Cupcak8 Swap — Market Data Enrichment (Step 4 Hardened)
//
// STATES per token (Step 5 — distinct phases):
//   discovered → awaiting → enriched | no_data
//   enriched → stale (if data is old) → awaiting (on next refresh)
//
// TRADABILITY LEVELS (separate from market data states):
//   data_only          — discovered, no market data yet
//   no_liquidity       — has price but liquidity below threshold
//   liquidity_qualified — has sufficient liquidity (≥ threshold) BUT not execution-verified
//   execution_verified — has verified pool AND executable route/quote
//
// RULES:
//   - Never fabricate prices/volume/liquidity. Null = unknown.
//   - Never delete a token because DexScreener has no result.
//   - Liquidity > $1000 ≠ tradable. Must verify executable route.
//   - Bounded batch size. Provider cooldowns. Stale detection.
import type { ChainId } from '../../config';
import { DEXSCREENER_API, GECKOTERMINAL_API } from '../../config';
import type { EnrichmentResult } from './types';
import { listIndexedTokens, updateMarketData } from '../token-index';

// ── Liquidity threshold (configurable) ──────────────────────
export const MIN_LIQUIDITY_USD = 1000; // For liquidity_qualified status only

/** Check if a token meets the liquidity threshold. Does NOT imply tradability. */
export function isLiquidityQualified(liquidity: number | null): boolean {
  return liquidity !== null && liquidity >= MIN_LIQUIDITY_USD;
}

/**
 * Check if a token has a verified executable route.
 * Tests BOTH buy (native→token) and sell (token→native) directions.
 * Returns true ONLY when at least one real quote succeeds with non-zero output.
 * This is SEPARATE from liquidity qualification.
 */
export async function verifyExecutionRoute(chainId: ChainId, address: string): Promise<boolean> {
  try {
    const { verifyTokenRoute } = await import('./route-verification');
    const result = await verifyTokenRoute(chainId, address);
    return result.verified;
  } catch {
    return false;
  }
}

/**
 * Get full route verification details (for status reporting).
 * Returns independent buy/sell/both states.
 */
export async function getRouteVerificationDetails(chainId: ChainId, address: string) {
  try {
    const { verifyTokenRoute } = await import('./route-verification');
    return await verifyTokenRoute(chainId, address);
  } catch (e: any) {
    return {
      verified: false, bothDirectionsVerified: false,
      chainId, tokenAddress: address,
      provider: chainId === 'solana' ? 'jupiter' : '1inch',
      direction: null, quoteAmountOut: null, routeSteps: 0,
      error: `Verification error: ${e.message}`,
      verifiedAt: null, latencyMs: 0,
      buyVerified: false, sellVerified: false,
      buyError: e.message, sellError: e.message,
    };
  }
}

// ── Configuration ───────────────────────────────────────────

const ENRICH_BATCH_SIZE = 10;           // Max tokens to enrich per cycle
const STALE_THRESHOLD_MS = 300_000;     // Data older than 5 minutes = stale
const DEXSCREENER_COOLDOWN_MS = 2000;   // Min time between DexScreener calls
const GECKOTERMINAL_COOLDOWN_MS = 3000;
const JUPITER_COOLDOWN_MS = 1500;

let lastDexScreenerCall = 0;
let lastGeckoTerminalCall = 0;
let lastJupiterCall = 0;

// ── Rate limiter ────────────────────────────────────────────

async function rateGate(lastTime: number, cooldownMs: number): Promise<number> {
  const now = Date.now();
  const wait = cooldownMs - (now - lastTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  return Date.now();
}

// ── Provider: DexScreener ───────────────────────────────────

async function enrichFromDexScreener(chainId: ChainId, address: string): Promise<EnrichmentResult | null> {
  lastDexScreenerCall = await rateGate(lastDexScreenerCall, DEXSCREENER_COOLDOWN_MS);
  try {
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/tokens/${address}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = data.pairs || [];
    if (!pairs.length) return null;

    const best = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    return {
      address, chainId,
      price: best.priceUsd ? parseFloat(best.priceUsd) : null,
      volume24h: best.volume?.h24 ? parseFloat(best.volume.h24) : null,
      liquidity: best.liquidity?.usd ?? null,
      marketCap: best.marketCap ?? best.fdv ?? null,
      name: best.baseToken?.name ?? null,
      symbol: best.baseToken?.symbol ?? null,
      icon: best.info?.imageUrl ?? null,
      source: 'dexscreener',
      enrichedAt: Date.now(),
    };
  } catch { return null; }
}

// ── Provider: GeckoTerminal ─────────────────────────────────

async function enrichFromGeckoTerminal(chainId: ChainId, address: string): Promise<EnrichmentResult | null> {
  const networkMap: Record<string, string> = { bsc: 'bsc', base: 'base', solana: 'solana', robinhood: 'robinhood' };
  const network = networkMap[chainId];
  if (!network) return null;

  lastGeckoTerminalCall = await rateGate(lastGeckoTerminalCall, GECKOTERMINAL_COOLDOWN_MS);
  try {
    const res = await fetch(`${GECKOTERMINAL_API}/networks/${network}/tokens/${address}/pools`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pools = data.data || [];
    if (!pools.length) return null;

    const attrs = pools[0]?.attributes || {};
    return {
      address, chainId,
      price: attrs.base_token_price_usd ? parseFloat(attrs.base_token_price_usd) : null,
      volume24h: attrs.volume_usd?.h24 ? parseFloat(attrs.volume_usd.h24) : null,
      liquidity: attrs.reserve_in_usd ? parseFloat(attrs.reserve_in_usd) : null,
      marketCap: attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null,
      name: null, symbol: null, icon: null,
      source: 'geckoterminal',
      enrichedAt: Date.now(),
    };
  } catch { return null; }
}

// ── Provider: Jupiter (Solana) ──────────────────────────────

async function enrichFromJupiter(address: string): Promise<EnrichmentResult | null> {
  lastJupiterCall = await rateGate(lastJupiterCall, JUPITER_COOLDOWN_MS);
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${address}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const priceData = data.data?.[address];
    if (!priceData) return null;

    return {
      address, chainId: 'solana',
      price: priceData.price ?? null,
      volume24h: null, liquidity: null, marketCap: null,
      name: null, symbol: null, icon: null,
      source: 'jupiter',
      enrichedAt: Date.now(),
    };
  } catch { return null; }
}

// ── State helpers ───────────────────────────────────────────

function isStale(token: { lastEnrichedAt: number | null; marketDataStatus: string }): boolean {
  if (token.marketDataStatus !== 'enriched') return false;
  if (!token.lastEnrichedAt) return true;
  return Date.now() - token.lastEnrichedAt > STALE_THRESHOLD_MS;
}

function needsEnrichment(token: { marketDataStatus: string; lastEnrichedAt: number | null }): boolean {
  // Needs enrichment if: awaiting, no_data, or enriched-but-stale
  return token.marketDataStatus === 'awaiting'
    || token.marketDataStatus === 'no_data'
    || isStale(token);
}

// ── Main enrichment cycle ───────────────────────────────────

export interface EnrichmentCycleResult {
  enriched: number;
  stale: number;
  awaiting: number;
  noData: number;
  errors: string[];
}

/**
 * Run one bounded enrichment cycle.
 * Phase 1: Enrich tokens with market data (price/volume/liquidity).
 * Phase 2: Verify execution routes for liquidity-qualified tokens.
 * Returns statistics. Never deletes tokens.
 */
export async function enrichPendingTokens(): Promise<EnrichmentCycleResult & { routeVerified: number; routeBlocked: number }> {
  const errors: string[] = [];
  let enriched = 0, stale = 0, routeVerified = 0, routeBlocked = 0;

  const tokens = await listIndexedTokens();

  // Count states
  const awaiting = tokens.filter(t => t.marketDataStatus === 'awaiting');
  const noData = tokens.filter(t => t.marketDataStatus === 'no_data');
  const enrichedTokens = tokens.filter(t => t.marketDataStatus === 'enriched');
  stale = enrichedTokens.filter(t => isStale(t)).length;

  // ── Phase 1: Market data enrichment ──────────────────────
  const toEnrich = tokens.filter(needsEnrichment).slice(0, ENRICH_BATCH_SIZE);

  for (const token of toEnrich) {
    let result: EnrichmentResult | null = null;

    if (token.chainId === 'solana') {
      result = await enrichFromDexScreener(token.chainId, token.address);
      if (!result) result = await enrichFromJupiter(token.address);
      if (!result) result = await enrichFromGeckoTerminal(token.chainId, token.address);
    } else {
      result = await enrichFromDexScreener(token.chainId, token.address);
      if (!result) result = await enrichFromGeckoTerminal(token.chainId, token.address);
    }

    if (result && result.price !== null) {
      const success = await updateMarketData(token.chainId, token.address, {
        price: result.price,
        volume24h: result.volume24h,
        liquidity: result.liquidity,
        marketCap: result.marketCap,
        name: result.name ?? token.name,
        symbol: result.symbol ?? token.symbol,
        icon: result.icon ?? token.icon,
        marketDataStatus: 'enriched',
        lastEnrichedAt: result.enrichedAt,
      });
      if (success) enriched++;
    } else if (result === null) {
      await updateMarketData(token.chainId, token.address, {
        marketDataStatus: 'no_data',
      });
    }
  }

  // ── Phase 2: Route verification (liquidity-qualified tokens) ──
  const { verifyTokenRoute } = await import('./route-verification');
  const liquidityQualified = tokens
    .filter(t => isLiquidityQualified(t.liquidity) && !t.routeVerified)
    .slice(0, 5); // Bounded — max 5 route verifications per cycle

  for (const token of liquidityQualified) {
    try {
      const result = await verifyTokenRoute(token.chainId, token.address);
      if (result.verified) {
        await updateMarketData(token.chainId, token.address, {
          routeVerified: true,
          routeProvider: result.provider,
          routeDirection: result.direction,
          routeVerifiedAt: result.verifiedAt,
          routeError: null,
          routeBuyVerified: result.buyVerified,
          routeSellVerified: result.sellVerified,
          routeBothVerified: result.bothDirectionsVerified,
        } as any);
        routeVerified++;
      } else {
        // Route verification failed — do NOT mark as verified
        // Record the failure reason but preserve market data
        await updateMarketData(token.chainId, token.address, {
          routeError: result.error || 'Route verification failed',
          routeBuyVerified: result.buyVerified,
          routeSellVerified: result.sellVerified,
          routeBothVerified: false,
        } as any);
        routeBlocked++;
      }
    } catch (e: any) {
      errors.push(`Route verification failed for ${token.address}: ${e.message}`);
      routeBlocked++;
    }
  }

  return {
    enriched,
    stale,
    awaiting: awaiting.length,
    noData: noData.length,
    routeVerified,
    routeBlocked,
    errors,
  };
}

/**
 * Force enrichment of a single token (e.g. when user opens token detail page).
 * Does NOT mark tradable — that requires separate route verification.
 */
export async function enrichToken(chainId: ChainId, address: string): Promise<EnrichmentResult | null> {
  let result: EnrichmentResult | null = null;

  if (chainId === 'solana') {
    result = await enrichFromDexScreener(chainId, address);
    if (!result) result = await enrichFromJupiter(address);
    if (!result) result = await enrichFromGeckoTerminal(chainId, address);
  } else {
    result = await enrichFromDexScreener(chainId, address);
    if (!result) result = await enrichFromGeckoTerminal(chainId, address);
  }

  if (result && result.price !== null) {
    await updateMarketData(chainId, address, {
      price: result.price,
      volume24h: result.volume24h,
      liquidity: result.liquidity,
      marketCap: result.marketCap,
      name: result.name,
      symbol: result.symbol,
      icon: result.icon,
      marketDataStatus: 'enriched',
      lastEnrichedAt: result.enrichedAt,
    });
  }

  return result;
}

/**
 * Mark a token's market data as stale (admin operation or time-based check).
 * Sets marketDataStatus back to 'awaiting' so next cycle re-enriches it.
 */
export async function markStale(chainId: ChainId, address: string): Promise<void> {
  await updateMarketData(chainId, address, {
    marketDataStatus: 'awaiting',
    // Keep existing price/volume — they represent last known values, clearly stale.
  });
}
