// Cupcak8 Swap Indexer — Persistent Database via Gitlawb SDK
// All collections use { visibility: "owner" } — admin-only indexed data.
import { gitlawb } from '../../gitlawb';
import type { MarketEvent, NormalizedTrade, LiquidityEvent, Candle, MarketIdentity, MarketStats, IndexerCheckpoint } from './types';

// ── Collections ─────────────────────────────────────────────
const eventsCol = () => gitlawb.db.collection<MarketEvent>('idx_events', { visibility: 'owner' });
const tradesCol = () => gitlawb.db.collection<NormalizedTrade>('idx_trades', { visibility: 'owner' });
const liquidityCol = () => gitlawb.db.collection<LiquidityEvent>('idx_liquidity', { visibility: 'owner' });
const candlesCol = () => gitlawb.db.collection<Candle>('idx_candles', { visibility: 'owner' });
const marketsCol = () => gitlawb.db.collection<MarketIdentity>('idx_markets', { visibility: 'owner' });
const statsCol = () => gitlawb.db.collection<MarketStats>('idx_stats', { visibility: 'owner' });
const checkpointsCol = () => gitlawb.db.collection<IndexerCheckpoint>('idx_checkpoints', { visibility: 'owner' });
const blockMetaCol = () => gitlawb.db.collection<{ chain: string; blockNumber: number; blockHash: string; parentHash: string }>('idx_block_meta', { visibility: 'owner' });

// ── Events ──────────────────────────────────────────────────
export async function storeEvent(event: MarketEvent): Promise<boolean> {
  try {
    const col = eventsCol();
    const existing = await col.list({ limit: 1 });
    // Dedup by deterministic ID
    if (existing.records.some(r => r.data.id === event.id)) return false;
    await col.create(event);
    return true;
  } catch { return false; }
}

export async function getEventsByMarket(marketId: string, limit = 50): Promise<MarketEvent[]> {
  const { records } = await eventsCol().list({ limit });
  return records.map(r => r.data).filter(e => e.marketId === marketId);
}

export async function getEventsByChain(chain: string, limit = 100): Promise<MarketEvent[]> {
  const { records } = await eventsCol().list({ limit });
  return records.map(r => r.data).filter(e => e.chain === chain);
}

export async function removeEventsByIds(ids: string[]): Promise<void> {
  const col = eventsCol();
  const { records } = await col.list({ limit: 1000 });
  for (const r of records) {
    if (ids.includes(r.data.id)) await col.remove(r.id);
  }
}

// ── Trades ──────────────────────────────────────────────────
export async function storeTrade(trade: NormalizedTrade): Promise<boolean> {
  try {
    const col = tradesCol();
    const { records } = await col.list({ limit: 1 });
    if (records.some(r => r.data.id === trade.id)) return false;
    await col.create(trade);
    return true;
  } catch { return false; }
}

export async function getTradesByMarket(marketId: string, limit = 100): Promise<NormalizedTrade[]> {
  const { records } = await tradesCol().list({ limit });
  return records.map(r => r.data).filter(t => t.marketId === marketId).sort((a, b) => b.timestamp - a.timestamp);
}

export async function getTradesSince(chain: string, since: number): Promise<NormalizedTrade[]> {
  const { records } = await tradesCol().list({ limit: 500 });
  return records.map(r => r.data).filter(t => t.chain === chain && t.timestamp >= since);
}

// ── Liquidity ───────────────────────────────────────────────
export async function storeLiquidityEvent(event: LiquidityEvent): Promise<boolean> {
  try { await liquidityCol().create(event); return true; } catch { return false; }
}

// ── Candles ─────────────────────────────────────────────────
export async function upsertCandle(candle: Candle): Promise<void> {
  const col = candlesCol();
  const { records } = await col.list({ limit: 1 });
  const existing = records.find(r => r.data.id === candle.id);
  if (existing) {
    await col.update(existing.id, candle);
  } else {
    await col.create(candle);
  }
}

export async function getCandles(marketId: string, interval: string, limit = 200): Promise<Candle[]> {
  const { records } = await candlesCol().list({ limit });
  return records.map(r => r.data)
    .filter(c => c.marketId === marketId && c.interval === interval)
    .sort((a, b) => a.openTimestamp - b.openTimestamp);
}

// ── Markets ─────────────────────────────────────────────────
export async function upsertMarket(market: MarketIdentity): Promise<void> {
  const col = marketsCol();
  const { records } = await col.list({ limit: 1 });
  const existing = records.find(r => r.data.id === market.id);
  if (existing) { await col.update(existing.id, market); }
  else { await col.create(market); }
}

export async function getMarket(marketId: string): Promise<MarketIdentity | null> {
  const { records } = await marketsCol().list({ limit: 1 });
  return records.find(r => r.data.id === marketId)?.data ?? null;
}

export async function getMarketsByChain(chain: string): Promise<MarketIdentity[]> {
  const { records } = await marketsCol().list({ limit: 200 });
  return records.map(r => r.data).filter(m => m.chain === chain);
}

// ── Stats ───────────────────────────────────────────────────
export async function upsertStats(stats: MarketStats): Promise<void> {
  const col = statsCol();
  const { records } = await col.list({ limit: 1 });
  const existing = records.find(r => r.data.marketId === stats.marketId);
  if (existing) { await col.update(existing.id, stats); }
  else { await col.create(stats); }
}

export async function getStats(marketId: string): Promise<MarketStats | null> {
  const { records } = await statsCol().list({ limit: 1 });
  return records.find(r => r.data.marketId === marketId)?.data ?? null;
}

// ── Checkpoints ─────────────────────────────────────────────
export async function saveCheckpoint(cp: IndexerCheckpoint): Promise<void> {
  const col = checkpointsCol();
  const { records } = await col.list({ limit: 1 });
  const existing = records.find(r => r.data.chain === cp.chain);
  if (existing) { await col.update(existing.id, cp); }
  else { await col.create(cp); }
}

export async function loadCheckpoint(chain: string): Promise<IndexerCheckpoint | null> {
  const { records } = await checkpointsCol().list({ limit: 1 });
  return records.find(r => r.data.chain === chain)?.data ?? null;
}

// ── Block Metadata (for reorg detection) ────────────────────
export async function storeBlockMeta(chain: string, blockNumber: number, blockHash: string, parentHash: string): Promise<void> {
  await blockMetaCol().create({ chain, blockNumber, blockHash, parentHash });
}

export async function getBlockMeta(chain: string, blockNumber: number): Promise<{ blockHash: string; parentHash: string } | null> {
  const { records } = await blockMetaCol().list({ limit: 10 });
  return records.find(r => r.data.chain === chain && r.data.blockNumber === blockNumber)?.data ?? null;
}
