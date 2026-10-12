// Cupcak8 Swap Indexer — Health Data
// Produces structured health data for /health/indexer and admin UI.

import type { IndexerCheckpoint, ChainId } from './types';
import { loadCheckpoint } from './db';
import type { ChainAdapter } from './chain-adapter';

export interface ChainHealth {
  chain: ChainId;
  rpcEndpoint: string;
  rpcStatus: 'UP' | 'DOWN' | 'BLOCKED';
  rpcLatencyMs: number;
  latestChainBlock: number;
  latestIndexedBlock: number;
  lag: number;
  status: IndexerCheckpoint['status'];
  updatedAt: number;
  eventsPerMinute: number;
  errors: number;
}

export interface IndexerHealthStatus {
  overallStatus: 'UP' | 'DEGRADED' | 'DOWN' | 'OFF';
  indexerEnabled: boolean;
  marketDataSource: string;
  chains: ChainHealth[];
  uptime: number;
  timestamp: string;
}

const _startTime = Date.now();
const _errorCounts = new Map<string, number>();
const _eventCounts = new Map<string, number>();
const _lastMinuteReset = Date.now();

export function recordError(chain: string): void {
  _errorCounts.set(chain, (_errorCounts.get(chain) || 0) + 1);
}

export function recordEvent(chain: string): void {
  _eventCounts.set(chain, (_eventCounts.get(chain) || 0) + 1);
}

export function getEventRate(chain: string): number {
  // Reset counts every minute
  if (Date.now() - _lastMinuteReset > 60000) {
    const count = _eventCounts.get(chain) || 0;
    _eventCounts.set(chain, 0);
    return count;
  }
  return _eventCounts.get(chain) || 0;
}

export async function buildIndexerHealth(
  adapters: ChainAdapter[],
  flags: { indexerEnabled: boolean; marketDataSource: string },
): Promise<IndexerHealthStatus> {
  const chains: ChainHealth[] = [];

  for (const adapter of adapters) {
    const cp = await loadCheckpoint(adapter.chainId);
    const rpcLatency = await adapter.healthCheck().catch(() => -1);
    const latestChain = cp?.latestSeenBlock ?? 0;
    const latestIndexed = cp?.latestProcessedBlock ?? 0;

    chains.push({
      chain: adapter.chainId as ChainId,
      rpcEndpoint: adapter.getRpcEndpoint(),
      rpcStatus: rpcLatency >= 0 ? 'UP' : 'DOWN',
      rpcLatencyMs: rpcLatency,
      latestChainBlock: latestChain,
      latestIndexedBlock: latestIndexed,
      lag: latestChain - latestIndexed,
      status: cp?.status ?? 'STOPPED',
      updatedAt: cp?.updatedAt ?? 0,
      eventsPerMinute: getEventRate(adapter.chainId),
      errors: _errorCounts.get(adapter.chainId) || 0,
    });
  }

  const anyDown = chains.some(c => c.rpcStatus === 'DOWN');
  const anyLag = chains.some(c => c.lag > 10);

  return {
    overallStatus: !flags.indexerEnabled ? 'OFF' : anyDown ? 'DOWN' : anyLag ? 'DEGRADED' : 'UP',
    indexerEnabled: flags.indexerEnabled,
    marketDataSource: flags.marketDataSource,
    chains,
    uptime: Math.floor((Date.now() - _startTime) / 1000),
    timestamp: new Date().toISOString(),
  };
}
