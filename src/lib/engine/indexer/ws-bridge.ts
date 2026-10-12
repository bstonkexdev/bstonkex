// Cupcak8 Swap Indexer — WebSocket Bridge
// Bridges indexed events → existing WebSocket gateway for frontend delivery.
// Preserves existing DexScreener pipeline. New events are additive.

import type { MarketEvent, NormalizedTrade, ChainId } from './types';
import { processAndStoreTrade } from './trade-normalizer';
import { updateCandles } from './candle-engine';
import { computeMarketStats } from './market-engine';

// Quote tokens for BUY/SELL classification per chain
const QUOTE_TOKENS: Record<string, string> = {
  bsc: '0x55d398326f99059ff775485246999027b3197955',  // USDT BSC
  base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC Base
};

export type WsBroadcastFn = (channel: string, data: Record<string, unknown>) => void;

export class WsBridge {
  private broadcast: WsBroadcastFn;

  constructor(broadcast: WsBroadcastFn) {
    this.broadcast = broadcast;
  }

  /** Called when the indexer produces a new event */
  async onIndexerEvent(event: MarketEvent): Promise<void> {
    // 1. Normalize into a trade
    const quoteToken = QUOTE_TOKENS[event.chain] || '';
    const trade = await processAndStoreTrade(event, quoteToken);

    // 2. Update candles if trade was stored
    if (trade) {
      await updateCandles(event.marketId, trade);

      // 3. Compute updated market stats
      const stats = await computeMarketStats(event.marketId);

      // 4. Broadcast via existing WebSocket channels
      this.broadcast(`market:${event.chain}:${event.poolId}`, {
        type: 'price',
        id: event.id,
        chainId: event.chain,
        tokenAddress: event.poolId,
        tokenSymbol: '',
        timestamp: event.timestamp,
        data: {
          price: stats.price,
          change24h: stats.priceChange24h,
          volume24h: stats.volume24h,
          liquidity: stats.liquidityUsd,
          source: 'indexer',
        },
      });

      // Stats event
      this.broadcast(`market:${event.chain}:${event.poolId}`, {
        type: 'stats',
        id: `stats:${event.id}`,
        chainId: event.chain,
        tokenAddress: event.poolId,
        tokenSymbol: '',
        timestamp: event.timestamp,
        data: {
          price: stats.price,
          change24h: stats.priceChange24h,
          volume24h: stats.volume24h,
          tradeCount: stats.tradeCount24h,
          buys24h: stats.buyVolume24h,
          sells24h: stats.sellVolume24h,
          source: 'indexer',
        },
      });

      // Trade event (activity feed)
      this.broadcast(`trades:${event.chain}:${event.poolId}`, {
        type: 'trade',
        id: trade.id,
        chainId: event.chain,
        marketId: event.marketId,
        timestamp: event.timestamp,
        data: {
          side: trade.side,
          price: trade.priceUsd || trade.price,
          amount: trade.amountIn,
          wallet: trade.wallet,
          txHash: trade.txHash,
          source: 'indexer',
        },
      });
    }
  }
}
