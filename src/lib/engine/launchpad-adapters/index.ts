// Cupcak8 Swap — Launchpad Adapter Registry
// Central registry for all launchpad data adapters.
// Uses internal token index (discovery) + DexScreener enrichment (market data).
import type { ChainId } from '../../config';
import type { MarketToken, DiscoveryCategory } from '../../market-discovery';
import {
  getOpenLaunchTokens,
  getOpenLaunchDiscovery,
  getOpenLaunchHealth,
  invalidateOpenLaunchCache,
  type LaunchpadHealth,
} from './openlaunch-adapter';
import { listIndexedTokens } from '../token-index';

export type { LaunchpadHealth };

export interface LaunchpadAdapter {
  id: string;
  chainId: ChainId;
  getTokens: () => Promise<MarketToken[]>;
  getDiscovery: (category: DiscoveryCategory) => Promise<MarketToken[]>;
  getHealth: () => LaunchpadHealth;
  invalidateCache: () => void;
}

// ── Adapter registry ───────────────────────────────────────

const adapters = new Map<string, LaunchpadAdapter>();

function register(adapter: LaunchpadAdapter) {
  adapters.set(adapter.id, adapter);
}

// Register OpenLaunch (Base chain) — DexScreener enrichment adapter
register({
  id: 'openlaunch-base',
  chainId: 'base',
  getTokens: getOpenLaunchTokens,
  getDiscovery: getOpenLaunchDiscovery,
  getHealth: getOpenLaunchHealth,
  invalidateCache: invalidateOpenLaunchCache,
});

// ── Token Index → MarketToken converter ─────────────────────

function indexRecordToMarketToken(record: any): MarketToken {
  return {
    chainId: record.chainId,
    address: record.address,
    name: record.name || 'Unknown',
    symbol: record.symbol || '???',
    price: record.price,
    priceChange5m: null,
    priceChange1h: null,
    priceChange6h: null,
    priceChange24h: null,
    volume5m: null,
    volume1h: null,
    volume6h: null,
    volume24h: record.volume24h,
    liquidity: record.liquidity,
    marketCap: record.marketCap,
    fdv: null,
    buys5m: null, sells5m: null,
    buys1h: null, sells1h: null,
    buys24h: null, sells24h: null,
    pairAddress: '',
    dexId: record.discoverySource,
    pairCreatedAt: record.launchTimestamp,
    icon: record.icon,
    url: null,
    launchpadId: record.launchpadId,
    launchpadName: record.launchpadName,
    ageMs: Date.now() - record.launchTimestamp,
    buySellRatio24h: null,
    tradability: record.marketDataStatus === 'enriched' && (record as any).routeBothVerified && record.liquidity != null && record.liquidity >= 1000
      ? 'tradable' // Execution-verified + liquidity-qualified
      : record.marketDataStatus === 'enriched' && record.liquidity != null && record.liquidity >= 1000
        ? 'data_only' // liquidity_qualified but NOT execution-verified
        : record.marketDataStatus === 'enriched' && record.liquidity ? 'no_liquidity' : 'data_only',
    dataFreshness: record.lastEnrichedAt && Date.now() - record.lastEnrichedAt < 300000 ? 'live' : 'recent',
  };
}

// ── Public API ─────────────────────────────────────────────

/** Get adapter for a launchpad ID */
export function getAdapter(launchpadId: string): LaunchpadAdapter | null {
  return adapters.get(launchpadId) ?? null;
}

/** Get all tokens for a launchpad (uses token index first, adapter fallback) */
export async function getLaunchpadTokensFromAdapter(
  chainId: ChainId,
  launchpadId: string,
  category: DiscoveryCategory = 'trending'
): Promise<MarketToken[]> {
  // 1. Try internal token index (discovery pipeline)
  const indexed = await listIndexedTokens({ chainId, launchpadId, limit: 100 });
  if (indexed.length > 0) {
    return indexed.map(indexRecordToMarketToken);
  }

  // 2. Fallback to registered adapter (DexScreener enrichment)
  const adapter = adapters.get(launchpadId);
  if (adapter) {
    return adapter.getDiscovery(category as any);
  }

  // 3. No data source available
  return [];
}

/** Get health status for a launchpad integration */
export function getLaunchpadAdapterHealth(launchpadId: string): LaunchpadHealth {
  const adapter = adapters.get(launchpadId);
  if (adapter) return adapter.getHealth();
  return { status: 'not_configured', lastSync: null, tokensIndexed: 0, lastEvent: null, latencyMs: null };
}

/** Invalidate all adapter caches */
export function invalidateAllCaches(): void {
  for (const adapter of adapters.values()) {
    adapter.invalidateCache();
  }
}
