// Cupcak8 Swap Indexer — Trade Normalizer
// Classifies BUY/SELL, derives prices. Real data only.

import type { MarketEvent, NormalizedTrade, TradeSide } from './types';
import { storeTrade } from './db';

export function normalizeTrade(event: MarketEvent, quoteToken: string): NormalizedTrade | null {
  if (event.eventType !== 'SWAP') return null;

  const side: TradeSide = event.tokenOut.toLowerCase() === quoteToken.toLowerCase() ? 'BUY' : 'SELL';

  const amountIn = parseFloat(event.amountIn);
  const amountOut = parseFloat(event.amountOut);

  if (amountIn === 0 || amountOut === 0) return null;

  // Price = amountOut / amountIn for BUY, amountIn / amountOut for SELL
  const price = side === 'BUY'
    ? amountOut / amountIn
    : amountIn / amountOut;

  const trade: NormalizedTrade = {
    id: event.id,
    chain: event.chain,
    marketId: event.marketId,
    poolId: event.poolId,
    timestamp: event.timestamp,
    blockNumber: event.blockNumber,
    slot: event.slot,
    txHash: event.txHash,
    wallet: event.wallet,
    side,
    tokenIn: event.tokenIn,
    tokenOut: event.tokenOut,
    amountIn: event.amountIn,
    amountOut: event.amountOut,
    price,
    priceUsd: event.price,
    amountUsd: event.usdValue,
    dex: event.dex,
    status: event.status,
  };

  return trade;
}

export async function processAndStoreTrade(event: MarketEvent, quoteToken: string): Promise<NormalizedTrade | null> {
  const trade = normalizeTrade(event, quoteToken);
  if (!trade) return null;
  const stored = await storeTrade(trade);
  return stored ? trade : null;
}
