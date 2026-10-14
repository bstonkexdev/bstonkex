/**
 * BSTONKEX Chart Engine — OHLCV Candle Aggregation Service
 *
 * Captures incoming DEX swap logs from all chains, normalizes trade payloads,
 * and aggregates into OHLCV buckets across 7 intervals (1s, 1m, 5m, 15m, 1h, 4h, 1d).
 *
 * Maintains active candle state in-memory (Map) for zero-latency UI fetches.
 * Historical candles retained per token:interval (max 1000 per bucket).
 *
 * Integrates with server.ts WS gateway for real-time candle_tick broadcasts.
 */

// ── Types ──────────────────────────────────────────────────────

export type CandleInterval = '1s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface RawTrade {
  mint: string;        // Token contract address
  chain: string;       // 'solana' | 'bsc' | 'base' | etc.
  priceUsd: number;    // Trade price in USD
  volumeUsd: number;   // Trade volume in USD
  side: 'buy' | 'sell';
  timestamp: number;   // Unix seconds
  txHash?: string;
  maker?: string;      // Trader wallet
  isSmartMoney?: boolean;
  isDev?: boolean;
}

export interface Candle {
  time: number;        // Interval start (Unix seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  trades: number;
  status: 'live' | 'final';
}

export interface CandleTick {
  mint: string;
  interval: CandleInterval;
  candle: Candle;
  isNew: boolean;      // true = new candle opened, false = updated existing
}

// ── Interval definitions (seconds) ─────────────────────────────

const INTERVAL_SECS: Record<CandleInterval, number> = {
  '1s': 1,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

const ALL_INTERVALS: CandleInterval[] = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

// ── In-memory candle store ─────────────────────────────────────
// Key: `${mint}:${interval}` → Candle[]
// Max 1000 candles per key (oldest evicted on overflow)

const MAX_CANDLES_PER_KEY = 1000;
const candleStore = new Map<string, Candle[]>();

// Active candle tracking (latest open candle per mint:interval)
const activeCandles = new Map<string, Candle>();

// ── External listeners (server.ts wires WS broadcast here) ─────

type TickListener = (tick: CandleTick) => void;
const tickListeners: TickListener[] = [];

export function onCandleTick(listener: TickListener): () => void {
  tickListeners.push(listener);
  return () => {
    const idx = tickListeners.indexOf(listener);
    if (idx >= 0) tickListeners.splice(idx, 1);
  };
}

function emitTick(tick: CandleTick): void {
  for (const listener of tickListeners) {
    try { listener(tick); } catch { /* swallow */ }
  }
}

// ── Core aggregation ───────────────────────────────────────────

function floorTime(ts: number, intervalSecs: number): number {
  return Math.floor(ts / intervalSecs) * intervalSecs;
}

function storeKey(mint: string, interval: CandleInterval): string {
  return `${mint}:${interval}`;
}

function getCandleArray(mint: string, interval: CandleInterval): Candle[] {
  const key = storeKey(mint, interval);
  let arr = candleStore.get(key);
  if (!arr) {
    arr = [];
    candleStore.set(key, arr);
  }
  return arr;
}

function getOrCreateActive(mint: string, interval: CandleInterval, time: number, price: number): Candle {
  const key = storeKey(mint, interval);
  const existing = activeCandles.get(key);

  // If active candle exists and trade falls within it, return it
  if (existing && time >= existing.time && time < existing.time + INTERVAL_SECS[interval]) {
    return existing;
  }

  // Finalize previous candle if it exists
  if (existing) {
    existing.status = 'final';
  }

  // Create new candle
  const newCandle: Candle = {
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 0,
    buyVolume: 0,
    sellVolume: 0,
    trades: 0,
    status: 'live',
  };

  activeCandles.set(key, newCandle);

  // Add to history
  const arr = getCandleArray(mint, interval);
  arr.push(newCandle);

  // Evict oldest if over limit
  if (arr.length > MAX_CANDLES_PER_KEY) {
    arr.splice(0, arr.length - MAX_CANDLES_PER_KEY);
  }

  return newCandle;
}

// ── Public API: Ingest a raw trade ─────────────────────────────

export function ingestTrade(trade: RawTrade): void {
  const { mint, priceUsd, volumeUsd, side, timestamp } = trade;

  if (!mint || !priceUsd || !isFinite(priceUsd) || priceUsd <= 0) return;
  if (!timestamp || timestamp < 1600000000) return; // Sanity: after 2020

  for (const interval of ALL_INTERVALS) {
    const intervalSecs = INTERVAL_SECS[interval];
    const candleTime = floorTime(timestamp, intervalSecs);
    const candle = getOrCreateActive(mint, interval, candleTime, priceUsd);

    // Update OHLCV
    candle.high = Math.max(candle.high, priceUsd);
    candle.low = Math.min(candle.low, priceUsd);
    candle.close = priceUsd;
    candle.volume += volumeUsd;
    if (side === 'buy') candle.buyVolume += volumeUsd;
    else candle.sellVolume += volumeUsd;
    candle.trades += 1;

    // Emit tick
    const key = storeKey(mint, interval);
    const isNew = activeCandles.get(key) !== candle;
    emitTick({ mint, interval, candle: { ...candle }, isNew });
  }

  // Check limit/TP/SL orders against this price tick (1m interval only to avoid duplicate triggers)
  try {
    const { processPriceTickForOrders } = require('./limit-order-engine.js');
    processPriceTickForOrders(mint, priceUsd).catch(() => {});
  } catch { /* limit-order-engine may not be loaded */ }
}

// ── Public API: Query candles ──────────────────────────────────

export function getCandles(
  mint: string,
  interval: CandleInterval,
  limit = 500,
): Candle[] {
  const arr = getCandleArray(mint, interval);
  const start = Math.max(0, arr.length - limit);
  return arr.slice(start).map(c => ({ ...c })); // Return copies
}

export function getLatestCandle(mint: string, interval: CandleInterval): Candle | null {
  const key = storeKey(mint, interval);
  const active = activeCandles.get(key);
  return active ? { ...active } : null;
}

// ── Public API: Stats ──────────────────────────────────────────

export interface ChartEngineStats {
  totalTokens: number;
  totalCandles: number;
  activeIntervals: number;
  memoryBytes: number;
}

export function getChartEngineStats(): ChartEngineStats {
  let totalCandles = 0;
  const tokens = new Set<string>();

  for (const [key, arr] of candleStore) {
    totalCandles += arr.length;
    tokens.add(key.split(':')[0]);
  }

  // Rough memory estimate: 8 fields × 8 bytes × total candles
  const memoryBytes = totalCandles * 64;

  return {
    totalTokens: tokens.size,
    totalCandles,
    activeIntervals: ALL_INTERVALS.length,
    memoryBytes,
  };
}

// ── Public API: Aggregate existing trade data ──────────────────
// Called on boot to backfill from trenches-store

export function backfillFromTrades(trades: Array<{ mint: string; chain: string; priceUsd: number; volumeUsd: number; side: 'buy' | 'sell'; timestamp: number }>): number {
  let count = 0;
  // Sort oldest first
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  for (const t of sorted) {
    ingestTrade(t);
    count++;
  }
  return count;
}

export { ALL_INTERVALS, INTERVAL_SECS };