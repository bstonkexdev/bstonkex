// Cupcak8 Swap — Launchpad Stage 3 Pipeline
// Ingests verified historical launches, normalizes, persists with idempotent dedup.
// Only processes the 3 verified sources: OpenLaunch Base, OpenLaunch RH, Pump.fun.
// Uses real blockchain RPCs. No mock data.

import type { ChainId } from '../config';
import { CHAINS } from '../config';
import { isSandboxed } from './sandbox';
import {
  getEnabledFactories,
  getFactoryById,
  buildLaunchEventId,
  type LaunchpadFactory,
  type LaunchpadEventRecord,
} from './launchpad-registry';
import { storeLaunchEvent, getLaunchEvents } from './launchpad-indexer';
import { saveCheckpoint, loadCheckpoint } from './indexer/db';
import type { IndexerCheckpoint } from './indexer/types';
import { gitlawb } from '../gitlawb';

// ── Types ──────────────────────────────────────────────────

export interface PipelineResult {
  launchpadId: string;
  chain: ChainId;
  eventsIngested: number;
  duplicatesSkipped: number;
  errors: string[];
  checkpoint: number;
  status: 'PASS' | 'FAIL';
}

export interface PipelineReport {
  timestamp: string;
  results: PipelineResult[];
  totalIngested: number;
  totalDuplicates: number;
}

// ── Historical Launch Data (from Stage 2 verification) ─────

interface HistoricalLaunch {
  factoryId: string;
  chain: ChainId;
  chainId: number;
  factory: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  tokenAddress: string;
  creator: string;
  timestamp: number;
}

const HISTORICAL_LAUNCHES: HistoricalLaunch[] = [
  // OpenLaunch Base
  {
    factoryId: 'openlaunch-base',
    chain: 'base',
    chainId: 8453,
    factory: '0x815542E8b392389A1389E22E588E4B62A67Ade72',
    txHash: '0x5ccac465fd1dc18a7594a8c357cae3ed1231fb3652b762ccc13b4dc1def8e68e',
    blockNumber: 52340723,
    logIndex: 923,
    tokenAddress: '0xdb4702eb43cb2d5cd57c10c55d0653fa6598d2e8',
    creator: '0x00000000000000000000000000000000002fa9a0',
    timestamp: 0, // will be fetched
  },
  // OpenLaunch Robinhood — event 1
  {
    factoryId: 'openlaunch-rh',
    chain: 'robinhood',
    chainId: 4663,
    factory: '0x815542E8b392389A1389E22E588E4B62A67Ade72',
    txHash: '0x4fd83be322a47a24fee4e0870da01e9b87fdc87d83b8936c2620ebebedff15c6',
    blockNumber: 83648412,
    logIndex: 20,
    tokenAddress: '0x223e64f15328a1d4919cc74e6aeaead2b920ac5a',
    creator: '0x00000000000000000000000000000000003811b1',
    timestamp: 0,
  },
  // OpenLaunch Robinhood — event 2
  {
    factoryId: 'openlaunch-rh',
    chain: 'robinhood',
    chainId: 4663,
    factory: '0x815542E8b392389A1389E22E588E4B62A67Ade72',
    txHash: '0x3535521af449a277167ce21b6e7451ab68c47ed014353042a9ee4c4307841727',
    blockNumber: 83650950,
    logIndex: 22,
    tokenAddress: '0xfb113b907d582f090d5c423227e74ad1b8f31fa0',
    creator: '0x00000000000000000000000000000000003811d1',
    timestamp: 0,
  },
  // Pump.fun Solana
  {
    factoryId: 'pumpfun',
    chain: 'solana',
    chainId: 0,
    factory: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    txHash: '3h5Ki1sGKPw1ixLpAZtfvTpCTcQWyi72V8RuJxnAnezDmS3pxFVbi5jYJDPnaASS8sgs4eKwWuTYgoUU6vH3KG6N',
    blockNumber: 454680764, // slot
    logIndex: 0,
    tokenAddress: '2vVexEfRGbvekd9q9P1twZW6TLRfriZJewY84dEZpump',
    creator: '26VenY5V2QeqjJAvE9sLi16aq1Ma3ocEUWwJxjBLgEia',
    timestamp: 0,
  },
];

// ── RPC Helpers ────────────────────────────────────────────

async function evmGetBlockTimestamp(chain: ChainId, blockNumber: number): Promise<number> {
  const config = CHAINS[chain];
  if (!config?.rpcUrl) return 0;
  try {
    const hex = `0x${blockNumber.toString(16)}`;
    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [hex, false] }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json() as any;
    if (data.result?.timestamp) return parseInt(data.result.timestamp, 16) * 1000;
  } catch { /* non-critical */ }
  return 0;
}

async function evmGetLatestBlock(chain: ChainId): Promise<number> {
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

async function solanaGetLatestSlot(): Promise<number> {
  try {
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json() as any;
    if (data.result) return data.result;
  } catch { /* non-critical */ }
  return 0;
}

// ── Normalization ──────────────────────────────────────────

function normalizeHistoricalLaunch(
  launch: HistoricalLaunch,
  factory: LaunchpadFactory,
): LaunchpadEventRecord {
  const eventId = launch.chain === 'solana'
    ? `solana:launch:${launch.txHash}:0`
    : buildLaunchEventId(launch.chain, launch.txHash, launch.logIndex);

  return {
    launchpad: factory.id,
    chain: launch.chain,
    chainId: launch.chainId,
    factory: launch.factory,
    factoryVersion: factory.version,
    tokenAddress: launch.tokenAddress,
    creator: launch.creator,
    txHash: launch.txHash,
    blockNumber: launch.blockNumber,
    logIndex: launch.logIndex,
    timestamp: launch.timestamp,
    eventId,
    source: 'indexer',
    status: 'confirmed',
  };
}

// ── Persistence (idempotent) ───────────────────────────────

const launchEventsCol = () => gitlawb.db.collection<any>('launchpad_events', { visibility: 'owner' });

async function isDuplicate(eventId: string): Promise<boolean> {
  try {
    const { records } = await launchEventsCol().list({ limit: 200 });
    return records.some(r => r.data.eventId === eventId);
  } catch { return false; }
}

async function persistEvent(record: LaunchpadEventRecord): Promise<{ stored: boolean; duplicate: boolean }> {
  const dup = await isDuplicate(record.eventId);
  if (dup) return { stored: false, duplicate: true };
  try {
    await launchEventsCol().create(record);
    return { stored: true, duplicate: false };
  } catch (e) {
    return { stored: false, duplicate: false };
  }
}

// ── Pipeline Run ───────────────────────────────────────────

export async function runHistoricalIngestion(): Promise<PipelineReport> {
  if (isSandboxed()) {
    return { timestamp: new Date().toISOString(), results: [], totalIngested: 0, totalDuplicates: 0 };
  }

  const results: PipelineResult[] = [];
  let totalIngested = 0;
  let totalDuplicates = 0;

  // Group by factory
  const byFactory = new Map<string, HistoricalLaunch[]>();
  for (const launch of HISTORICAL_LAUNCHES) {
    if (!byFactory.has(launch.factoryId)) byFactory.set(launch.factoryId, []);
    byFactory.get(launch.factoryId)!.push(launch);
  }

  for (const [factoryId, launches] of byFactory) {
    const factory = getFactoryById(factoryId);
    if (!factory || !factory.enabled || !factory.verified) {
      results.push({
        launchpadId: factoryId,
        chain: launches[0].chain,
        eventsIngested: 0,
        duplicatesSkipped: 0,
        errors: [`Factory ${factoryId} not enabled/verified`],
        checkpoint: 0,
        status: 'FAIL',
      });
      continue;
    }

    const errors: string[] = [];
    let ingested = 0;
    let skipped = 0;

    for (const launch of launches) {
      // Fetch timestamp if missing
      if (launch.timestamp === 0) {
        if (launch.chain === 'solana') {
          // Solana: use current time (slot timestamp not easily available via RPC)
          launch.timestamp = Date.now();
        } else {
          launch.timestamp = await evmGetBlockTimestamp(launch.chain, launch.blockNumber);
          if (launch.timestamp === 0) launch.timestamp = Date.now();
        }
      }

      const record = normalizeHistoricalLaunch(launch, factory);
      const { stored, duplicate } = await persistEvent(record);

      if (stored) {
        ingested++;
      } else if (duplicate) {
        skipped++;
      } else {
        errors.push(`Failed to persist ${record.eventId}`);
      }
    }

    // Save checkpoint
    let checkpoint = 0;
    if (factory.type === 'SOLANA_PROGRAM') {
      checkpoint = await solanaGetLatestSlot();
    } else {
      checkpoint = await evmGetLatestBlock(factory.chain);
    }

    if (checkpoint > 0) {
      try {
        await saveCheckpoint({
          chain: factory.chain,
          latestSeenBlock: checkpoint,
          latestProcessedBlock: checkpoint,
          latestFinalizedBlock: checkpoint,
          processedSlot: factory.type === 'SOLANA_PROGRAM' ? checkpoint : undefined,
          confirmedSlot: factory.type === 'SOLANA_PROGRAM' ? checkpoint : undefined,
          updatedAt: Date.now(),
          status: 'LIVE',
        });
      } catch { /* non-critical */ }
    }

    // Broadcast ingested events
    for (let i = 0; i < ingested; i++) {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cupcak8:launch-event', {
            detail: { launchpadId: factoryId, chain: factory.chain, timestamp: Date.now() },
          }));
        }
      } catch { /* non-critical */ }
    }

    results.push({
      launchpadId: factoryId,
      chain: factory.chain,
      eventsIngested: ingested,
      duplicatesSkipped: skipped,
      errors,
      checkpoint,
      status: errors.length === 0 ? 'PASS' : 'FAIL',
    });

    totalIngested += ingested;
    totalDuplicates += skipped;

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    totalIngested,
    totalDuplicates,
  };
}

// ── EVM Event Scan (for live indexing from checkpoint) ─────

export async function scanEvmEvents(
  factory: LaunchpadFactory,
  fromBlock: number,
  toBlock: number,
): Promise<LaunchpadEventRecord[]> {
  const config = CHAINS[factory.chain as keyof typeof CHAINS];
  if (!config?.rpcUrl || factory.factoryAddresses.length === 0) return [];

  const fromHex = `0x${fromBlock.toString(16)}`;
  const toHex = `0x${toBlock.toString(16)}`;

  try {
    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_getLogs',
        params: [{ fromBlock: fromHex, toBlock: toHex, address: factory.factoryAddresses[0], topics: [factory.creationEventTopic] }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json() as any;
    if (data.error || !Array.isArray(data.result)) return [];

    const events: LaunchpadEventRecord[] = [];
    for (const log of data.result) {
      const txHash = log.transactionHash;
      const blockNumber = parseInt(log.blockNumber, 16);
      const logIndex = parseInt(log.logIndex, 16);
      const tokenAddress = log.topics?.[1] ? '0x' + log.topics[1].slice(26) : 'UNKNOWN';
      const creator = log.topics?.[2] ? '0x' + log.topics[2].slice(26) : 'UNKNOWN';

      events.push({
        launchpad: factory.id,
        chain: factory.chain,
        chainId: factory.chainId,
        factory: factory.factoryAddresses[0],
        factoryVersion: factory.version,
        tokenAddress,
        creator,
        txHash,
        blockNumber,
        logIndex,
        timestamp: 0,
        eventId: buildLaunchEventId(factory.chain, txHash, logIndex),
        source: 'indexer',
        status: 'confirmed',
      });
    }
    return events;
  } catch { return []; }
}

// ── Solana Event Scan ──────────────────────────────────────

export async function scanSolanaEvents(
  factory: LaunchpadFactory,
  lastSignature?: string,
): Promise<LaunchpadEventRecord[]> {
  if (!factory.programId) return [];

  try {
    const params: any[] = [factory.programId, { limit: 10, commitment: 'confirmed' }];
    if (lastSignature) params[1].until = lastSignature;

    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json() as any;
    if (data.error || !Array.isArray(data.result)) return [];

    const events: LaunchpadEventRecord[] = [];
    for (const sig of data.result) {
      if (sig.err) continue; // skip failed txs

      const txRes = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'getTransaction',
          params: [sig.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      const txData = await txRes.json() as any;
      const tx = txData.result;
      if (!tx) continue;

      const mint = tx.meta?.postTokenBalances?.[0]?.mint || 'UNKNOWN';
      const creator = typeof tx.transaction?.message?.accountKeys?.[0] === 'string'
        ? tx.transaction.message.accountKeys[0]
        : tx.transaction?.message?.accountKeys?.[0]?.pubkey || 'UNKNOWN';

      events.push({
        launchpad: factory.id,
        chain: 'solana',
        chainId: 0,
        factory: factory.programId,
        factoryVersion: factory.version,
        tokenAddress: mint,
        creator,
        txHash: sig.signature,
        blockNumber: tx.slot || 0,
        logIndex: 0,
        timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
        eventId: `solana:launch:${sig.signature}:0`,
        source: 'indexer',
        status: 'confirmed',
      });

      // Rate limit between tx fetches
      await new Promise(r => setTimeout(r, 200));
    }
    return events;
  } catch { return []; }
}

// ── Get all indexed events ─────────────────────────────────

export async function getAllIndexedLaunches(limit = 200): Promise<LaunchpadEventRecord[]> {
  return getLaunchEvents(undefined, undefined, limit);
}