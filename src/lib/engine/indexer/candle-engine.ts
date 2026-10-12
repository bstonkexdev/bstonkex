// Cupcak8 Swap Indexer — Candle Engine
// Generates candles from REAL normalized trades. No synthetic data.

import type { Candle, CandleInterval, NormalizedTrade } from './types';
import { getCandles, upsertCandle, getTradesByMarket } from './db';

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function getCandleOpenTime(timestamp: number, interval: CandleInterval): number {
  const ms = INTERVAL_MS[interval];
  return Math.floor(timestamp / ms) * ms;
}

export function buildCandleId(marketId: string, interval: CandleInterval, openTime: number): string {
  return `${marketId}:${interval}:${openTime}`;
}

export async function updateCandles(
  marketId: string,
  trade: NormalizedTrade,
  intervals: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'],
): Promise<void> {
  for (const interval of intervals) {
    const openTime = getCandleOpenTime(trade.timestamp, interval);
    const id = buildCandleId(marketId, interval, openTime);
    const price = trade.priceUsd || trade.price;
    if (!price || price === 0) continue;

    const existing = (await getCandles(marketId, interval, 1))
      .find(c => c.id === id);

    if (existing) {
      // Update existing candle
      const updated: Candle = {
        ...existing,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
        volume: existing.volume + (trade.amountUsd || 0),
        tradeCount: existing.tradeCount + 1,
        buyVolume: existing.buyVolume + (trade.side === 'BUY' ? (trade.amountUsd || 0) : 0),
        sellVolume: existing.sellVolume + (trade.side === 'SELL' ? (trade.amountUsd || 0) : 0),
        finalized: false,
      };
      await upsertCandle(updated);
    } else {
      // Create new candle
      const candle: Candle = {
        id,
        marketId,
        interval,
        openTimestamp: openTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: trade.amountUsd || 0,
        tradeCount: 1,
        buyVolume: trade.side === 'BUY' ? (trade.amountUsd || 0) : 0,
        sellVolume: trade.side === 'SELL' ? (trade.amountUsd || 0) : 0,
        finalized: false,
      };
      await upsertCandle(candle);
    }
  }
}

/** Finalize candles that have passed their interval boundary */
export async function finalizeCandles(marketId: string, interval: CandleInterval): Promise<number> {
  const now = Date.now();
  const ms = INTERVAL_MS[interval];
  const cutoff = getCandleOpenTime(now, interval); // current candle start
  const candles = await getCandles(marketId, interval, 500);

  let finalized = 0;
  for (const c of candles) {
    if (!c.finalized && c.openTimestamp < cutoff) {
      await upsertCandle({ ...c, finalized: true });
      finalized++;
    }
  }
  return finalized;
}
