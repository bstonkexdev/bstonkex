// Cupcak8 Swap — Discovery Service
// Orchestrates discovery adapters with cursors, retry, health tracking.
// Only processes verified sources. Unverified sources are explicitly blocked.
import type { ChainId } from '../../config';
import type { DiscoveryAdapter, DiscoveryCursor, AdapterHealth, TokenIndexRecord } from './types';
import { indexTokens, getCursor, saveCursor, saveHealth, getAllHealth } from '../token-index';
import { createOpenLaunchAdapter } from './adapters/openlaunch-events';
import { createPumpFunAdapter } from './adapters/pumpfun-program';
import { createBagsApiAdapter } from './adapters/bags-api';

// ── Registered Adapters (verified sources only) ─────────────

const adapters: DiscoveryAdapter[] = [];
const blockedSources: Record<string, string> = {
  'flap-portal': 'Event ABI unverified — need BscScan verified source',
  'flap-vault': 'Event ABI unverified — need BscScan verified source',
  'four-meme-v1': 'Event topic unverified — impl resolved but ABI unknown',
  'four-meme-v2': 'Event topic unverified — impl resolved but ABI unknown',
  'genius': 'Factory address unknown',
  'o1-exchange-base': 'Factory address unknown',
  'o1-exchange-rh': 'Factory address unknown',
  'basestonk': 'Factory address unknown',
  'pons-v1': 'Event ABI unverified — contract deployed but no topic',
  'pons-v2': 'Factory address unknown',
  'b20': 'Base Sepolia only — not mainnet',
  'long': 'Factory address unknown',
  'ponsion': 'Factory address unknown',
  'stonk-sol': 'Program ID unknown — identity ambiguous',
};

function registerAdapter(adapter: DiscoveryAdapter) {
  adapters.push(adapter);
}

// Initialize verified adapters
registerAdapter(createOpenLaunchAdapter('base'));
registerAdapter(createOpenLaunchAdapter('robinhood'));
registerAdapter(createPumpFunAdapter());
registerAdapter(createBagsApiAdapter());

// ── Discovery Service ───────────────────────────────────────

let isRunning = false;
let scanIntervalMs = 30000; // 30 seconds between scans
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Run a single scan cycle across all adapters. */
export async function runDiscoveryCycle(): Promise<{
  totalNew: number;
  totalScanned: number;
  errors: string[];
  adapterResults: Record<string, { new: number; scanned: number; errors: string[] }>;
}> {
  const allErrors: string[] = [];
  const adapterResults: Record<string, { new: number; scanned: number; errors: string[] }> = {};
  let totalNew = 0;
  let totalScanned = 0;

  for (const adapter of adapters) {
    try {
      // Get cursor (persisted position)
      const cursor = await getCursor(adapter.chainId, adapter.id);

      // Scan
      const result = await adapter.scan(cursor);

      // Persist discovered tokens (idempotent)
      const fullRecords: TokenIndexRecord[] = result.tokens.map(t => ({
        chainId: t.chainId!,
        address: t.address!,
        launchpadId: t.launchpadId!,
        launchpadName: t.launchpadName!,
        creator: t.creator ?? null,
        launchTimestamp: t.launchTimestamp!,
        blockNumber: t.blockNumber ?? null,
        solanaSlot: t.solanaSlot ?? null,
        sourceTxHash: t.sourceTxHash!,
        sourceLogIndex: t.sourceLogIndex ?? 0,
        discoverySource: t.discoverySource!,
        discoveryStatus: t.discoveryStatus!,
        marketDataStatus: t.marketDataStatus!,
        lastEnrichedAt: null,
        price: null, volume24h: null, liquidity: null, marketCap: null,
        routeVerified: false, routeVerifiedAt: null, routeProvider: null,
        routeDirection: null, routeError: null,
        routeBuyVerified: false, routeSellVerified: false,
        routeBothVerified: false,
        name: t.name ?? null, symbol: t.symbol ?? null, icon: t.icon ?? null,
        createdAt: Date.now(), updatedAt: Date.now(),
      }));

      const newCount = await indexTokens(fullRecords);

      // Save cursor ONLY after successful persistence
      if (result.errors.length === 0) {
        await saveCursor(result.cursor);
      }

      // Save health
      await saveHealth(adapter.getHealth());

      totalNew += newCount;
      totalScanned += result.scanned;
      if (result.errors.length > 0) allErrors.push(...result.errors.map(e => `[${adapter.id}] ${e}`));

      adapterResults[adapter.id] = { new: newCount, scanned: result.scanned, errors: result.errors };
    } catch (e: any) {
      const errMsg = `[${adapter.id}] fatal: ${e.message}`;
      allErrors.push(errMsg);
      adapterResults[adapter.id] = { new: 0, scanned: 0, errors: [errMsg] };
    }
  }

  return { totalNew, totalScanned, errors: allErrors, adapterResults };
}

/** Start periodic discovery scanning. */
export function startDiscovery(intervalMs?: number): void {
  if (isRunning) return;
  isRunning = true;
  if (intervalMs) scanIntervalMs = intervalMs;

  // Run immediately, then on interval
  runDiscoveryCycle().catch(() => {});
  intervalHandle = setInterval(() => {
    if (!isRunning) return;
    runDiscoveryCycle().catch(() => {});
  }, scanIntervalMs);
}

/** Stop periodic discovery. */
export function stopDiscovery(): void {
  isRunning = false;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/** Check if discovery is active. */
export function isDiscoveryRunning(): boolean {
  return isRunning;
}

// ── Health & Status ─────────────────────────────────────────

export async function getDiscoveryHealth(): Promise<{
  adapters: AdapterHealth[];
  blocked: Record<string, string>;
  isRunning: boolean;
}> {
  const health = await getAllHealth();
  return {
    adapters: health.length > 0 ? health : adapters.map(a => a.getHealth()),
    blocked: blockedSources,
    isRunning,
  };
}

/** Get adapter list for external inspection. */
export function getRegisteredAdapters(): DiscoveryAdapter[] {
  return [...adapters];
}

/** Get blocked sources map. */
export function getBlockedSources(): Record<string, string> {
  return { ...blockedSources };
}
