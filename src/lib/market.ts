// BSTONKEX Market Data Engine — Real blockchain data via DexScreener + GeckoTerminal
// Enhanced with price engine integration and cache layer
import { DEXSCREENER_API, GECKOTERMINAL_API, type ChainId, CHAINS } from './config';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './engine/cache';
import { isSandboxed } from './engine/sandbox';

export interface TokenData {
  chainId: ChainId;
  address: string;
  name: string;
  symbol: string;
  price: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidity: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  txns24h: number | null;
  pairAddress: string | null;
  dexId: string | null;
  url: string | null;
  icon: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
}

export interface TradeData {
  time: number;
  price: number;
  amount: number;
  value: number;
  side: 'buy' | 'sell';
  txHash: string;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SearchResult {
  chainId: ChainId;
  address: string;
  name: string;
  symbol: string;
  price: number | null;
  priceChange24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  pairAddress: string | null;
  dexId: string | null;
}

export interface HolderData {
  rank: number;
  address: string;
  balance: string;
  pctSupply: number;
  value: number | null;
}

function mapDexChain(id: string): ChainId | null {
  const map: Record<string, ChainId> = {
    bsc: 'bsc', bnb: 'bsc',
    solana: 'solana',
    base: 'base',
    robinhood: 'robinhood',
  };
  return map[id?.toLowerCase()] || null;
}

function parseToken(raw: any): TokenData | null {
  if (!raw) return null;
  const chainId = mapDexChain(raw.chainId);
  if (!chainId) return null;
  const price = raw.priceUsd ? parseFloat(raw.priceUsd) : null;
  const change = raw.priceChange?.h24 != null ? parseFloat(raw.priceChange.h24) : null;
  const txns = raw.txns?.h24;
  return {
    chainId,
    address: raw.baseToken?.address || raw.address || '',
    name: raw.baseToken?.name || raw.name || 'Unknown',
    symbol: raw.baseToken?.symbol || raw.symbol || '???',
    price,
    priceChange24h: change,
    marketCap: raw.marketCap ?? raw.fdv ?? null,
    fdv: raw.fdv ?? null,
    liquidity: raw.liquidity?.usd ?? null,
    volume24h: raw.volume?.h24 ?? null,
    buys24h: txns?.buys ?? null,
    sells24h: txns?.sells ?? null,
    txns24h: txns ? (txns.buys ?? 0) + (txns.sells ?? 0) : null,
    pairAddress: raw.pairAddress || null,
    dexId: raw.dexId || null,
    url: raw.url || null,
    icon: raw.info?.imageUrl || null,
    websites: (raw.info?.websites || []).map((w: any) => w.url),
    socials: (raw.info?.socials || []).map((s: any) => ({ type: s.type, url: s.url })),
  };
}

// Search tokens — cached for 30s
export async function searchTokens(query: string): Promise<SearchResult[]> {
  if (!query.trim() || isSandboxed()) return [];
  return cacheGetOrCompute(CACHE_KEYS.search(query), async () => {
    try {
      const res = await fetch(`${DEXSCREENER_API}/latest/dex/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = await res.json();
      const pairs: any[] = data.pairs || [];
      return pairs.slice(0, 30).map((p: any) => {
        const chainId = mapDexChain(p.chainId);
        if (!chainId) return null;
        return {
          chainId,
          address: p.baseToken?.address || '',
          name: p.baseToken?.name || 'Unknown',
          symbol: p.baseToken?.symbol || '???',
          price: p.priceUsd ? parseFloat(p.priceUsd) : null,
          priceChange24h: p.priceChange?.h24 != null ? parseFloat(p.priceChange.h24) : null,
          volume24h: p.volume?.h24 ?? null,
          liquidity: p.liquidity?.usd ?? null,
          pairAddress: p.pairAddress || null,
          dexId: p.dexId || null,
        };
      }).filter(Boolean) as SearchResult[];
    } catch {
      return [];
    }
  }, TTL.SEARCH);
}

// Get token data by address — cached for 15s
export async function getTokenByAddress(chainId: ChainId, address: string): Promise<TokenData | null> {
  if (isSandboxed()) return null;
  const cacheKey = `token:${chainId}:${address}`;
  return cacheGetOrCompute(cacheKey, async () => {
    try {
      const res = await fetch(`${DEXSCREENER_API}/latest/dex/tokens/${address}`);
      if (!res.ok) return null;
      const data = await res.json();
      const pairs: any[] = data.pairs || [];
      const chainPairs = pairs.filter(p => mapDexChain(p.chainId) === chainId);
      if (chainPairs.length === 0 && pairs.length > 0) return parseToken(pairs[0]);
      chainPairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      return chainPairs.length > 0 ? parseToken(chainPairs[0]) : null;
    } catch {
      return null;
    }
  }, TTL.PRICE);
}

// Get trending tokens — cached for 1min
export async function getTrendingTokens(): Promise<TokenData[]> {
  if (isSandboxed()) return [];
  return cacheGetOrCompute(CACHE_KEYS.trending, async () => {
    try {
      const res = await fetch(`${DEXSCREENER_API}/token-profiles/latest/v1`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      const addresses: string[] = [];
      const seen = new Set<string>();
      for (const item of data) {
        if (!item.tokenAddress || seen.has(item.tokenAddress)) continue;
        seen.add(item.tokenAddress);
        addresses.push(item.tokenAddress);
        if (addresses.length >= 12) break;
      }
      const results = await Promise.allSettled(
        addresses.map(addr => fetch(`${DEXSCREENER_API}/latest/dex/tokens/${addr}`).then(r => r.json()))
      );
      const tokens: TokenData[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.pairs?.length > 0) {
          const sorted = result.value.pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
          const token = parseToken(sorted[0]);
          if (token && token.price != null) tokens.push(token);
        }
      }
      return tokens;
    } catch {
      return [];
    }
  }, TTL.TRENDING);
}

// Get token pairs
export async function getTokenPairs(chainId: ChainId, address: string): Promise<any[]> {
  try {
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/tokens/${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pairs || []).filter((p: any) => mapDexChain(p.chainId) === chainId);
  } catch {
    return [];
  }
}

// Track pools that returned 404 to avoid repeated GeckoTerminal calls
const failedPools = new Set<string>();

// Get OHLCV candles from GeckoTerminal — cached per timeframe
export async function getCandles(
  chainId: ChainId,
  poolAddress: string,
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' = '1h'
): Promise<CandleData[]> {
  const networkMap: Record<ChainId, string> = {
    bsc: 'bsc', solana: 'solana', base: 'base', robinhood: '',
  };
  const network = networkMap[chainId];
  if (!network || !poolAddress) return [];

  // Skip external calls in sandboxed preview (CORS/network blocked)
  if (isSandboxed()) return [];

  // Skip pools that already 404'd
  const poolKey = `${chainId}:${poolAddress}`;
  if (failedPools.has(poolKey)) return [];

  return cacheGetOrCompute(CACHE_KEYS.candles(chainId, poolAddress, timeframe), async () => {
    const tfMap: Record<string, string> = {
      '1m': 'minute', '5m': 'minute', '15m': 'minute',
      '1h': 'hour', '4h': 'hour', '1d': 'day', '1w': 'day',
    };
    const aggregateMap: Record<string, string> = {
      '1m': '1', '5m': '5', '15m': '15', '1h': '1', '4h': '4', '1d': '1', '1w': '7',
    };
    try {
      const res = await fetch(
        `${GECKOTERMINAL_API}/networks/${network}/pools/${poolAddress}/ohlcv/${tfMap[timeframe]}?aggregate=${aggregateMap[timeframe]}&limit=200`
      );
      if (!res.ok) {
        failedPools.add(poolKey);
        return [];
      }
      const data = await res.json();
      const ohlcvList = data.data?.attributes?.ohlcv_list;
      if (!Array.isArray(ohlcvList)) return [];
      return ohlcvList.map((c: number[]) => ({
        time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
      })).reverse();
    } catch {
      failedPools.add(poolKey);
      return [];
    }
  }, TTL.CANDLES);
}

// Recent trades — from indexed data when available
export async function getRecentTrades(chainId: ChainId, pairAddress: string): Promise<TradeData[]> {
  if (!pairAddress) return [];
  try {
    const chain = CHAINS[chainId];
    const network = chain.dexScreenerId;
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/pairs/${network}/${pairAddress}`);
    if (!res.ok) return [];
    // DexScreener doesn't return individual trades in free API
    return [];
  } catch {
    return [];
  }
}

// Holder data — requires chain-specific indexer
export async function getHolders(_chainId: ChainId, _address: string): Promise<HolderData[]> {
  return [];
}

// ── Price Validation ─────────────────────────────────────────

export interface PriceValidation {
  valid: boolean;
  price: number | null;
  warning: string | null;
  liquidityOk: boolean;
  tradeable: boolean;
}

/** Validate a token's price and liquidity before displaying. */
export async function validatePrice(chainId: ChainId, address: string): Promise<PriceValidation> {
  try {
    const token = await getTokenByAddress(chainId, address);
    if (!token) {
      return { valid: false, price: null, warning: 'TOKEN DATA UNAVAILABLE', liquidityOk: false, tradeable: false };
    }
    if (token.price === null) {
      return { valid: false, price: null, warning: 'PRICE DATA UNAVAILABLE', liquidityOk: false, tradeable: false };
    }

    const liquidityUsd = token.liquidity || 0;
    const volumeUsd = token.volume24h || 0;
    const liquidityOk = liquidityUsd > 1000; // minimum $1k liquidity
    const hasActivity = volumeUsd > 0 || (token.txns24h || 0) > 0;
    const tradeable = liquidityOk && hasActivity;

    let warning: string | null = null;
    if (!liquidityOk) warning = 'LOW LIQUIDITY';
    if (!hasActivity && liquidityOk) warning = 'NO RECENT ACTIVITY';

    return { valid: true, price: token.price, warning, liquidityOk, tradeable };
  } catch {
    return { valid: false, price: null, warning: 'DATA TEMPORARILY UNAVAILABLE', liquidityOk: false, tradeable: false };
  }
}