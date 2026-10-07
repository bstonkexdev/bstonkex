// BSTONKEX Market Discovery Engine — multi-chain token discovery, sorting, filtering
import { DEXSCREENER_API, type ChainId, CHAINS } from './config';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './engine/cache';
import { isSandboxed } from './engine/sandbox';

// ── Extended Market Token ────────────────────────────────────

export interface MarketToken {
  chainId: ChainId;
  address: string;
  name: string;
  symbol: string;
  price: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  volume5m: number | null;
  volume1h: number | null;
  volume6h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  fdv: number | null;
  buys5m: number | null;
  sells5m: number | null;
  buys1h: number | null;
  sells1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairAddress: string;
  dexId: string;
  pairCreatedAt: number | null;
  icon: string | null;
  url: string | null;
  // Computed
  ageMs: number;
  buySellRatio24h: number | null;
  tradability: 'tradable' | 'data_only' | 'no_liquidity' | 'no_route';
  dataFreshness: 'live' | 'recent' | 'stale';
}

export type DiscoveryCategory =
  | 'trending' | 'new' | 'gainers' | 'losers'
  | 'volume' | 'active' | 'liquidity' | 'watchlist';

export type SortField =
  'price' | 'change5m' | 'change1h' | 'change24h'
  | 'volume' | 'liquidity' | 'marketCap'
  | 'buys' | 'sells' | 'buySellRatio' | 'age';

export type SortDir = 'asc' | 'desc';

export interface MarketFilters {
  chain: ChainId | 'all';
  minLiquidity: number;
  maxLiquidity: number;
  minVolume: number;
  maxVolume: number;
  minMarketCap: number;
  maxMarketCap: number;
  maxAge: number; // ms, 0 = any
}

export const DEFAULT_FILTERS: MarketFilters = {
  chain: 'all',
  minLiquidity: 0, maxLiquidity: Infinity,
  minVolume: 0, maxVolume: Infinity,
  minMarketCap: 0, maxMarketCap: Infinity,
  maxAge: 0,
};

// ── Raw pair parsing ─────────────────────────────────────────

function mapChain(id: string): ChainId | null {
  const m: Record<string, ChainId> = { bsc: 'bsc', bnb: 'bsc', solana: 'solana', base: 'base', robinhood: 'robinhood' };
  return m[id?.toLowerCase()] || null;
}

function toMarketToken(raw: any): MarketToken | null {
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
    ageMs,
    buySellRatio24h: ratio,
    tradability: liq && liq > 1000 ? 'tradable' : liq ? 'no_liquidity' : 'data_only',
    dataFreshness: freshness,
  };
}

// ── Fetch raw pairs from DexScreener ─────────────────────────

async function fetchPairs(query: string): Promise<any[]> {
  if (isSandboxed()) return [];
  try {
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.pairs || [];
  } catch { return []; }
}

async function fetchPairsByChain(chainId: ChainId): Promise<any[]> {
  if (isSandboxed()) return [];
  const dexId = CHAINS[chainId]?.dexScreenerId;
  if (!dexId) return [];
  // Use token-boosts endpoint for chain discovery (search?q=chain: does not work on DexScreener)
  try {
    const res = await fetch(`${DEXSCREENER_API}/token-profiles/latest/v1`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const addresses = data.slice(0, 20).map((t: any) => t.tokenAddress).filter(Boolean);
    if (addresses.length === 0) return [];
    const results = await Promise.allSettled(
      addresses.slice(0, 6).map((addr: string) =>
        fetch(`${DEXSCREENER_API}/tokens/v1/${dexId}/${addr}`).then(r => r.json())
      )
    );
    const pairs: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        pairs.push(...r.value.filter((p: any) => mapChain(p.chainId) === chainId));
      }
    }
    return pairs;
  } catch { return []; }
}

// ── Discovery categories ─────────────────────────────────────

const SEARCH_QUERIES: Record<DiscoveryCategory, string[]> = {
  trending: ['PEPE', 'DOGE', 'SHIB', 'BONK', 'WIF'],
  new: ['new', 'launch'],
  gainers: ['USDT', 'BNB', 'ETH', 'SOL'],
  losers: ['USDC', 'DAI', 'BUSD'],
  volume: ['USDT', 'USDC', 'WBNB', 'WETH', 'WSOL'],
  active: ['PEPE', 'DOGE', 'CAKE', 'RAYDIUM'],
  liquidity: ['USDT', 'USDC', 'BUSD', 'DAI'],
  watchlist: [],
};

/** Get raw market data — broad fetch for client-side sorting. */
async function fetchBroadMarket(): Promise<MarketToken[]> {
  return cacheGetOrCompute(CACHE_KEYS.marketAll, async () => {
    const allQueries = ['USDT', 'USDC', 'BNB', 'ETH', 'SOL', 'PEPE', 'DOGE', 'SHIB', 'WIF', 'BONK', 'CAKE', 'RAYDIUM'];
    const results = await Promise.allSettled(allQueries.map(q => fetchPairs(q)));
    const seen = new Set<string>();
    const tokens: MarketToken[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const raw of r.value) {
        const key = `${raw.chainId}:${raw.baseToken?.address}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = toMarketToken(raw);
        if (t && t.price != null) tokens.push(t);
      }
    }
    return tokens;
  }, TTL.DISCOVERY);
}

/** Get discovery results for a category. */
export async function getDiscovery(category: DiscoveryCategory): Promise<MarketToken[]> {
  if (category === 'watchlist') return [];
  const tokens = await fetchBroadMarket();

  switch (category) {
    case 'trending':
      return sortTokens(tokens, 'volume', 'desc').slice(0, 50);
    case 'new':
      return tokens.filter(t => t.ageMs > 0 && t.ageMs < 86_400_000)
        .sort((a, b) => a.ageMs - b.ageMs).slice(0, 50);
    case 'gainers':
      return sortTokens(tokens.filter(t => (t.priceChange24h ?? 0) > 0), 'change24h', 'desc').slice(0, 50);
    case 'losers':
      return sortTokens(tokens.filter(t => (t.priceChange24h ?? 0) < 0), 'change24h', 'asc').slice(0, 50);
    case 'volume':
      return sortTokens(tokens, 'volume', 'desc').slice(0, 50);
    case 'active':
      return tokens.sort((a, b) => {
        const aTx = (a.buys24h ?? 0) + (a.sells24h ?? 0);
        const bTx = (b.buys24h ?? 0) + (b.sells24h ?? 0);
        return bTx - aTx;
      }).slice(0, 50);
    case 'liquidity':
      return sortTokens(tokens, 'liquidity', 'desc').slice(0, 50);
    default:
      return tokens.slice(0, 50);
  }
}

/** Get new pairs specifically. */
export async function getNewPairs(): Promise<MarketToken[]> {
  const tokens = await fetchBroadMarket();
  return tokens
    .filter(t => t.ageMs > 0 && t.ageMs < 86_400_000)
    .sort((a, b) => a.ageMs - b.ageMs)
    .slice(0, 30);
}

// ── Sorting ──────────────────────────────────────────────────

export function sortTokens(tokens: MarketToken[], field: SortField, dir: SortDir): MarketToken[] {
  const sorted = [...tokens];
  const mul = dir === 'desc' ? -1 : 1;
  sorted.sort((a, b) => {
    let av: number, bv: number;
    switch (field) {
      case 'price': av = a.price ?? -Infinity; bv = b.price ?? -Infinity; break;
      case 'change5m': av = a.priceChange5m ?? 0; bv = b.priceChange5m ?? 0; break;
      case 'change1h': av = a.priceChange1h ?? 0; bv = b.priceChange1h ?? 0; break;
      case 'change24h': av = a.priceChange24h ?? 0; bv = b.priceChange24h ?? 0; break;
      case 'volume': av = a.volume24h ?? 0; bv = b.volume24h ?? 0; break;
      case 'liquidity': av = a.liquidity ?? 0; bv = b.liquidity ?? 0; break;
      case 'marketCap': av = a.marketCap ?? 0; bv = b.marketCap ?? 0; break;
      case 'buys': av = a.buys24h ?? 0; bv = b.buys24h ?? 0; break;
      case 'sells': av = a.sells24h ?? 0; bv = b.sells24h ?? 0; break;
      case 'buySellRatio': av = a.buySellRatio24h ?? 0; bv = b.buySellRatio24h ?? 0; break;
      case 'age': av = a.ageMs || Infinity; bv = b.ageMs || Infinity; break;
      default: av = 0; bv = 0;
    }
    return (av - bv) * mul;
  });
  return sorted;
}

// ── Filtering ────────────────────────────────────────────────

export function filterTokens(tokens: MarketToken[], f: MarketFilters): MarketToken[] {
  return tokens.filter(t => {
    if (f.chain !== 'all' && t.chainId !== f.chain) return false;
    if (f.minLiquidity > 0 && (t.liquidity ?? 0) < f.minLiquidity) return false;
    if (f.maxLiquidity < Infinity && (t.liquidity ?? Infinity) > f.maxLiquidity) return false;
    if (f.minVolume > 0 && (t.volume24h ?? 0) < f.minVolume) return false;
    if (f.maxVolume < Infinity && (t.volume24h ?? Infinity) > f.maxVolume) return false;
    if (f.minMarketCap > 0 && (t.marketCap ?? 0) < f.minMarketCap) return false;
    if (f.maxMarketCap < Infinity && (t.marketCap ?? Infinity) > f.maxMarketCap) return false;
    if (f.maxAge > 0 && (t.ageMs === 0 || t.ageMs > f.maxAge)) return false;
    return true;
  });
}

// ── Formatting ───────────────────────────────────────────────

export function formatAge(ms: number): string {
  if (ms <= 0) return 'N/A';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

export function freshnessLabel(f: MarketToken['dataFreshness']): string {
  return f === 'live' ? 'LIVE' : f === 'recent' ? 'RECENT' : 'STALE';
}

export function tradabilityLabel(t: MarketToken['tradability']): string {
  switch (t) {
    case 'tradable': return 'TRADE';
    case 'data_only': return 'VIEW MARKET';
    case 'no_liquidity': return 'NO LIQUIDITY';
    case 'no_route': return 'NO ROUTE';
  }
}