// Cupcak8 Swap Indexer — Barrel Export + Initialization
// Single entry point for the indexer system.
// Does NOT start automatically — call initIndexer() to activate.

export { IndexerOrchestrator } from './indexer/indexer-orchestrator';
export { WsBridge } from './indexer/ws-bridge';
export { getFlags, setMarketDataSource, setFlag, isIndexerSource, isDexScreenerSource } from './indexer/feature-flags';
export { buildIndexerHealth, recordError, recordEvent } from './indexer/indexer-health';
export { reconcileMarket } from './indexer/reconciliation';
export { computeMarketStats, registerMarket, createMarketId } from './indexer/market-engine';
export { getCandles, getTradesByMarket, getStats, getMarket, getMarketsByChain, loadCheckpoint } from './indexer/db';

export type { MarketEvent, NormalizedTrade, Candle, MarketIdentity, MarketStats, IndexerCheckpoint, ChainId, CandleInterval } from './indexer/types';
export type { ChainHealth, IndexerHealthStatus } from './indexer/indexer-health';

import { IndexerOrchestrator } from './indexer/indexer-orchestrator';
import { WsBridge } from './indexer/ws-bridge';
import { getFlags, setFlag } from './indexer/feature-flags';
import { recordError, recordEvent } from './indexer/indexer-health';
import type { MarketEvent, ChainId } from './indexer/types';

let _orchestrator: IndexerOrchestrator | null = null;
let _wsBridge: WsBridge | null = null;

/**
 * Initialize the indexer system.
 * @param broadcastFn — the existing WebSocket server's broadcast function
 * @returns orchestrator instance (may be null if indexer is disabled)
 */
export function initIndexer(
  broadcastFn: (channel: string, data: Record<string, unknown>) => void,
): IndexerOrchestrator | null {
  const flags = getFlags();
  if (!flags.indexerEnabled) return null;

  _wsBridge = new WsBridge(broadcastFn);

  _orchestrator = new IndexerOrchestrator({
    onEvent: (_chain: ChainId, event: MarketEvent) => {
      recordEvent(_chain);
      _wsBridge?.onIndexerEvent(event).catch(() => {});
    },
    onBlockProcessed: () => {},
    onError: (chain: string, err: Error) => {
      recordError(chain);
      console.error(`[Indexer:${chain}]`, err.message);
    },
    onStatusChange: (chain: string, status: string) => {
      console.log(`[Indexer:${chain}] ${status}`);
    },
  });

  return _orchestrator;
}

export function getOrchestrator(): IndexerOrchestrator | null {
  return _orchestrator;
}

export function getWsBridge(): WsBridge | null {
  return _wsBridge;
}
