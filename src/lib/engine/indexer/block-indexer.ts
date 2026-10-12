// Cupcak8 Swap Indexer — Block-by-Block Indexer
// Resumes from checkpoint. Catches up. Goes live. No data loss.
// Handles persistent RPC failures gracefully (e.g. BSC public RPC blocking eth_getLogs).

import type { ChainAdapter } from './chain-adapter';
import type { DexConfig } from './dex-registry';
import type { MarketEvent, IndexerCheckpoint } from './types';
import { loadCheckpoint, saveCheckpoint, storeBlockMeta, getBlockMeta, storeEvent } from './db';
import { normalizeSwapEvent } from './event-normalizer';
import { detectReorg } from './reorg-handler';

export interface BlockIndexerConfig {
  adapter: ChainAdapter;
  dexConfigs: DexConfig[];
  maxBlocksPerBatch: number;   // backpressure: max blocks per poll cycle
  pollIntervalMs: number;
}

export interface BlockIndexerCallbacks {
  onEvent: (event: MarketEvent) => void;
  onBlockProcessed: (chain: string, block: number) => void;
  onReorg: (chain: string, block: number) => void;
  onError: (chain: string, err: Error) => void;
  onStatusChange: (status: IndexerCheckpoint['status']) => void;
}

// After this many consecutive errors, stop polling and report DEGRADED
const MAX_CONSECUTIVE_ERRORS = 3;
// How long to wait before retrying a degraded chain (exponential backoff cap)
const DEGRADED_RECOVERY_MS = 60_000; // 60s

export class BlockIndexer {
  private config: BlockIndexerConfig;
  private callbacks: BlockIndexerCallbacks;
  private checkpoint: IndexerCheckpoint | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private lastError = '';
  private degraded = false;
  private degradedSince = 0;

  constructor(config: BlockIndexerConfig, callbacks: BlockIndexerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Load checkpoint or create fresh
    this.checkpoint = await loadCheckpoint(this.config.adapter.chainId);
    if (!this.checkpoint) {
      const latest = await this.config.adapter.getLatestBlock().catch(() => 0);
      if (latest === 0) {
        // Can't even reach RPC — report and stop
        this.callbacks.onError(this.config.adapter.chainId, new Error(`${this.config.adapter.chainId.toUpperCase()} RPC UNAVAILABLE`));
        this.callbacks.onStatusChange('ERROR');
        this.running = false;
        return;
      }
      this.checkpoint = {
        chain: this.config.adapter.chainId as any,
        latestSeenBlock: latest,
        latestProcessedBlock: latest - 1,
        latestFinalizedBlock: latest,
        updatedAt: Date.now(),
        status: 'CATCHING_UP',
      };
      await saveCheckpoint(this.checkpoint);
    }

    this.callbacks.onStatusChange(this.checkpoint.status);

    // Start polling loop
    this.timer = setInterval(() => this.poll().catch(err => {
      this.handlePollError(err);
    }), this.config.pollIntervalMs);

    // Immediate first poll
    await this.poll().catch(err => this.handlePollError(err));
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.recoveryTimer) { clearTimeout(this.recoveryTimer); this.recoveryTimer = null; }
    this.callbacks.onStatusChange('STOPPED');
  }

  getCheckpoint(): IndexerCheckpoint | null { return this.checkpoint; }

  private handlePollError(err: Error): void {
    this.consecutiveErrors++;
    this.lastError = err.message || 'Unknown error';

    if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !this.degraded) {
      this.degraded = true;
      this.degradedSince = Date.now();
      // Stop the polling timer — don't keep hammering a broken RPC
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      this.callbacks.onStatusChange('ERROR');
      this.callbacks.onError(this.config.adapter.chainId,
        new Error(`${this.config.adapter.chainId.toUpperCase()} INDEXER DEGRADED — ${this.consecutiveErrors} consecutive errors: ${this.lastError}. Retrying in ${DEGRADED_RECOVERY_MS / 1000}s.`)
      );
      // Schedule recovery attempt
      if (!this.recoveryTimer && this.running) {
        this.recoveryTimer = setTimeout(() => {
          this.recoveryTimer = null;
          if (!this.running) return;
          this.degraded = false;
          this.consecutiveErrors = 0;
          // Single recovery poll
          this.poll().catch(e => this.handlePollError(e));
          // Restart polling timer if recovery succeeded
          if (!this.degraded && this.running && !this.timer) {
            this.timer = setInterval(() => this.poll().catch(e => {
              this.handlePollError(e);
            }), this.config.pollIntervalMs);
          }
        }, DEGRADED_RECOVERY_MS);
      }
    } else if (!this.degraded) {
      // Log the error but keep trying
      this.callbacks.onError(this.config.adapter.chainId, err);
    }
    // If already degraded, silently ignore — we've already reported
  }

  private async poll(): Promise<void> {
    if (!this.checkpoint || !this.running) return;
    const cp = this.checkpoint;

    // Get latest block from chain
    const latestChain = await this.config.adapter.getLatestBlock();
    cp.latestSeenBlock = latestChain;

    // If we get here, RPC is working — reset error counter
    if (this.degraded) {
      this.degraded = false;
      this.consecutiveErrors = 0;
      // Restart polling
      this.timer = setInterval(() => this.poll().catch(err => {
        this.handlePollError(err);
      }), this.config.pollIntervalMs);
    }
    this.consecutiveErrors = 0;

    const startBlock = cp.latestProcessedBlock + 1;
    const endBlock = Math.min(startBlock + this.config.maxBlocksPerBatch - 1, latestChain);

    if (startBlock > latestChain) {
      // Already at head — update status
      cp.status = 'LIVE';
      cp.updatedAt = Date.now();
      await saveCheckpoint(cp);
      this.callbacks.onStatusChange('LIVE');
      return;
    }

    cp.status = 'CATCHING_UP';
    this.callbacks.onStatusChange('CATCHING_UP');

    // Process each block
    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      await this.processBlock(blockNum);
      cp.latestProcessedBlock = blockNum;
    }

    cp.updatedAt = Date.now();
    cp.status = endBlock >= latestChain ? 'LIVE' : 'CATCHING_UP';
    await saveCheckpoint(cp);
    this.callbacks.onStatusChange(cp.status);
    this.callbacks.onBlockProcessed(cp.chain, endBlock);
  }

  private async processBlock(blockNum: number): Promise<void> {
    const block = await this.config.adapter.getBlock(blockNum);
    if (!block) return;

    // Store block metadata for reorg detection
    await storeBlockMeta(this.config.adapter.chainId, block.number, block.hash, block.parentHash);

    // Check for reorg
    if (blockNum > 1) {
      const parentMeta = await getBlockMeta(this.config.adapter.chainId, block.number - 1);
      if (parentMeta && parentMeta.blockHash !== block.parentHash) {
        this.callbacks.onReorg(this.config.adapter.chainId, blockNum);
        await detectReorg(this.config.adapter.chainId, blockNum);
        return;
      }
    }

    // Get logs for monitored DEX contracts
    if (!this.config.adapter.isEvm || !this.config.adapter.getLogs) return;

    const swapTopics = this.config.dexConfigs
      .filter(d => d.eventTopics.swap)
      .map(d => d.eventTopics.swap);

    const addresses = this.config.dexConfigs.flatMap(d =>
      d.monitoredPools.length > 0 ? d.monitoredPools : [d.factoryAddress]
    );

    if (addresses.length === 0 || swapTopics.length === 0) return;

    // This is where BSC public RPCs fail with "limit exceeded"
    const logs = await this.config.adapter.getLogs!(blockNum, blockNum, addresses, [swapTopics]);

    for (const log of logs) {
      const dexConfig = this.config.dexConfigs.find(d => {
        if (d.monitoredPools.length > 0) return d.monitoredPools.some(p => p.toLowerCase() === log.address);
        return d.factoryAddress.toLowerCase() === log.address;
      });
      if (!dexConfig) continue;

      log.timestamp = block.timestamp;
      const event = normalizeSwapEvent(log, dexConfig, this.config.adapter.chainId);
      if (!event) continue;

      const stored = await storeEvent(event);
      if (stored) this.callbacks.onEvent(event);
    }
  }
}
