// Cupcak8 Swap — Launchpad Indexing Engine
// Uses the canonical factory registry for event-based token discovery.
// Routes launchpad data requests through the adapter registry.
import type { ChainId } from '../config';
import { getDiscovery, type MarketToken, type DiscoveryCategory } from '../market-discovery';
import { cacheGetOrCompute } from './cache';
import { LAUNCHPAD_REGISTRY } from '../launchpads';
import {
  getAdapter,
  getLaunchpadTokensFromAdapter,
  getLaunchpadAdapterHealth,
  type LaunchpadHealth,
} from './launchpad-adapters';
import {
  LAUNCHPAD_FACTORIES,
  getFactoryByAddress,
  getEnabledFactoriesByChain,
  getFactoryAddressesForChain,
  getCreationTopicsForChain,
  buildLaunchEventId,
  type LaunchpadFactory,
  type LaunchpadEventRecord,
} from './launchpad-registry';
import { gitlawb } from '../gitlawb';

// ── Persistent Launch Events ───────────────────────────────

const launchEventsCol = () => gitlawb.db.collection<any>('launchpad_events', { visibility: 'owner' });

/** Persist a launch event. Deduplicates by deterministic eventId. */
export async function storeLaunchEvent(event: LaunchpadEventRecord): Promise<boolean> {
  try {
    const col = launchEventsCol();
    const { records } = await col.list({ limit: 1 });
    if (records.some(r => r.data.eventId === event.eventId)) return false;
    await col.create(event);
    return true;
  } catch { return false; }
}

/** Get recent launch events for a chain/launchpad. */
export async function getLaunchEvents(chainId?: ChainId, launchpadId?: string, limit = 50): Promise<LaunchpadEventRecord[]> {
  try {
    const { records } = await launchEventsCol().list({ limit });
    let events = records.map(r => r.data);
    if (chainId) events = events.filter(e => e.chain === chainId);
    if (launchpadId) events = events.filter(e => e.launchpad === launchpadId);
    return events.sort((a, b) => b.timestamp - a.timestamp);
  } catch { return []; }
}

// ── Factory-to-Launchpad Mapping ───────────────────────────

/** Map a factory address to its Cupcak8 Swap launchpad ID */
export function mapFactoryToLaunchpad(chain: ChainId, factoryAddress: string): string | null {
  const factory = getFactoryByAddress(chain, factoryAddress);
  if (factory) return factory.id;
  return null;
}

// ── DEX-to-launchpad mapping (for attribution fallback) ────
const DEX_LAUNCHPAD_MAP: Record<string, Record<string, string>> = {
  bsc: { 'pancakeswap': 'flap' },
  base: { 'openlaunch': 'openlaunch-base', 'uniswap': 'o1-exchange' },
  solana: { 'pumpfun': 'pumpfun', 'pump.fun': 'pumpfun', 'raydium': 'pumpfun' },
  robinhood: { 'openlaunch': 'openlaunch-rh' },
};

export type LaunchpadDiscoveryCategory = DiscoveryCategory;

// ── Core functions ─────────────────────────────────────────

/** Attribute a token to a launchpad (DEX mapping fallback) */
export function attributeLaunchpad(token: MarketToken): string | null {
  if (token.launchpadId) return token.launchpadId;
  const chainMap = DEX_LAUNCHPAD_MAP[token.chainId];
  if (chainMap && token.dexId) {
    const mapped = chainMap[token.dexId.toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}

/** Enrich tokens with launchpad attribution */
export function enrichWithLaunchpad(tokens: MarketToken[]): MarketToken[] {
  return tokens.map(token => {
    const launchpadId = attributeLaunchpad(token);
    if (!launchpadId) return token;
    let launchpadName: string | undefined;
    for (const chainData of Object.values(LAUNCHPAD_REGISTRY)) {
      const lp = chainData.launchpads.find(l => l.id === launchpadId);
      if (lp) { launchpadName = lp.name; break; }
    }
    return { ...token, launchpadId, launchpadName };
  });
}

/** Filter tokens by launchpad ID */
export function filterByLaunchpad(tokens: MarketToken[], launchpadId: string): MarketToken[] {
  return tokens.filter(t => t.launchpadId === launchpadId);
}

/**
 * Get all tokens for a specific launchpad.
 * Priority: internal token index > dedicated adapter > DexScreener attribution.
 */
export async function getLaunchpadTokens(
  chainId: ChainId,
  launchpadId: string,
  category: LaunchpadDiscoveryCategory = 'trending'
): Promise<MarketToken[]> {
  const cacheKey = `launchpad-${chainId}-${launchpadId}-${category}`;

  return cacheGetOrCompute(cacheKey, async () => {
    // 1. Try internal token index (discovery pipeline — includes tokens DexScreener hasn't indexed)
    try {
      const { listIndexedTokens } = await import('./token-index');
      const indexed = await listIndexedTokens({ chainId, launchpadId, limit: 100 });
      if (indexed.length > 0) {
        return indexed.map((r: any) => ({
          chainId: r.chainId,
          address: r.address,
          name: r.name || 'Unknown',
          symbol: r.symbol || '???',
          price: r.price,
          priceChange5m: null, priceChange1h: null, priceChange6h: null, priceChange24h: null,
          volume5m: null, volume1h: null, volume6h: null, volume24h: r.volume24h,
          liquidity: r.liquidity, marketCap: r.marketCap, fdv: null,
          buys5m: null, sells5m: null, buys1h: null, sells1h: null, buys24h: null, sells24h: null,
          pairAddress: '', dexId: r.discoverySource,
          pairCreatedAt: r.launchTimestamp,
          icon: r.icon, url: null,
          launchpadId: r.launchpadId, launchpadName: r.launchpadName,
          ageMs: Date.now() - r.launchTimestamp,
          buySellRatio24h: null,
          tradability: r.marketDataStatus === 'enriched' && (r as any).routeBothVerified && (r.liquidity ?? 0) > 1000
            ? 'tradable'
            : r.marketDataStatus === 'enriched' && (r.liquidity ?? 0) > 1000
              ? 'data_only'
              : r.marketDataStatus === 'enriched' && r.liquidity ? 'no_liquidity' : 'data_only',
          dataFreshness: (r.lastEnrichedAt && Date.now() - r.lastEnrichedAt < 300000) ? 'live' : 'recent',
        } as MarketToken));
      }
    } catch { /* token index unavailable */ }

    // 2. Try dedicated adapter (DexScreener enrichment)
    const adapter = getAdapter(launchpadId);
    if (adapter) {
      return adapter.getDiscovery(category as any);
    }

    // 3. Fallback: DexScreener discovery + attribution filter
    const allTokens = await getDiscovery(category);
    const chainTokens = allTokens.filter(t => t.chainId === chainId);
    const enriched = enrichWithLaunchpad(chainTokens);
    return filterByLaunchpad(enriched, launchpadId);
  }, 60_000);
}

/** Get launchpad health status */
export function getLaunchpadStatus(chainId: ChainId, launchpadId: string): {
  status: 'active' | 'indexing_delayed' | 'offline' | 'not_configured';
  tokensIndexed: number;
  health: LaunchpadHealth | null;
} {
  const health = getLaunchpadAdapterHealth(launchpadId);
  return { status: health.status, tokensIndexed: health.tokensIndexed, health };
}

/** Get registry status summary for admin dashboard */
export function getRegistryStatus(): Array<{
  id: string; name: string; chain: ChainId; verified: boolean; enabled: boolean; source: string;
}> {
  return LAUNCHPAD_FACTORIES.map((f: LaunchpadFactory) => ({
    id: f.id,
    name: f.name,
    chain: f.chain,
    verified: f.verified,
    enabled: f.enabled,
    source: f.source,
  }));
}
