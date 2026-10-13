// Cupcak8 Swap — GeckoTerminal New Pools Discovery Adapter
// Catches newly created pools across ALL Solana DEXes in real-time.
// This is the most comprehensive new-token discovery source — covers Pump.fun,
// Raydium, Meteora, Orca, Jupiter, and every other DEX that GeckoTerminal tracks.
//
// Endpoint: GET /api/v2/networks/{network}/new_pools
// Rate limits: ~30 req/min (free tier). We poll once per discovery cycle.
//
// This is the closest equivalent to ave.ai's real-time new-pair feed.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

// Chain → GeckoTerminal network slug
const NETWORK_MAP: Record<string, string> = {
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  robinhood: 'robinhood',
  ethereum: 'eth',
};

// GeckoTerminal DEX ID → Cupcak8 launchpad attribution
const DEX_LAUNCHPAD_MAP: Record<string, { id: string; name: string }> = {
  'pump-fun': { id: 'pumpfun', name: 'Pump.fun' },
  'pump-swap': { id: 'pumpswap', name: 'PumpSwap' },
  'raydium': { id: 'raydium', name: 'Raydium' },
  'raydium-v4': { id: 'raydium', name: 'Raydium' },
  'raydium-cp': { id: 'raydium', name: 'Raydium' },
  'raydium-clmm': { id: 'raydium', name: 'Raydium' },
  'meteora': { id: 'meteora', name: 'Meteora' },
  'meteora-dlmm': { id: 'meteora', name: 'Meteora' },
  'orca': { id: 'orca', name: 'Orca' },
  'whirlpool': { id: 'orca', name: 'Orca' },
  'jupiter': { id: 'jupiter', name: 'Jupiter' },
  'openbook': { id: 'openbook', name: 'OpenBook' },
};

interface GeckoPool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string | null;
    volume_usd: { h24: string | null; h1: string | null };
    reserve_in_usd: string | null;
    pool_created_at: string;
    fdv_usd: string | null;
    market_cap_usd: string | null;
  };
  relationships: {
    base_token: { data: { id: string; type: string } };
    quote_token: { data: { id: string; type: string } };
    dex: { data: { id: string; type: string } };
  };
}

function extractAddress(tokenId: string): string {
  // GeckoTerminal IDs are like "solana_3FQvi6g...pump" — remove network prefix
  const parts = tokenId.split('_');
  return parts.length > 1 ? parts.slice(1).join('_') : tokenId;
}

export function createGeckoTerminalNewPoolsAdapter(): DiscoveryAdapter {
  const seen = new Set<string>();
  const MAX_SEEN = 5000;

  let health: AdapterHealth = {
    adapterId: 'geckoterminal-newpools',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'geckoterminal-newpools',
    launchpadId: 'geckoterminal',
    launchpadName: 'GeckoTerminal',
    chainId: 'solana' as ChainId, // Primary chain; scans multiple networks
    method: 'dexscreener_fallback' as const,

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];
      const startMs = Date.now();

      try {
        // Scan Solana new pools (primary market)
        const network = 'solana';
        const resp = await fetch(`${GECKOTERMINAL_API}/networks/${network}/new_pools?page=1`, {
          signal: AbortSignal.timeout(12000),
          headers: { 'Accept': 'application/json' },
        });

        if (!resp.ok) {
          errors.push(`GeckoTerminal API error: ${resp.status}`);
          health = { ...health, lastErrorAt: Date.now(), lastError: `HTTP ${resp.status}`, status: 'error' };
          return { tokens: [], cursor, scanned: 0, errors };
        }

        const data = await resp.json();
        const pools: GeckoPool[] = data?.data || [];

        for (const pool of pools) {
          try {
            const baseTokenId = pool.relationships?.base_token?.data?.id;
            if (!baseTokenId) continue;

            const baseAddress = extractAddress(baseTokenId);
            const key = `${network}:${baseAddress.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const attrs = pool.attributes;
            const dexId = pool.relationships?.dex?.data?.id || 'unknown';
            const lpInfo = DEX_LAUNCHPAD_MAP[dexId];

            const price = attrs.base_token_price_usd ? parseFloat(attrs.base_token_price_usd) : null;
            const volume24h = attrs.volume_usd?.h24 ? parseFloat(attrs.volume_usd.h24) : null;
            const liquidity = attrs.reserve_in_usd ? parseFloat(attrs.reserve_in_usd) : null;
            const marketCap = attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : (attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null);
            const createdAt = attrs.pool_created_at ? new Date(attrs.pool_created_at).getTime() : Date.now();

            // Extract token name/symbol from pool name (format: "TOKEN / SOL")
            const nameParts = attrs.name.split('/').map((s: string) => s.trim());
            const symbol = nameParts[0] || null;
            const name = nameParts[0] || null;

            tokens.push({
              chainId: 'solana' as ChainId,
              address: baseAddress,
              launchpadId: lpInfo?.id ?? dexId,
              launchpadName: lpInfo?.name ?? dexId,
              creator: null,
              launchTimestamp: createdAt,
              blockNumber: null,
              solanaSlot: null,
              sourceTxHash: pool.attributes.address, // pool address as source
              sourceLogIndex: 0,
              discoverySource: 'geckoterminal_newpools',
              discoveryStatus: 'verified',
              marketDataStatus: price !== null ? 'enriched' : 'awaiting',
              name,
              symbol,
              icon: null,
              // GeckoTerminal provides market data directly — no separate enrichment needed
              price: price ?? undefined,
              volume24h: volume24h ?? undefined,
              liquidity: liquidity ?? undefined,
              marketCap: marketCap ?? undefined,
              marketState: 'launched',
              websites: null,
              socials: null,
            } as any);

            // Evict old entries
            if (seen.size > MAX_SEEN) {
              const iter = seen.values();
              for (let j = 0; j < 500; j++) {
                const { value, done } = iter.next();
                if (done) break;
                seen.delete(value);
              }
            }
          } catch (e: any) {
            errors.push(`GeckoTerminal pool parse failed: ${e.message}`);
          }
        }

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          latencyMs: Date.now() - startMs,
          tokensDiscovered: health.tokensDiscovered + tokens.length,
          cursorPosition: `${tokens.length} new pools from ${pools.length} scanned`,
        };

        return {
          tokens,
          cursor: { ...cursor, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned: pools.length,
          errors,
        };
      } catch (e: any) {
        errors.push(`GeckoTerminal new pools scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens: [], cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}