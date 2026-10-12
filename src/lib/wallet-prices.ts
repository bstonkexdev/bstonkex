// Cupcak8 Swap Wallet Prices — live USD prices + 24h change from CoinGecko.
// Cached briefly; when the provider is unavailable/rate-limited the last known prices are
// passed through with an explicit stale/error status so the UI can label them honestly.
import { cacheGet, cacheSet } from './engine/cache';

const API = 'https://api.coingecko.com/api/v3';
const KEY = 'wallet:prices';
const TTL = 60_000;
const STALE_TTL = 600_000;

const IDS = [
  'bitcoin', 'ethereum', 'binancecoin', 'solana', 'tether', 'usd-coin', 'dai',
  'wbnb', 'wrapped-bitcoin', 'binance-usd', 'hyperliquid',
  'dogecoin', 'ripple', 'cardano', 'tron',
];

export interface TokenPrice {
  priceUsd: number;
  change24h: number | null;
  at: number;
}

export type PriceStatus = 'ok' | 'stale' | 'rate_limited' | 'error' | 'unavailable';

export interface WalletPrices {
  prices: Record<string, TokenPrice>;
  status: PriceStatus;
  fetchedAt: number | null;
  error?: string;
}

let inFlight: Promise<WalletPrices> | null = null;

export async function getWalletPrices(): Promise<WalletPrices> {
  const cached = cacheGet<WalletPrices>(KEY);
  if (cached && !cached.stale) return cached.data;
  if (inFlight) return inFlight;

  const prev = cached?.data ?? { prices: {}, status: 'unavailable' as PriceStatus, fetchedAt: null };

  inFlight = (async (): Promise<WalletPrices> => {
    try {
      const res = await fetch(
        `${API}/coins/markets?vs_currency=usd&ids=${IDS.join(',')}` +
        `&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`,
        { signal: AbortSignal.timeout(12_000) },
      );
      if (res.status === 429) {
        return { ...prev, status: Object.keys(prev.prices).length ? 'stale' : 'rate_limited', error: 'RATE LIMITED BY PRICE PROVIDER' };
      }
      if (!res.ok) {
        return { ...prev, status: Object.keys(prev.prices).length ? 'stale' : 'error', error: `PRICE PROVIDER ERROR ${res.status}` };
      }
      const rows = await res.json();
      if (!Array.isArray(rows)) {
        return { ...prev, status: Object.keys(prev.prices).length ? 'stale' : 'error', error: 'UNEXPECTED PRICE RESPONSE' };
      }
      const now = Date.now();
      const prices: Record<string, TokenPrice> = {};
      for (const r of rows) {
        if (!r?.id || typeof r.current_price !== 'number') continue;
        prices[r.id] = {
          priceUsd: r.current_price,
          change24h: typeof r.price_change_percentage_24h === 'number' ? r.price_change_percentage_24h : null,
          at: now,
        };
      }
      const result: WalletPrices = { prices, status: 'ok', fetchedAt: now };
      cacheSet(KEY, result, TTL, STALE_TTL);
      return result;
    } catch {
      return {
        ...prev,
        status: Object.keys(prev.prices).length ? 'stale' : 'unavailable',
        error: 'PRICE PROVIDER UNREACHABLE',
      };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** True when the given price snapshot is fresh enough to label LIVE. */
export function isPriceFresh(p: TokenPrice | undefined | null, maxAgeMs = 120_000): boolean {
  return !!p && Date.now() - p.at <= maxAgeMs;
}
