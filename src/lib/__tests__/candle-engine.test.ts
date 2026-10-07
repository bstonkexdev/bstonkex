// BSTONKEX Candle Engine Tests — real candle generation from trades
import { describe, it, expect, beforeEach } from 'vitest';
import { processTrade, getCandles, clearCandles, type TradeEvent } from '../engine/candle-engine';

describe('Candle Engine', () => {
  beforeEach(() => {
    clearCandles();
  });

  describe('processTrade', () => {
    it('creates a candle from a single trade', () => {
      const trade: TradeEvent = { price: 100, amountUsd: 1000, timestamp: Date.now(), side: 'buy' };
      processTrade('bsc', '0xtoken', trade);
      const candles = getCandles('bsc', '0xtoken', '1m');
      expect(candles.length).toBeGreaterThan(0);
      const last = candles[candles.length - 1];
      expect(last.open).toBe(100);
      expect(last.high).toBe(100);
      expect(last.low).toBe(100);
      expect(last.close).toBe(100);
      expect(last.volume).toBe(1000);
      expect(last.tradeCount).toBe(1);
    });

    it('updates candle with multiple trades in same interval', () => {
      const now = Date.now();
      processTrade('bsc', '0xtoken', { price: 100, amountUsd: 500, timestamp: now, side: 'buy' });
      processTrade('bsc', '0xtoken', { price: 110, amountUsd: 600, timestamp: now + 1000, side: 'sell' });
      processTrade('bsc', '0xtoken', { price: 95, amountUsd: 400, timestamp: now + 2000, side: 'buy' });

      const candles = getCandles('bsc', '0xtoken', '1m');
      const last = candles[candles.length - 1];
      expect(last.open).toBe(100);
      expect(last.high).toBe(110);
      expect(last.low).toBe(95);
      expect(last.close).toBe(95);
      expect(last.volume).toBe(1500);
      expect(last.tradeCount).toBe(3);
    });

    it('creates separate candles for different intervals', () => {
      const trade: TradeEvent = { price: 100, amountUsd: 1000, timestamp: Date.now(), side: 'buy' };
      processTrade('bsc', '0xtoken', trade);

      const m1 = getCandles('bsc', '0xtoken', '1m');
      const m5 = getCandles('bsc', '0xtoken', '5m');
      const h1 = getCandles('bsc', '0xtoken', '1h');

      expect(m1.length).toBeGreaterThan(0);
      expect(m5.length).toBeGreaterThan(0);
      expect(h1.length).toBeGreaterThan(0);
    });

    it('separates tokens by chain and address', () => {
      processTrade('bsc', '0xA', { price: 100, amountUsd: 500, timestamp: Date.now(), side: 'buy' });
      processTrade('base', '0xB', { price: 200, amountUsd: 800, timestamp: Date.now(), side: 'sell' });

      const candlesA = getCandles('bsc', '0xA', '1m');
      const candlesB = getCandles('base', '0xB', '1m');

      expect(candlesA.length).toBeGreaterThan(0);
      expect(candlesB.length).toBeGreaterThan(0);
      expect(candlesA[candlesA.length - 1].close).toBe(100);
      expect(candlesB[candlesB.length - 1].close).toBe(200);
    });
  });

  describe('getCandles', () => {
    it('returns empty array for unknown token', () => {
      expect(getCandles('bsc', '0xunknown', '1m')).toEqual([]);
    });
  });

  describe('clearCandles', () => {
    it('clears all candle data', () => {
      processTrade('bsc', '0xtoken', { price: 100, amountUsd: 500, timestamp: Date.now(), side: 'buy' });
      expect(getCandles('bsc', '0xtoken', '1m').length).toBeGreaterThan(0);
      clearCandles();
      expect(getCandles('bsc', '0xtoken', '1m')).toEqual([]);
    });
  });
});