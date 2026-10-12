// Cupcak8 Swap Indexer — Initialization & Pipeline Wiring
// Connects: BlockIndexer → EventNormalizer → TradeNormalizer → DB → MarketEngine → WsBridge
// Called once on app startup. Survives hot-reload via singleton pattern.

import { IndexerOrchestrator, type OrchestratorCallbacks } from './indexer-orchestrator';
import { WsBridge } from './ws-bridge';
import { getFlags } from './feature-flags';
import type { MarketEvent, ChainId } from './types';

// ── Singleton ──────────────────────────────────────────────

let orchestrator: IndexerOrchestrator | null = null;
let wsBridge: WsBridge | null = null;
let initialized = false;

export interface IndexerStatus {
  running: boolean;
  chains: Record<string, { status: string; block: number; error: string | null }>;
  eventsProcessed: number;
  tradesStored: number;
  lastEventAt: number | null;
}

const status: IndexerStatus = {
  running: false,
  chains: {},
  eventsProcessed: 0,
  tradesStored: 0,
  lastEventAt: null,
};

export function getIndexerStatus(): IndexerStatus {
  return { ...status };
}

// ── Broadcast function for WsBridge ────────────────────────

function broadcastToWs(channel: string, data: Record<string, unknown>): void {
  // In browser: emit to the existing market-stream event bus
  // The frontend market-stream.ts already listens for events
  // This function bridges indexer events into that system
  try {
    // Emit as a custom event that market-stream can pick up
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cupcak8:indexer-event', {
        detail: { channel, data, timestamp: Date.now() },
      }));
    }
  } catch { /* non-critical */ }
}

// ── Main Initialization ────────────────────────────────────

export function initIndexer(): void {
  if (initialized) return;
  initialized = true;

  const flags = getFlags();
  if (!flags.indexerEnabled) {
    console.log('[Cupcak8 Swap] Indexer disabled by feature flag');
    return;
  }

  console.log('[Cupcak8 Swap] Initializing blockchain indexer...');

  // Create WS bridge
  wsBridge = new WsBridge(broadcastToWs);

  // Create orchestrator callbacks
  const callbacks: OrchestratorCallbacks = {
    onEvent: async (chain: ChainId, event: MarketEvent) => {
      status.eventsProcessed++;
      status.lastEventAt = Date.now();
      // Route through WS bridge (normalizes, stores trade, updates candles, broadcasts)
      try {
        await wsBridge!.onIndexerEvent(event);
        status.tradesStored++;
      } catch (e) {
        console.error(`[Cupcak8 Swap] Event processing error on ${chain}:`, e);
      }
    },

    onBlockProcessed: (chain: string, block: number) => {
      if (!status.chains[chain]) {
        status.chains[chain] = { status: 'LIVE', block, error: null };
      } else {
        status.chains[chain].block = block;
        status.chains[chain].status = 'LIVE';
        status.chains[chain].error = null;
      }
    },

    onError: (chain: string, err: Error) => {
      const msg = err.message || 'Unknown error';
      if (!status.chains[chain]) {
        status.chains[chain] = { status: 'ERROR', block: 0, error: msg };
      } else {
        status.chains[chain].status = 'ERROR';
        status.chains[chain].error = msg;
      }
      // Suppress noisy RPC errors — log as warn, not error
      if (msg.includes('RPC UNAVAILABLE') || msg.includes('limit exceeded') || msg.includes('DEGRADED')) {
        console.warn(`[Cupcak8 Swap] ${chain.toUpperCase()}: ${msg}`);
      } else {
        console.error(`[Cupcak8 Swap] Indexer error on ${chain}:`, msg);
      }
    },

    onStatusChange: (chain: string, chainStatus: string) => {
      if (!status.chains[chain]) {
        status.chains[chain] = { status: chainStatus, block: 0, error: null };
      } else {
        status.chains[chain].status = chainStatus;
      }
    },
  };

  // Create and start orchestrator
  orchestrator = new IndexerOrchestrator(callbacks);
  status.running = true;

  orchestrator.start().then(() => {
    console.log('[Cupcak8 Swap] Indexer started. Active chains:', orchestrator!.getActiveChains());
  }).catch(err => {
    console.error('[Cupcak8 Swap] Indexer failed to start:', err);
    status.running = false;
  });
}

export function stopIndexer(): void {
  if (orchestrator) {
    orchestrator.stop();
    orchestrator = null;
  }
  status.running = false;
  initialized = false;
  console.log('[Cupcak8 Swap] Indexer stopped');
}
