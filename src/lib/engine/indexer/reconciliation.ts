// Cupcak8 Swap Indexer — Reconciliation Engine
// Compares Cupcak8 Swap indexed data vs DexScreener reference data.
// Discrepancies are logged, not auto-overwritten.

import type { ReconciliationResult } from './types';
import { getStats, getMarket } from './db';

const DEXSCREENER_API = 'https://api.dexscreener.com';

export async function reconcileMarket(marketId: string): Promise<ReconciliationResult | null> {
  const stats = await getStats(marketId);
  const market = await getMarket(marketId);
  if (!stats || !market) return null;

  // Fetch DexScreener reference data
  const dexData = await fetchDexScreenerPrice(market.poolAddress);
  if (!dexData) {
    return {
      marketId,
      timestamp: Date.now(),
      indexerPrice: stats.price,
      dexscreenerPrice: null,
      priceDiff: null,
      indexerVolume24h: stats.volume24h,
      dexscreenerVolume24h: null,
      status: 'INDEXER_AHEAD',
    };
  }

  const indexerPrice = stats.price ?? 0;
  const dexPrice = dexData.price ?? 0;
  const priceDiff = (indexerPrice > 0 && dexPrice > 0)
    ? Math.abs(indexerPrice - dexPrice) / Math.max(indexerPrice, dexPrice)
    : null;

  let status: ReconciliationResult['status'] = 'MATCH';
  if (priceDiff !== null && priceDiff > 0.05) {
    status = 'DIVERGENT';
  } else if (stats.volume24h > (dexData.volume * 1.2)) {
    status = 'INDEXER_AHEAD';
  } else if (stats.volume24h < (dexData.volume * 0.8)) {
    status = 'DEXSCREENER_AHEAD';
  }

  return {
    marketId,
    timestamp: Date.now(),
    indexerPrice,
    dexscreenerPrice: dexPrice,
    priceDiff,
    indexerVolume24h: stats.volume24h,
    dexscreenerVolume24h: dexData.volume,
    status,
  };
}

async function fetchDexScreenerPrice(address: string): Promise<{ price: number; volume: number } | null> {
  try {
    const res = await fetch(`${DEXSCREENER_API}/latest/dex/tokens/${address}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pair = data.pairs?.[0];
    if (!pair) return null;
    return {
      price: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
      volume: pair.volume?.h24 ?? 0,
    };
  } catch { return null; }
}
