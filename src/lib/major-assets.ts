// Cupcak8 Swap Major Asset Registry — real reference assets + verified on-chain execution routes
//
// Identity model:
//   - Every asset is keyed by its CANONICAL CoinGecko asset id (e.g. "bitcoin"), never by ticker alone.
//   - A CoinGecko id is NOT a contract address. Reference prices / charts come from CoinGecko.
//   - Execution routes point at REAL wrapped / canonical token contracts per chain
//     (verified against DexScreener: BTCB, WBNB, WETH, WSOL, BSC-USD, native USDC/SPL mints).
//   - Native coins (BTC/ETH/BNB/SOL) never get a fake contract — they trade through their real
//     wrapped representation only where a live market exists.
//   - A reference USD price is NOT proof of a tradable pair: BUY/SELL stays disabled unless a
//     route exists for the selected chain AND the quote engine returns a real, valid quote.

import type { ChainId } from './config';
import { cacheGet, cacheSet } from './engine/cache';
import type { CandleData } from './market';

export const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// ── Types ─────────────────────────────────────────────────────

export interface MajorRoute {
  chainId: ChainId;
  /** Real on-chain token contract (wrapped/canonical/bridged) — never a CoinGecko id. */
  address: string;
  /** Symbol of the on-chain representation actually traded (e.g. BTCB, WETH, WSOL). */
  symbol: string;
  /** Human label for the on-chain representation. */
  label: string;
  kind: 'wrapped-native' | 'canonical-token' | 'bridged';
}

export interface MajorAsset {
  /** Canonical CoinGecko asset id. */
  id: string;
  symbol: string;
  name: string;
  /** Network used when opening the asset page. */
  nativeChain: ChainId;
  /** True for chain-native coins (BTC/ETH/BNB/SOL) — shown as native-asset pages. */
  nativeCoin: boolean;
  /** Verified execution routes per supported chain. Missing chain = reference only. */
  routes: Partial<Record<ChainId, MajorRoute>>;
}

export type ProviderStatus = 'ok' | 'rate_limited' | 'error' | 'unavailable';

export interface MajorQuote {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  price: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  rank: number | null;
  circulatingSupply: number | null;
  ath: number | null;
  lastUpdated: number | null;
}

export interface MajorQuotesResult {
  status: ProviderStatus;
  quotes: Record<string, MajorQuote>;
  error?: string;
  fetchedAt: number | null;
}

export type MajorRange = '24h' | '7d' | '30d' | '90d' | '1y';

export interface MajorCandleResult {
  status: ProviderStatus | 'empty';
  candles: CandleData[];
  /** Actual candle spacing detected from provider data (ms). */
  intervalMs: number | null;
  error?: string;
}

// ── Registry ──────────────────────────────────────────────────

export const MAJOR_ASSETS: MajorAsset[] = [
  {
    id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', nativeChain: 'bsc', nativeCoin: true,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
        symbol: 'BTCB', label: 'BTCB Token (Binance-Peg BTC)', kind: 'wrapped-native',
      },
    },
  },
  {
    id: 'ethereum', symbol: 'ETH', name: 'Ethereum', nativeChain: 'base', nativeCoin: true,
    routes: {
      base: {
        chainId: 'base',
        address: '0x4200000000000000000000000000000000000006',
        symbol: 'WETH', label: 'Wrapped Ether', kind: 'wrapped-native',
      },
      bsc: {
        chainId: 'bsc',
        address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
        symbol: 'ETH', label: 'Binance-Peg Ethereum', kind: 'bridged',
      },
    },
  },
  {
    id: 'binancecoin', symbol: 'BNB', name: 'BNB', nativeChain: 'bsc', nativeCoin: true,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
        symbol: 'WBNB', label: 'Wrapped BNB', kind: 'wrapped-native',
      },
    },
  },
  {
    id: 'solana', symbol: 'SOL', name: 'Solana', nativeChain: 'solana', nativeCoin: true,
    routes: {
      solana: {
        chainId: 'solana',
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'WSOL', label: 'Wrapped SOL', kind: 'wrapped-native',
      },
    },
  },
  {
    id: 'tether', symbol: 'USDT', name: 'Tether', nativeChain: 'bsc', nativeCoin: false,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0x55d398326f99059fF775485246999027B3197955',
        symbol: 'USDT', label: 'BSC-USD (Tether USD)', kind: 'canonical-token',
      },
      solana: {
        chainId: 'solana',
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT', label: 'Tether USD (SPL)', kind: 'canonical-token',
      },
    },
  },
  {
    id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', nativeChain: 'base', nativeCoin: false,
    routes: {
      base: {
        chainId: 'base',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC', label: 'USD Coin (Native)', kind: 'canonical-token',
      },
      bsc: {
        chainId: 'bsc',
        address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
        symbol: 'USDC', label: 'Binance-Peg USD Coin', kind: 'bridged',
      },
      solana: {
        chainId: 'solana',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC', label: 'USD Coin (SPL)', kind: 'canonical-token',
      },
    },
  },
  {
    id: 'ripple', symbol: 'XRP', name: 'XRP', nativeChain: 'bsc', nativeCoin: false,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
        symbol: 'XRP', label: 'Binance-Peg XRP', kind: 'bridged',
      },
    },
  },
  {
    id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', nativeChain: 'bsc', nativeCoin: false,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0xba2ae424d960c26247dd6c32edc70b295c744c43',
        symbol: 'DOGE', label: 'Binance-Peg Dogecoin', kind: 'bridged',
      },
    },
  },
  {
    id: 'cardano', symbol: 'ADA', name: 'Cardano', nativeChain: 'bsc', nativeCoin: false,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
        symbol: 'ADA', label: 'Binance-Peg Cardano', kind: 'bridged',
      },
    },
  },
  {
    id: 'tron', symbol: 'TRX', name: 'TRON', nativeChain: 'bsc', nativeCoin: false,
    routes: {
      bsc: {
        chainId: 'bsc',
        address: '0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B',
        symbol: 'TRX', label: 'Binance-Peg TRON', kind: 'bridged',
      },
    },
  },
];

const BY_ID = new Map<string, MajorAsset>(MAJOR_ASSETS.map(a => [a.id, a]));

/** Look up an asset by its canonical CoinGecko id. */
export function getMajorAsset(id: string | null | undefined): MajorAsset | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Verified execution route for this asset on a specific chain (null = reference only). */
export function getMajorRoute(id: string | null | undefined, chainId: ChainId): MajorRoute | null {
  const asset = getMajorAsset(id);
  return asset?.routes[chainId] ?? null;
}

/** All verified execution routes for an asset. */
export function getMajorRoutes(id: string | null | undefined): MajorRoute[] {
  const asset = getMajorAsset(id);
  if (!asset) return [];
  return Object.values(asset.routes) as MajorRoute[];
}

/** True when this id is a registered canonical reference asset. */
export function isMajorAssetId(id: string | null | undefined): boolean {
  return !!getMajorAsset(id);
}

// ── Reference quotes (CoinGecko /coins/markets) ───────────────

const QUOTES_KEY = 'major:quotes';
const QUOTES_TTL = 30_000;
const QUOTES_STALE_TTL = 300_000;

function mapQuote(raw: any): MajorQuote {
  return {
    id: raw.id,
    symbol: (raw.symbol || '').toUpperCase(),
    name: raw.name || raw.symbol || 'Unknown',
    image: raw.image || null,
    price: typeof raw.current_price === 'number' ? raw.current_price : null,
    change24h: typeof raw.price_change_percentage_24h === 'number' ? raw.price_change_percentage_24h : null,
    change7d: typeof raw.price_change_percentage_7d_in_currency === 'number' ? raw.price_change_percentage_7d_in_currency : null,
    marketCap: typeof raw.market_cap === 'number' ? raw.market_cap : null,
    volume24h: typeof raw.total_volume === 'number' ? raw.total_volume : null,
    high24h: typeof raw.high_24h === 'number' ? raw.high_24h : null,
    low24h: typeof raw.low_24h === 'number' ? raw.low_24h : null,
    rank: typeof raw.market_cap_rank === 'number' ? raw.market_cap_rank : null,
    circulatingSupply: typeof raw.circulating_supply === 'number' ? raw.circulating_supply : null,
    ath: typeof raw.ath === 'number' ? raw.ath : null,
    lastUpdated: raw.last_updated ? Date.parse(raw.last_updated) : null,
  };
}

/**
 * Fetch real reference quotes (price, logo, market stats) for all major assets.
 * Never fabricates data: on provider failure the previous cached quotes are passed
 * through with an explicit non-ok status so the UI can label them.
 */
export async function fetchMajorQuotes(): Promise<MajorQuotesResult> {
  const cached = cacheGet<MajorQuotesResult>(QUOTES_KEY);
  if (cached && !cached.stale) return cached.data;

  const prev = cached?.data ?? { status: 'unavailable' as ProviderStatus, quotes: {}, fetchedAt: null };
  const ids = MAJOR_ASSETS.map(a => a.id).join(',');

  try {
    const res = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}` +
      `&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h,7d`
    );
    if (res.status === 429) {
      return { ...prev, status: 'rate_limited', error: 'RATE LIMITED BY DATA PROVIDER' };
    }
    if (!res.ok) {
      return { ...prev, status: 'error', error: `PROVIDER ERROR ${res.status}` };
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
      return { ...prev, status: 'error', error: 'UNEXPECTED PROVIDER RESPONSE' };
    }
    const quotes: Record<string, MajorQuote> = {};
    for (const raw of rows) {
      if (raw?.id) quotes[raw.id] = mapQuote(raw);
    }
    const result: MajorQuotesResult = { status: 'ok', quotes, fetchedAt: Date.now() };
    cacheSet(QUOTES_KEY, result, QUOTES_TTL, QUOTES_STALE_TTL);
    return result;
  } catch {
    return { ...prev, status: 'unavailable', error: 'DATA PROVIDER UNREACHABLE' };
  }
}

// ── Reference OHLC candles (CoinGecko /coins/{id}/ohlc) ───────

/**
 * The reference provider serves OHLC by lookback range and picks the candle
 * granularity itself, so reference charts are offered as ranges (verified live:
 * 24H→30M candles, 7D/30D→4H candles, 90D/1Y→4D candles). The actual candle
 * spacing returned by the provider is detected and shown in the chart header.
 */
export const MAJOR_RANGES: { key: MajorRange; label: string; days: string }[] = [
  { key: '24h', label: '24H', days: '1' },
  { key: '7d', label: '7D', days: '7' },
  { key: '30d', label: '30D', days: '30' },
  { key: '90d', label: '90D', days: '90' },
  { key: '1y', label: '1Y', days: '365' },
];

const RANGE_DAYS: Record<MajorRange, string> = {
  '24h': '1', '7d': '7', '30d': '30', '90d': '90', '1y': '365',
};

/** Map any chart range selection to one actually served by the reference provider. */
export function normalizeMajorRange(r: string): MajorRange {
  return (Object.keys(RANGE_DAYS) as string[]).includes(r) ? (r as MajorRange) : '7d';
}

function detectIntervalMs(candles: CandleData[]): number | null {
  if (candles.length < 2) return null;
  const diffs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const d = (candles[i].time - candles[i - 1].time) * 1000;
    if (d > 0) diffs.push(d);
  }
  if (diffs.length === 0) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

const OHLC_TTL = 60_000;

/**
 * Load real OHLC history for a canonical asset from CoinGecko.
 * Candles are returned exactly as served — nothing is synthesized. Volume is not
 * provided by the OHLC endpoint and is returned as 0 (chart hides volume bars).
 */
export async function fetchMajorOhlc(id: string, range: string): Promise<MajorCandleResult> {
  const asset = getMajorAsset(id);
  if (!asset) return { status: 'error', candles: [], intervalMs: null, error: 'UNKNOWN ASSET' };

  const r = normalizeMajorRange(range);
  const key = `major:ohlc:${id}:${r}`;
  const cached = cacheGet<MajorCandleResult>(key);
  if (cached && !cached.stale) return cached.data;

  try {
    const res = await fetch(`${COINGECKO_API}/coins/${id}/ohlc?vs_currency=usd&days=${RANGE_DAYS[r]}`);
    if (res.status === 429) {
      return { status: 'rate_limited', candles: [], intervalMs: null, error: 'RATE LIMITED BY DATA PROVIDER' };
    }
    if (!res.ok) {
      return { status: 'error', candles: [], intervalMs: null, error: `PROVIDER ERROR ${res.status}` };
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { status: 'empty', candles: [], intervalMs: null };
    }
    const candles: CandleData[] = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const [t, o, h, l, c] = row.map(Number);
      if (![t, o, h, l, c].every(n => isFinite(n))) continue;
      // CoinGecko OHLC timestamps are milliseconds
      candles.push({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: 0 });
    }
    if (candles.length === 0) {
      return { status: 'empty', candles: [], intervalMs: null };
    }
    const result: MajorCandleResult = { status: 'ok', candles, intervalMs: detectIntervalMs(candles) };
    cacheSet(key, result, OHLC_TTL);
    return result;
  } catch {
    return { status: 'unavailable', candles: [], intervalMs: null, error: 'DATA PROVIDER UNREACHABLE' };
  }
}

/** Format a detected candle interval as a short label (e.g. "30M", "4H", "1D"). */
export function formatIntervalLabel(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)}M`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr * 10) / 10}H`;
  const d = hr / 24;
  return `${Math.round(d * 10) / 10}D`;
}
