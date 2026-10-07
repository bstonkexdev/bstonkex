// BSTONKEX Market Database — Persistent market data storage via Gitlawb SDK
// Stores indexed trades, candle history, token registry, pair data.

import { gitlawb } from '../gitlawb';
import type { ChainId } from '../config';
import { addLog, makeLog, updateComponent } from './infra-state';
import type { Candle, CandleInterval } from './candle-engine';
import { seedCandles } from './candle-engine';

// ── Collections ──────────────────────────────────────────────

const indexedTrades = gitlawb.db.collection<{
  chainId: string; txHash: string; blockNumber: number;
  tokenAddress: string; pair: string; side: string;
  amountIn: string; amountOut: string; priceUsd: number;
  valueUsd: number; wallet: string; dex: string; timestamp: string;
}>('indexed_trades');

const candleStore = gitlawb.db.collection<{
  chainId: string; address: string; interval: string;
  timestamp: number; open: number; high: number; low: number;
  close: number; volume: number; tradeCount: number; status: string;
}>('candle_store');

const tokenRegistry = gitlawb.db.collection<{
  chainId: string; address: string; symbol: string; name: string;
  decimals: number; logoUrl: string | null; verified: boolean;
  firstSeen: string; lastTrade: string | null;
}>('token_registry');

// ── Indexed Trade Operations ─────────────────────────────────

export async function storeIndexedTrade(trade: {
  chainId: ChainId; txHash: string; blockNumber: number;
  tokenAddress: string; pair: string; side: 'buy' | 'sell';
  amountIn: string; amountOut: string; priceUsd: number;
  valueUsd: number; wallet: string; dex: string;
}): Promise<void> {
  try {
    await indexedTrades.create({
      ...trade,
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical */ }
}

export async function getRecentTrades(chainId?: ChainId, limit = 50) {
  try {
    const { records } = await indexedTrades.list({ limit });
    let filtered = records;
    if (chainId) filtered = filtered.filter(r => r.data.chainId === chainId);
    return filtered.map(r => ({
      ...r.data,
      timestamp: new Date(r.data.timestamp).getTime(),
    })).sort((a, b) => b.timestamp - a.timestamp);
  } catch { return []; }
}

// ── Candle Persistence ───────────────────────────────────────

export async function persistCandles(chainId: ChainId, address: string, interval: CandleInterval, candles: Candle[]): Promise<void> {
  try {
    for (const c of candles.slice(-100)) { // Store last 100 per interval
      await candleStore.create({
        chainId, address, interval,
        timestamp: c.timestamp, open: c.open, high: c.high, low: c.low,
        close: c.close, volume: c.volume, tradeCount: c.tradeCount, status: c.status,
      });
    }
  } catch { /* non-critical */ }
}

export async function loadCandles(chainId: ChainId, address: string, interval: CandleInterval): Promise<Candle[]> {
  try {
    const { records } = await candleStore.list({ limit: 500 });
    const filtered = records
      .filter(r => r.data.chainId === chainId && r.data.address === address && r.data.interval === interval)
      .map(r => ({
        timestamp: r.data.timestamp,
        open: r.data.open, high: r.data.high, low: r.data.low, close: r.data.close,
        volume: r.data.volume, tradeCount: r.data.tradeCount,
        status: r.data.status as 'live' | 'final',
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    if (filtered.length > 0) seedCandles(chainId, address, interval, filtered);
    return filtered;
  } catch { return []; }
}

// ── Token Registry ───────────────────────────────────────────

export async function registerToken(token: {
  chainId: ChainId; address: string; symbol: string; name: string;
  decimals: number; logoUrl?: string | null; verified?: boolean;
}): Promise<void> {
  try {
    const { records } = await tokenRegistry.list({ limit: 500 });
    const existing = records.find(r => r.data.address === token.address && r.data.chainId === token.chainId);
    if (existing) return; // Already registered
    await tokenRegistry.create({
      ...token,
      logoUrl: token.logoUrl || null,
      verified: token.verified || false,
      firstSeen: new Date().toISOString(),
      lastTrade: null,
    });
  } catch { /* non-critical */ }
}

export async function getRegisteredTokens(chainId?: ChainId) {
  try {
    const { records } = await tokenRegistry.list({ limit: 500 });
    let filtered = records;
    if (chainId) filtered = filtered.filter(r => r.data.chainId === chainId);
    return filtered.map(r => r.data);
  } catch { return []; }
}

// ── Initialization ───────────────────────────────────────────

export async function initMarketDb(): Promise<boolean> {
  addLog(makeLog('market-db', 'init', 'info', 'Initializing market data store'));
  try {
    // Test collections exist
    await indexedTrades.list({ limit: 1 });
    await candleStore.list({ limit: 1 });
    await tokenRegistry.list({ limit: 1 });
    updateComponent('market-db', { status: 'DEPLOYED', lastDeployment: Date.now() });
    addLog(makeLog('market-db', 'init', 'success', 'Market data store initialized'));
    return true;
  } catch (e: any) {
    updateComponent('market-db', { status: 'FAILED', lastError: e.message });
    addLog(makeLog('market-db', 'init', 'failure', e.message));
    return false;
  }
}

// ── Stats ────────────────────────────────────────────────────

export async function getMarketDbStats() {
  try {
    const [trades, candles, tokens] = await Promise.all([
      indexedTrades.list({ limit: 1 }).then(r => r.records.length).catch(() => 0),
      candleStore.list({ limit: 1 }).then(r => r.records.length).catch(() => 0),
      tokenRegistry.list({ limit: 1 }).then(r => r.records.length).catch(() => 0),
    ]);
    return { trades, candles, tokens, status: 'connected' as const };
  } catch {
    return { trades: 0, candles: 0, tokens: 0, status: 'error' as const };
  }
}