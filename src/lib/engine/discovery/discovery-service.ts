// Cupcak8 Swap — Discovery Service
// Orchestrates discovery adapters with cursors, retry, health tracking.
// Only processes verified sources. Unverified sources are explicitly blocked.
import type { DiscoveryAdapter, AdapterHealth, TokenIndexRecord } from './types';
import { indexTokens, getCursor, saveCursor, saveHealth, getAllHealth } from '../token-index';
import { renewLock } from './discovery-lock';
import { createOpenLaunchAdapter } from './adapters/openlaunch-events';
import { createPumpFunAdapter } from './adapters/pumpfun-program';
import { createBagsApiAdapter } from './adapters/bags-api';
import { createDexScreenerNewPairsAdapter } from './adapters/dexscreener-newpairs';
import { createPumpSwapAdapter } from './adapters/pumpswap-amm';
import { createRaydiumCpmmAdapter } from './adapters/raydium-cpmm';
import { createGeckoTerminalNewPoolsAdapter } from './adapters/geckoterminal-newpools';

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
// Native Solana DEX adapters — detects new pools directly on-chain
registerAdapter(createPumpSwapAdapter());    // Pump.fun graduation → PumpSwap AMM
registerAdapter(createRaydiumCpmmAdapter()); // Raydium CPMM (memecoin pools)
// Broad catch-all: DexScreener covers every DEX and launchpad we don't have
// a native adapter for yet (Meteora, Orca, PancakeSwap, Uniswap, FOUR.MEME,
// FLAP, Moonshot, etc.).
registerAdapter(createDexScreenerNewPairsAdapter());
// GeckoTerminal new-pools: the most comprehensive real-time source — covers
// ALL Solana DEXes (Pump.fun, Raydium, Meteora, Orca, Jupiter, etc.) and
// provides price/volume/liquidity inline (no separate enrichment needed).
registerAdapter(createGeckoTerminalNewPoolsAdapter());

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

      // Persist discovered tokens (idempotent).
      // Preserve market data from adapters that provide it (e.g. GeckoTerminal
      // returns price/volume/liquidity inline — no separate enrichment needed).
      const fullRecords: TokenIndexRecord[] = result.tokens.map(t => {
        const hasMarketData = (t as any).price != null;
        return {
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
          marketDataStatus: hasMarketData ? 'enriched' : t.marketDataStatus!,
          lastEnrichedAt: hasMarketData ? Date.now() : null,
          price: (t as any).price ?? null,
          volume24h: (t as any).volume24h ?? null,
          liquidity: (t as any).liquidity ?? null,
          marketCap: (t as any).marketCap ?? null,
          priceSource: hasMarketData ? 'dex_pair' : 'none',
          liquidityType: (t as any).liquidity != null ? 'real' : null,
          marketState: (t as any).marketState ?? 'unknown',
          tradeCount24h: null, buys24h: null, sells24h: null,
          holdersEstimate: null, bondingCurveProgress: null,
          routeVerified: false, routeVerifiedAt: null, routeProvider: null,
          routeDirection: null, routeError: null,
          routeBuyVerified: false, routeSellVerified: false,
          routeBothVerified: false,
          name: t.name ?? null, symbol: t.symbol ?? null, icon: t.icon ?? null,
          websites: t.websites ?? null, socials: t.socials ?? null,
          createdAt: Date.now(), updatedAt: Date.now(),
        };
      });



      const newCount = await indexTokens(fullRecords);

      // Save cursor ONLY after successful persistence
      if (result.errors.length === 0) {
        await saveCursor(result.cursor);
      }

      // Save health
      await saveHealth(adapter.getHealth());

      totalNew += newCount.added;
      totalScanned += result.scanned;
      if (result.errors.length > 0) allErrors.push(...result.errors.map(e => `[${adapter.id}] ${e}`));

      adapterResults[adapter.id] = { new: newCount.added, scanned: result.scanned, errors: result.errors };

      // Renew lock between adapters — Solana RPC calls are slow and multiple
      // adapters can push total cycle time past the lock TTL.
      await renewLock();
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

/** Get PumpPortal real-time stream stats (for health display). */
export async function getPumpPortalStats() {
  try {
    const { getStreamStats } = await import('./pumpportal-stream');
    return getStreamStats();
  } catch {
    return null;
  }
}
