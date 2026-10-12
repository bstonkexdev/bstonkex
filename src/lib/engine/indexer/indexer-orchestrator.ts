// Cupcak8 Swap Indexer — Orchestrator
// Starts/stops all chain indexers. Aggregates health. Manages lifecycle.

import { createEvmAdapter } from './evm-adapter';
import { createSolanaAdapter } from './solana-adapter';
import { BlockIndexer, type BlockIndexerCallbacks } from './block-indexer';
import { getDexConfigs } from './dex-registry';
import { getFlags } from './feature-flags';
import type { ChainConfig } from './chain-adapter';
import type { MarketEvent, IndexerCheckpoint, ChainId } from './types';

export interface OrchestratorCallbacks {
  onEvent: (chain: ChainId, event: MarketEvent) => void;
  onBlockProcessed: (chain: string, block: number) => void;
  onError: (chain: string, err: Error) => void;
  onStatusChange: (chain: string, status: IndexerCheckpoint['status']) => void;
}

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  bsc: {
    chainId: 'bsc',
    numericChainId: 56,
    rpcUrls: [
      'https://rpc.ankr.com/bsc',
      'https://bsc-dataseed1.binance.org',
      'https://bsc-dataseed2.binance.org',
    ],
    name: 'BNB Smart Chain',
    isEvm: true,
    maxBlockRange: 1, // BSC public RPCs block eth_getLogs — single-block queries only
  },
  base: {
    chainId: 'base',
    numericChainId: 8453,
    rpcUrls: [
      'https://rpc.ankr.com/base',
      'https://mainnet.base.org',
    ],
    name: 'Base',
    isEvm: true,
    maxBlockRange: 500,
  },
  robinhood: {
    chainId: 'robinhood',
    numericChainId: 4663,
    rpcUrls: getRobinhoodRpcUrls(),
    name: 'Robinhood Chain',
    isEvm: true,
    maxBlockRange: 500,
  },
  solana: {
    chainId: 'solana',
    numericChainId: 0,
    rpcUrls: [
      'https://rpc.ankr.com/solana',
      'https://api.mainnet-beta.solana.com',
    ],
    name: 'Solana',
    isEvm: false,
  },
};

function getRobinhoodRpcUrls(): string[] {
  // Public Robinhood RPC — Alchemy key stays server-side
  return ['https://rpc.mainnet.chain.robinhood.com'];
}

export class IndexerOrchestrator {
  private indexers = new Map<string, BlockIndexer>();
  private callbacks: OrchestratorCallbacks;
  private started = false;

  constructor(callbacks: OrchestratorCallbacks) {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const flags = getFlags();
    if (!flags.indexerEnabled) return;

    // Start EVM chain indexers (BSC, Base, Robinhood)
    const evmChains = flags.robinhoodIndexingEnabled
      ? ['bsc', 'base', 'robinhood']
      : ['bsc', 'base'];

    for (const chain of evmChains) {
      const config = CHAIN_CONFIGS[chain];
      if (!config) continue;
      // Skip chains with no RPC URLs configured
      if (config.rpcUrls.length === 0) {
        this.callbacks.onError(chain, new Error(`${chain.toUpperCase()} RPC UNAVAILABLE — no RPC URLs configured`));
        continue;
      }
      const adapter = createEvmAdapter(config);
      const dexConfigs = getDexConfigs(chain as ChainId);
      if (dexConfigs.length === 0) continue;

      const indexer = new BlockIndexer(
        { adapter, dexConfigs, maxBlocksPerBatch: flags.maxBlocksPerBatch, pollIntervalMs: flags.indexerPollIntervalMs },
        this.makeCallbacks(chain as ChainId),
      );
      this.indexers.set(chain, indexer);
      await indexer.start().catch(err => this.callbacks.onError(chain, err));
    }

    // Solana — uses signature-based indexing, handled separately in ws-bridge
    if (flags.solanaIndexingEnabled) {
      const config = CHAIN_CONFIGS.solana;
      if (config) {
        const adapter = createSolanaAdapter(config);
        // Solana block indexer runs at slot level
        const indexer = new BlockIndexer(
          { adapter, dexConfigs: [], maxBlocksPerBatch: flags.maxBlocksPerBatch, pollIntervalMs: flags.indexerPollIntervalMs },
          this.makeCallbacks('solana'),
        );
        this.indexers.set('solana', indexer);
        await indexer.start().catch(err => this.callbacks.onError('solana', err));
      }
    }
  }

  stop(): void {
    this.started = false;
    for (const [, indexer] of this.indexers) {
      indexer.stop();
    }
  }

  getCheckpoints(): Record<string, IndexerCheckpoint | null> {
    const result: Record<string, IndexerCheckpoint | null> = {};
    for (const [chain, indexer] of this.indexers) {
      result[chain] = indexer.getCheckpoint();
    }
    return result;
  }

  isRunning(): boolean {
    return this.started;
  }

  getActiveChains(): string[] {
    return [...this.indexers.keys()];
  }

  private makeCallbacks(chain: ChainId): BlockIndexerCallbacks {
    return {
      onEvent: (event) => this.callbacks.onEvent(chain, event),
      onBlockProcessed: (c, block) => this.callbacks.onBlockProcessed(c, block),
      onReorg: () => {},
      onError: (_, err) => this.callbacks.onError(chain, err),
      onStatusChange: (status) => this.callbacks.onStatusChange(chain, status),
    };
  }
}
