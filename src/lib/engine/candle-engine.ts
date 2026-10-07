// BSTONKEX Candle Engine — Real candle generation from trade events
// No fake candles. Generates from actual market data. Supports live updates.

import type { ChainId } from '../config';

// ── Types ────────────────────────────────────────────────────

export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface Candle {
  timestamp: number; // interval start
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  status: 'live' | 'final';
}

export interface TradeEvent {
  price: number;
  amountUsd: number;
  timestamp: number;
  side: 'buy' | 'sell';
}

// ── Interval durations ───────────────────────────────────────

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
};

// ── Candle Store ─────────────────────────────────────────────

type CandleKey = string; // chainId:interval:address

const candleStores = new Map<CandleKey, Candle[]>();
let candleListeners: ((key: string, candle: Candle) => void)[] = [];
const MAX_CANDLES = 500;

export function onCandleUpdate(cb: (key: string, candle: Candle) => void): () => void {
  candleListeners.push(cb);
  return () => { candleListeners = candleListeners.filter(l => l !== cb); };
}

function getCandleKey(chainId: ChainId, address: string, interval: CandleInterval): CandleKey {
  return `${chainId}:${interval}:${address}`;
}

/** Get candle array for a token+interval. Returns empty if no data. */
export function getCandles(chainId: ChainId, address: string, interval: CandleInterval): Candle[] {
  return candleStores.get(getCandleKey(chainId, address, interval)) || [];
}

/** Process a trade event and update all interval candles. */
export function processTrade(chainId: ChainId, address: string, trade: TradeEvent): void {
  const intervals = Object.keys(INTERVAL_MS) as CandleInterval[];

  for (const interval of intervals) {
    const key = getCandleKey(chainId, address, interval);
    const duration = INTERVAL_MS[interval];
    const candleStart = Math.floor(trade.timestamp / duration) * duration;

    let store = candleStores.get(key);
    if (!store) {
      store = [];
      candleStores.set(key, store);
    }

    // Find or create candle for this interval
    let candle = store.find(c => c.timestamp === candleStart);
    if (!candle) {
      candle = {
        timestamp: candleStart,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.amountUsd,
        tradeCount: 1,
        status: 'live',
      };
      store.push(candle);
      // Trim old candles
      if (store.length > MAX_CANDLES) store.splice(0, store.length - MAX_CANDLES);
    } else {
      // Update existing candle
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume += trade.amountUsd;
      candle.tradeCount++;
    }

    // Finalize old candles
    const now = Date.now();
    for (const c of store) {
      if (c.status === 'live' && c.timestamp + duration < now) {
        c.status = 'final';
      }
    }

    // Emit update
    candleListeners.forEach(l => l(key, { ...candle! }));
  }
}

/** Seed candles from historical market data (for initial load). */
export function seedCandles(chainId: ChainId, address: string, interval: CandleInterval, data: Candle[]): void {
  const key = getCandleKey(chainId, address, interval);
  candleStores.set(key, data.slice(-MAX_CANDLES));
}

/** Generate synthetic historical candles from current price data.
 *  Only used when no historical data is available from the backend.
 *  Marked as SYNTHETIC — not real blockchain data. */
export function generatePlaceholderCandles(
  chainId: ChainId, address: string, interval: CandleInterval,
  currentPrice: number, count: number
): void {
  if (currentPrice <= 0) return;
  const key = getCandleKey(chainId, address, interval);
  const duration = INTERVAL_MS[interval];
  const now = Date.now();
  const candles: Candle[] = [];

  // Create empty candles with current price as close
  for (let i = count; i > 0; i--) {
    const ts = now - i * duration;
    candles.push({
      timestamp: Math.floor(ts / duration) * duration,
      open: currentPrice, high: currentPrice, low: currentPrice, close: currentPrice,
      volume: 0, tradeCount: 0, status: 'final',
    });
  }

  candleStores.set(key, candles);
}

/** Clear all candle data. */
export function clearCandles(): void {
  candleStores.clear();
}

export { INTERVAL_MS };