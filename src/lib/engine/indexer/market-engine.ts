// Cupcak8 Swap Indexer — Market Engine
// Canonical market identity + statistics from indexed trades.

import type { MarketIdentity, MarketStats, ChainId, TokenIdentity } from './types';
import { upsertMarket, getMarket, getTradesByMarket, upsertStats } from './db';

export function createMarketId(chain: string, dex: string, poolAddress: string): string {
  return `${chain}:${dex}:${poolAddress.toLowerCase()}`;
}

export async function registerMarket(
  chain: ChainId,
  dex: string,
  poolAddress: string,
  token0: TokenIdentity,
  token1: TokenIdentity,
): Promise<MarketIdentity> {
  const market: MarketIdentity = {
    id: createMarketId(chain, dex, poolAddress),
    chain,
    dex,
    poolAddress: poolAddress.toLowerCase(),
    token0,
    token1,
    createdAt: Date.now(),
  };
  await upsertMarket(market);
  return market;
}

export async function computeMarketStats(marketId: string): Promise<MarketStats> {
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const trades = await getTradesByMarket(marketId, 500);
  const recent = trades.filter(t => t.timestamp >= h24);

  const uniqueWallets = new Set(recent.map(t => t.wallet).filter(Boolean));
  const buyTrades = recent.filter(t => t.side === 'BUY');
  const sellTrades = recent.filter(t => t.side === 'SELL');

  const volume24h = recent.reduce((sum, t) => sum + (t.amountUsd || 0), 0);
  const buyVolume = buyTrades.reduce((sum, t) => sum + (t.amountUsd || 0), 0);
  const sellVolume = sellTrades.reduce((sum, t) => sum + (t.amountUsd || 0), 0);

  const lastTrade = recent.length > 0 ? recent[0] : null;
  const lastPrice = lastTrade?.priceUsd ?? lastTrade?.price ?? null;

  // Price change: compare latest price vs price 24h ago
  const oldestRecent = recent.length > 0 ? recent[recent.length - 1] : null;
  const price24hAgo = oldestRecent?.priceUsd ?? null;
  const priceChange24h = (lastPrice && price24hAgo)
    ? ((lastPrice - price24hAgo) / price24hAgo) * 100
    : null;

  const stats: MarketStats = {
    marketId,
    price: lastPrice,
    priceChange24h,
    volume24h,
    tradeCount24h: recent.length,
    buyVolume24h: buyVolume,
    sellVolume24h: sellVolume,
    uniqueTraders24h: uniqueWallets.size,
    liquidityUsd: null, // derived from pool reserves separately
    lastTradeAt: lastTrade?.timestamp ?? null,
    lastUpdated: now,
  };

  await upsertStats(stats);
  return stats;
}
