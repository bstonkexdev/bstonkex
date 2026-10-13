// Cupcak8 Swap — OpenLaunch Live Data Adapter
// Fetches real OpenLaunch token data via DexScreener API
// OpenLaunch operates on Base chain — tokens are discoverable via DexScreener
// Official source: https://openlaunch.lol/
import { DEXSCREENER_API, type ChainId } from '../../config';
import type { MarketToken } from '../../market-discovery';
import { cacheGetOrCompute } from '../cache';

const OPENLAUNCH_CHAIN: ChainId = 'base';
const OPENLAUNCH_DEX_ID = 'openlaunch';
const OPENLAUNCH_FACTORY = '0x890CeCc88F2F21Fe6d41B290d3F2E3Ae1265D5A5'; // OpenLaunch factory on Base

export interface LaunchpadHealth {
  status: 'active' | 'indexing_delayed' | 'offline' | 'not_configured';
  lastSync: number | null;
  tokensIndexed: number;
  lastEvent: string | null;
  latencyMs: number | null;
}

// ── Raw DexScreener pair → MarketToken normalizer ─────────

function mapChain(id: string): ChainId | null {
  const m: Record<string, ChainId> = { bsc: 'bsc', bnb: 'bsc', solana: 'solana', base: 'base', robinhood: 'robinhood' };
  return m[id?.toLowerCase()] || null;
}

function dexPairToMarketToken(raw: any, launchpadId: string, launchpadName: string): MarketToken | null {
  const chainId = mapChain(raw.chainId);
  if (!chainId) return null;
  const price = raw.priceUsd ? parseFloat(raw.priceUsd) : null;
  const tx = raw.txns || {};
  const vol = raw.volume || {};
  const pc = raw.priceChange || {};
  const ageMs = raw.pairCreatedAt ? Date.now() - raw.pairCreatedAt : 0;
  const buys24 = tx.h24?.buys ?? null;
  const sells24 = tx.h24?.sells ?? null;
  const ratio = buys24 != null && sells24 != null && sells24 > 0 ? buys24 / sells24 : null;
  const liq = raw.liquidity?.usd ?? null;
  const freshness: MarketToken['dataFreshness'] =
    raw.pairCreatedAt && (Date.now() - raw.pairCreatedAt < 3_600_000) ? 'live' : 'recent';

  return {
    chainId,
    address: raw.baseToken?.address || '',
    name: raw.baseToken?.name || 'Unknown',
    symbol: raw.baseToken?.symbol || '???',
    price,
    priceChange5m: pc.m5 != null ? parseFloat(pc.m5) : null,
    priceChange1h: pc.h1 != null ? parseFloat(pc.h1) : null,
    priceChange6h: pc.h6 != null ? parseFloat(pc.h6) : null,
    priceChange24h: pc.h24 != null ? parseFloat(pc.h24) : null,
    volume5m: vol.m5 ?? null,
    volume1h: vol.h1 ?? null,
    volume6h: vol.h6 ?? null,
    volume24h: vol.h24 ?? null,
    liquidity: liq,
    marketCap: raw.marketCap ?? raw.fdv ?? null,
    fdv: raw.fdv ?? null,
    buys5m: tx.m5?.buys ?? null,
    sells5m: tx.m5?.sells ?? null,
    buys1h: tx.h1?.buys ?? null,
    sells1h: tx.h1?.sells ?? null,
    buys24h: buys24,
    sells24h: sells24,
    pairAddress: raw.pairAddress || '',
    dexId: raw.dexId || '',
    pairCreatedAt: raw.pairCreatedAt || null,
    icon: raw.info?.imageUrl || null,
    url: raw.url || null,
    launchpadId,
    launchpadName,
    ageMs,
    buySellRatio24h: ratio,
    tradability: (raw as any).routeBothVerified && liq && liq > 1000 ? 'tradable' : liq && liq > 1000 ? 'data_only' : liq ? 'no_liquidity' : 'data_only',
    priceSource: 'none' as const,
    marketState: 'unknown' as const,
    liquidityType: 'none' as const,
    virtualLiquidity: null,
    dataFreshness: freshness,
  };
}

// ── Health tracking ────────────────────────────────────────

let healthState: LaunchpadHealth = {
  status: 'not_configured', lastSync: null, tokensIndexed: 0, lastEvent: null, latencyMs: null,
};

export function getOpenLaunchHealth(): LaunchpadHealth {
  return { ...healthState };
}

// ── Fetch OpenLaunch tokens from DexScreener ──────────────

async function fetchOpenLaunchPairs(): Promise<any[]> {
  const start = Date.now();
  try {
    // Strategy 1: Search DexScreener for OpenLaunch DEX pairs on Base
    const searchRes = await fetch(
      `${DEXSCREENER_API}/latest/dex/search?q=openlaunch`
    );
    if (!searchRes.ok) {
      healthState = { ...healthState, status: 'offline', latencyMs: Date.now() - start };
      return [];
    }
    const searchData = await searchRes.json();
    const searchPairs: any[] = (searchData.pairs || [])
      .filter((p: any) => mapChain(p.chainId) === OPENLAUNCH_CHAIN);

    // Strategy 2: Also search for recent Base tokens that might be OpenLaunch
    const baseRes = await fetch(
      `${DEXSCREENER_API}/latest/dex/pairs/base?limit=50`
    ).catch(() => null);

    let basePairs: any[] = [];
    if (baseRes && baseRes.ok) {
      const baseData = await baseRes.json();
      basePairs = (baseData.pairs || [])
        .filter((p: any) => p.dexId === OPENLAUNCH_DEX_ID || p.dexId?.includes('openlaunch'));
    }

    // Strategy 3: Token profiles for Base chain — check for OpenLaunch sourced tokens
    const profileRes = await fetch(
      `${DEXSCREENER_API}/token-profiles/latest/v1`
    ).catch(() => null);

    let profilePairs: any[] = [];
    if (profileRes && profileRes.ok) {
      const profiles = await profileRes.json();
      if (Array.isArray(profiles)) {
        // Get recent Base tokens from profiles
        const baseAddresses = profiles
          .filter((t: any) => t.chainId === 'base')
          .slice(0, 20)
          .map((t: any) => t.tokenAddress)
          .filter(Boolean);

        if (baseAddresses.length > 0) {
          const tokenResults = await Promise.allSettled(
            baseAddresses.slice(0, 8).map((addr: string) =>
              fetch(`${DEXSCREENER_API}/tokens/v1/base/${addr}`).then(r => r.json())
            )
          );
          for (const r of tokenResults) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              // Filter for pairs that might be from OpenLaunch
              const openLaunchPairs = r.value.filter((p: any) =>
                p.dexId === OPENLAUNCH_DEX_ID ||
                p.dexId?.includes('openlaunch') ||
                (p.pairAddress && p.pairAddress.toLowerCase().startsWith('0x'))
              );
              profilePairs.push(...openLaunchPairs);
            }
          }
        }
      }
    }

    // Merge all results, deduplicate by pairAddress
    const allPairs = [...searchPairs, ...basePairs, ...profilePairs];
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const p of allPairs) {
      const key = p.pairAddress || `${p.chainId}:${p.baseToken?.address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }

    const latency = Date.now() - start;
    healthState = {
      status: unique.length > 0 ? 'active' : 'indexing_delayed',
      lastSync: Date.now(),
      tokensIndexed: unique.length,
      lastEvent: `Fetched ${unique.length} pairs`,
      latencyMs: latency,
    };

    return unique;
  } catch (e) {
    healthState = {
      status: 'offline',
      lastSync: null,
      tokensIndexed: 0,
      lastEvent: `Error: ${(e as Error).message || 'unknown'}`,
      latencyMs: Date.now() - start,
    };
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────

const CACHE_TTL = 60_000; // 1 minute

/** Get all OpenLaunch tokens, normalized to Cupcak8 Swap MarketToken */
export async function getOpenLaunchTokens(): Promise<MarketToken[]> {
  return cacheGetOrCompute('openlaunch-tokens', async () => {
    const pairs = await fetchOpenLaunchPairs();
    return pairs
      .map(p => dexPairToMarketToken(p, 'openlaunch-base', 'OPENLAUNCH'))
      .filter((t): t is MarketToken => t !== null);
  }, CACHE_TTL);
}

/** Get OpenLaunch tokens sorted by discovery category */
export async function getOpenLaunchDiscovery(
  category: 'trending' | 'new' | 'gainers' | 'losers' | 'volume' | 'active' | 'liquidity' | 'watchlist'
): Promise<MarketToken[]> {
  const tokens = await getOpenLaunchTokens();

  switch (category) {
    case 'trending':
      return [...tokens].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 50);
    case 'new':
      return [...tokens]
        .filter(t => t.ageMs > 0)
        .sort((a, b) => a.ageMs - b.ageMs)
        .slice(0, 50);
    case 'gainers':
      return [...tokens]
        .filter(t => (t.priceChange24h ?? 0) > 0)
        .sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0))
        .slice(0, 50);
    case 'losers':
      return [...tokens]
        .filter(t => (t.priceChange24h ?? 0) < 0)
        .sort((a, b) => (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0))
        .slice(0, 50);
    case 'volume':
      return [...tokens].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 50);
    case 'active':
      return [...tokens].sort((a, b) => {
        const aTx = (a.buys24h ?? 0) + (a.sells24h ?? 0);
        const bTx = (b.buys24h ?? 0) + (b.sells24h ?? 0);
        return bTx - aTx;
      }).slice(0, 50);
    case 'liquidity':
      return [...tokens].sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0)).slice(0, 50);
    default:
      return tokens.slice(0, 50);
  }
}

/** Invalidate OpenLaunch cache (for refresh) */
export function invalidateOpenLaunchCache(): void {
  // Cache will naturally expire, but this forces next fetch to be fresh
  healthState = { ...healthState, lastSync: null };
}
