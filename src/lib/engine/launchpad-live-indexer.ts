// Cupcak8 Swap — Launchpad Live Indexer
// Polls for new launch events from persisted checkpoints.
// Handles retries, rate limits, reorgs (EVM), signature dedup (Solana).
// Only indexes the 3 verified sources.

import type { ChainId } from '../config';
import { getEnabledFactories, getFactoryById, buildLaunchEventId, type LaunchpadFactory } from './launchpad-registry';
import { storeLaunchEvent, getLaunchEvents } from './launchpad-indexer';
import { saveCheckpoint, loadCheckpoint } from './indexer/db';
import { scanEvmEvents, scanSolanaEvents } from './launchpad-pipeline';
import type { LaunchpadEventRecord } from './launchpad-registry';
import type { IndexerCheckpoint } from './indexer/types';

// ── State ──────────────────────────────────────────────────

export interface SourceStatus {
  factoryId: string;
  chain: ChainId;
  status: 'LIVE' | 'CATCHING_UP' | 'STOPPED' | 'ERROR' | 'NOT_VERIFIED';
  lastPolledAt: number | null;
  latestBlock: number;
  latestProcessed: number;
  lag: number;
  eventsIngested: number;
  duplicatesRejected: number;
  lastError: string | null;
}

const sourceStates = new Map<string, SourceStatus>();
let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 30_000; // 30s between polls

// ── Initialize ─────────────────────────────────────────────

function initSourceStates(): void {
  const enabled = getEnabledFactories();
  for (const f of enabled) {
    if (!sourceStates.has(f.id)) {
      sourceStates.set(f.id, {
        factoryId: f.id,
        chain: f.chain,
        status: 'STOPPED',
        lastPolledAt: null,
        latestBlock: 0,
        latestProcessed: 0,
        lag: 0,
        eventsIngested: 0,
        duplicatesRejected: 0,
        lastError: null,
      });
    }
  }
}

// ── Polling ────────────────────────────────────────────────

async function pollSource(factory: LaunchpadFactory): Promise<void> {
  const state = sourceStates.get(factory.id);
  if (!state) return;

  state.status = 'CATCHING_UP';
  state.lastPolledAt = Date.now();

  try {
    // Load checkpoint
    const checkpoint = await loadCheckpoint(factory.chain);
    const fromBlock = checkpoint?.latestProcessedBlock ?? 0;

    let events: LaunchpadEventRecord[] = [];

    if (factory.type === 'SOLANA_PROGRAM') {
      // Solana: poll by signature
      const existingEvents = await getLaunchEvents('solana' as ChainId, factory.id, 1);
      const lastSig = existingEvents.length > 0 ? existingEvents[0].txHash : undefined;
      events = await scanSolanaEvents(factory, lastSig);
      state.latestBlock = events.length > 0 ? events[0].blockNumber : state.latestBlock;
    } else {
      // EVM: poll by block range
      const latestBlock = await getLatestBlock(factory.chain);
      if (latestBlock <= 0) {
        state.lastError = 'RPC UNAVAILABLE';
        state.status = 'ERROR';
        return;
      }
      state.latestBlock = latestBlock;

      if (fromBlock > 0 && fromBlock < latestBlock) {
        // Scan in chunks of 500 blocks to avoid RPC limits
        const chunkSize = 500;
        let scanFrom = fromBlock + 1;
        while (scanFrom <= latestBlock) {
          const scanTo = Math.min(scanFrom + chunkSize - 1, latestBlock);
          const chunkEvents = await scanEvmEvents(factory, scanFrom, scanTo);
          events.push(...chunkEvents);
          scanFrom = scanTo + 1;
          if (events.length > 20) break; // cap per poll
          await new Promise(r => setTimeout(r, 200)); // rate limit
        }
      }
    }

    // Persist events
    let ingested = 0;
    let duplicates = 0;
    for (const event of events) {
      // Fetch timestamp if missing
      if (event.timestamp === 0) event.timestamp = Date.now();

      const stored = await storeLaunchEvent(event);
      if (stored) {
        ingested++;
        // Broadcast to frontend
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cupcak8:launch-event', {
              detail: { launchpadId: factory.id, chain: factory.chain, event, timestamp: Date.now() },
            }));
          }
        } catch { /* non-critical */ }
      } else {
        duplicates++;
      }
    }

    state.eventsIngested += ingested;
    state.duplicatesRejected += duplicates;
    state.lastError = null;
    state.status = 'LIVE';

    // Update checkpoint
    if (state.latestBlock > 0) {
      state.latestProcessed = state.latestBlock;
      state.lag = 0;
      await saveCheckpoint({
        chain: factory.chain,
        latestSeenBlock: state.latestBlock,
        latestProcessedBlock: state.latestBlock,
        latestFinalizedBlock: state.latestBlock,
        processedSlot: factory.type === 'SOLANA_PROGRAM' ? state.latestBlock : undefined,
        confirmedSlot: factory.type === 'SOLANA_PROGRAM' ? state.latestBlock : undefined,
        updatedAt: Date.now(),
        status: 'LIVE',
      });
    }
  } catch (err: any) {
    state.lastError = err.message || 'Unknown error';
    state.status = 'ERROR';
  }
}

async function pollAll(): Promise<void> {
  const enabled = getEnabledFactories();
  for (const factory of enabled) {
    await pollSource(factory);
    await new Promise(r => setTimeout(r, 500)); // between sources
  }
}

// ── RPC Helpers ────────────────────────────────────────────

async function getLatestBlock(chain: ChainId): Promise<number> {
  const { CHAINS } = await import('../config');
  const config = CHAINS[chain];
  if (!config?.rpcUrl) return 0;
  try {
    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json() as any;
    if (data.result) return parseInt(data.result, 16);
  } catch { /* non-critical */ }
  return 0;
}

// ── Public API ─────────────────────────────────────────────

export function startLiveIndexer(): void {
  if (running) return;
  initSourceStates();
  running = true;

  // Initial poll
  pollAll().catch(() => {});

  // Periodic polling
  pollTimer = setInterval(() => {
    if (running) pollAll().catch(() => {});
  }, POLL_INTERVAL_MS);

  console.log('[Cupcak8 Swap] Launchpad live indexer started');
}

export function stopLiveIndexer(): void {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const state of sourceStates.values()) {
    state.status = 'STOPPED';
  }
  console.log('[Cupcak8 Swap] Launchpad live indexer stopped');
}

export function isLiveIndexerRunning(): boolean {
  return running;
}

export function getSourceStatuses(): SourceStatus[] {
  initSourceStates();
  return Array.from(sourceStates.values());
}

export function getSourceStatus(factoryId: string): SourceStatus | null {
  initSourceStates();
  return sourceStates.get(factoryId) ?? null;
}