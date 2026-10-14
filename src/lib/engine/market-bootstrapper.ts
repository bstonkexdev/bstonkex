// Cupcak8 Swap — Market Bootstrapper
// Fetches trending/popular tokens directly from DexScreener + GeckoTerminal APIs
// on page load, so the app is populated INSTANTLY (not waiting for backend bootstrap).
//
// This is exactly how ave.ai / GMGN / Birdeye work:
// 1. DexScreener token-boosts/top → top trending tokens with full market data
// 2. GeckoTerminal trending pools → newest hot pools across all chains
// 3. PumpPortal trending → real-time popular Pump.fun tokens
// 4. All fetched in parallel → merged → cached → served to MarketSection

import { cacheGetOrCompute, TTL } from './cache';

const DEXSCREENER = 'https://api.dexscreener.com';
const GECKOTERMINAL = 'https://api.geckoterminal.com/api/v2';
const PUMPPORTAL = 'https://pumpportal.fun/api/data';

// ── Types ─────────────────────────────────────────────────────

export interface BootstrapToken {
  mint: string;
  chain: string;
  launchpad: string;
  symbol: string;
  name: string;
  image: string;
  spotPrice: string;
  virtualMcap: string;
  priceChange24h: string;
  volume24h: string;
  liquidity: string;
  buys24h: string;
  sells24h: string;
  bondingCurveProgress: string;
  holders: string;
  pairAddress: string;
  dexId: string;
  createdAt: string;
  source: 'dexscreener' | 'geckoterminal' | 'pumpportal';
}

// ── Helpers ───────────────────────────────────────────────────

async function fetchJson(url: string, timeout = 8000): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mapChain(id: string): string {
  const map: Record<string, string> = {
    solana: 'sol', sol: 'sol',
    ethereum: 'eth', eth: 'eth',
    'binance-smart-chain': 'bsc', bsc: 'bsc',
    base: 'base',
    'arbitrum': 'arbitrum', 'arbitrum-one': 'arbitrum',
  };
  return map[id?.toLowerCase()] || id?.toLowerCase() || 'unknown';
}

// ── DexScreener: Top Boosted / Trending Tokens ────────────────

async function fetchDexScreenerTrending(): Promise<BootstrapToken[]> {
  const tokens: BootstrapToken[] = [];

  // 1. Top boosted tokens (highest promotion = most popular)
  const topBoosts = await fetchJson(`${DEXSCREENER}/token-boosts/top/v1`);
  if (Array.isArray(topBoosts)) {
    for (const t of topBoosts.slice(0, 50)) {
      if (!t?.chainId || !t?.tokenAddress) continue;
      const chain = mapChain(t.chainId);
      tokens.push({
        mint: t.tokenAddress,
        chain,
        launchpad: 'dexscreener',
        symbol: t.symbol || '???',
        name: t.name || 'Unknown',
        image: t.icon || t.image || '',
        spotPrice: '0',
        virtualMcap: '0',
        priceChange24h: '0',
        volume24h: '0',
        liquidity: '0',
        buys24h: '0',
        sells24h: '0',
        bondingCurveProgress: '0',
        holders: '0',
        pairAddress: '',
        dexId: '',
        createdAt: String(Date.now()),
        source: 'dexscreener',
      });
    }
  }

  // 2. Latest token profiles (recently active tokens)
  const profiles = await fetchJson(`${DEXSCREENER}/token-profiles/latest/v1`);
  if (Array.isArray(profiles)) {
    for (const t of profiles.slice(0, 50)) {
      if (!t?.chainId || !t?.tokenAddress) continue;
      const existing = tokens.find(x => x.mint === t.tokenAddress && x.chain === mapChain(t.chainId));
      if (existing) continue;
      const chain = mapChain(t.chainId);
      tokens.push({
        mint: t.tokenAddress,
        chain,
        launchpad: 'dexscreener',
        symbol: t.symbol || '???',
        name: t.name || 'Unknown',
        image: t.icon || t.image || '',
        spotPrice: '0',
        virtualMcap: '0',
        priceChange24h: '0',
        volume24h: '0',
        liquidity: '0',
        buys24h: '0',
        sells24h: '0',
        bondingCurveProgress: '0',
        holders: '0',
        pairAddress: '',
        dexId: '',
        createdAt: String(Date.now()),
        source: 'dexscreener',
      });
    }
  }

  // 3. Fetch full pair data for top tokens (price, volume, liquidity) — ALL chains
  // Group tokens by chain for DexScreener batch calls
  const byChain = new Map<string, BootstrapToken[]>();
  for (const t of tokens) {
    const group = byChain.get(t.chain) || [];
    group.push(t);
    byChain.set(t.chain, group);
  }

  // DexScreener uses chain IDs: solana, bsc, base, ethereum, arbitrum
  const chainIdMap: Record<string, string> = { sol: 'solana', bsc: 'bsc', base: 'base', eth: 'ethereum', arbitrum: 'arbitrum' };

  for (const [chain, chainTokens] of byChain) {
    const dsChain = chainIdMap[chain] || chain;
    const topMints = chainTokens.slice(0, 30).map(t => t.mint);
    if (topMints.length === 0) continue;

    const batchUrl = `${DEXSCREENER}/tokens/v1/${dsChain}/${topMints.join(',')}`;
    const pairsData = await fetchJson(batchUrl);
    if (Array.isArray(pairsData)) {
      for (const pair of pairsData) {
        const existing = tokens.find(t => t.mint === pair.baseToken?.address);
        if (!existing) continue;
        const p = pair;
        existing.spotPrice = p.priceUsd || '0';
        existing.priceChange24h = String(p.priceChange?.h24 || 0);
        existing.volume24h = String(p.volume?.h24 || 0);
        existing.liquidity = String(p.liquidity?.usd || 0);
        existing.buys24h = String(p.txns?.h24?.buys || 0);
        existing.sells24h = String(p.txns?.h24?.sells || 0);
        existing.virtualMcap = String(p.marketCap || p.fdv || 0);
        existing.pairAddress = p.pairAddress || '';
        existing.dexId = p.dexId || '';
        existing.symbol = p.baseToken?.symbol || existing.symbol;
        existing.name = p.baseToken?.name || existing.name;
        existing.image = existing.image || p.info?.imageUrl || '';
      }
    }
  }

  return tokens;
}

// ── GeckoTerminal: Trending Pools ─────────────────────────────

async function fetchGeckoTerminalTrending(): Promise<BootstrapToken[]> {
  const tokens: BootstrapToken[] = [];
  const chains = ['solana', 'base', 'bsc', 'arbitrum'];

  const fetches = chains.map(chain =>
    fetchJson(`${GECKOTERMINAL}/networks/${chain}/trending_pools?page=1`)
  );

  const results = await Promise.allSettled(fetches);
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value?.data) continue;
    for (const pool of result.value.data) {
      const attrs = pool.attributes;
      if (!attrs) continue;
      const chain = mapChain(pool.relationships?.network?.data?.id || '');
      const baseToken = pool.relationships?.base_token?.data?.id?.split('_')?.[1] || '';
      if (!baseToken) continue;

      tokens.push({
        mint: baseToken,
        chain,
        launchpad: 'geckoterminal',
        symbol: attrs.symbol || '???',
        name: attrs.name || 'Unknown',
        image: '',
        spotPrice: attrs.base_token_price_usd || '0',
        virtualMcap: attrs.market_cap_usd || attrs.fdv_usd || '0',
        priceChange24h: String(attrs.price_change_percentage?.h24 || 0),
        volume24h: String(attrs.volume_usd?.h24 || 0),
        liquidity: String(attrs.reserve_in_usd || 0),
        buys24h: String(attrs.transactions?.h24?.buys || 0),
        sells24h: String(attrs.transactions?.h24?.sells || 0),
        bondingCurveProgress: '100', // GeckoTerminal pools are graduated
        holders: '0',
        pairAddress: pool.id?.split('_')?.[1] || '',
        dexId: attrs.dex_id || '',
        createdAt: String(Date.now()),
        source: 'geckoterminal',
      });
    }
  }

  return tokens;
}

// ── PumpPortal: Trending Tokens (REST) ────────────────────────

async function fetchPumpPortalTrending(): Promise<BootstrapToken[]> {
  const tokens: BootstrapToken[] = [];
  const data = await fetchJson(`${PUMPPORTAL}?limit=50&sort=trending`);
  if (!Array.isArray(data)) return tokens;

  for (const t of data) {
    if (!t.mint) continue;
    const spotPrice = t.vSolInBondingCurve && t.vTokensInBondingCurve
      ? (t.vSolInBondingCurve / t.vTokensInBondingCurve) : 0;
    const progress = t.vSolInBondingCurve
      ? Math.min(100, (t.vSolInBondingCurve / 85) * 100) : 0;

    tokens.push({
      mint: t.mint,
      chain: 'sol',
      launchpad: 'pumpfun',
      symbol: t.symbol || '???',
      name: t.name || 'Unknown',
      image: t.image || t.uri || '',
      spotPrice: String(spotPrice),
      virtualMcap: String(spotPrice * 1e9),
      priceChange24h: '0',
      volume24h: '0',
      liquidity: String((t.vSolInBondingCurve || 0) * 200), // SOL→USD approx
      buys24h: '0',
      sells24h: '0',
      bondingCurveProgress: String(progress),
      holders: '0',
      pairAddress: '',
      dexId: 'pumpfun',
      createdAt: String(Date.now()),
      source: 'pumpportal',
    });
  }

  return tokens;
}

// ── Main Bootstrap: Fetch All Sources in Parallel ─────────────

let cachedTokens: BootstrapToken[] | null = null;
let lastFetch = 0;

/**
 * Fetch trending tokens from all sources in parallel.
 * Returns merged + deduplicated token list sorted by volume/liquidity.
 * Cached for 60 seconds to avoid hammering APIs.
 */
export async function fetchBootstrapTokens(forceRefresh = false): Promise<BootstrapToken[]> {
  const now = Date.now();
  if (!forceRefresh && cachedTokens && now - lastFetch < 60_000) {
    return cachedTokens;
  }

  // Fetch all sources in parallel (like ave.ai does)
  const [dexScreener, geckoTerminal, pumpPortal] = await Promise.allSettled([
    fetchDexScreenerTrending(),
    fetchGeckoTerminalTrending(),
    fetchPumpPortalTrending(),
  ]);

  const allTokens: BootstrapToken[] = [];
  const seen = new Set<string>();

  // Merge + deduplicate (prefer tokens with more data)
  const sources = [
    dexScreener.status === 'fulfilled' ? dexScreener.value : [],
    geckoTerminal.status === 'fulfilled' ? geckoTerminal.value : [],
    pumpPortal.status === 'fulfilled' ? pumpPortal.value : [],
  ];

  for (const source of sources) {
    for (const t of source) {
      const key = `${t.chain}:${t.mint}`.toLowerCase();
      if (seen.has(key)) {
        // Merge: update existing with richer data
        const existing = allTokens.find(x => `${x.chain}:${x.mint}`.toLowerCase() === key);
        if (existing) {
          if (parseFloat(t.volume24h) > parseFloat(existing.volume24h)) existing.volume24h = t.volume24h;
          if (parseFloat(t.liquidity) > parseFloat(existing.liquidity)) existing.liquidity = t.liquidity;
          if (t.spotPrice !== '0' && existing.spotPrice === '0') existing.spotPrice = t.spotPrice;
          if (t.image && !existing.image) existing.image = t.image;
          if (parseFloat(t.buys24h) > parseFloat(existing.buys24h)) existing.buys24h = t.buys24h;
          if (parseFloat(t.sells24h) > parseFloat(existing.sells24h)) existing.sells24h = t.sells24h;
        }
        continue;
      }
      seen.add(key);
      allTokens.push(t);
    }
  }

  // Sort by volume (highest first), then liquidity
  allTokens.sort((a, b) => {
    const volA = parseFloat(a.volume24h) || 0;
    const volB = parseFloat(b.volume24h) || 0;
    if (volA !== volB) return volB - volA;
    const liqA = parseFloat(a.liquidity) || 0;
    const liqB = parseFloat(b.liquidity) || 0;
    return liqB - liqA;
  });

  cachedTokens = allTokens;
  lastFetch = now;
  return allTokens;
}

/**
 * Get bootstrap stats for diagnostics.
 */
export function getBootstrapStats(): { cached: number; lastFetch: number; age: number } {
  return {
    cached: cachedTokens?.length || 0,
    lastFetch,
    age: lastFetch > 0 ? Date.now() - lastFetch : -1,
  };
}