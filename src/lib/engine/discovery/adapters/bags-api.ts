// Cupcak8 Swap — Bags API Discovery Adapter (Solana)
// Discovers new tokens via the Bags v2 API: GET /v2/launches
// Tracks: Pumpfun, Stonkfun, Dbc, Moonshot (verified from API response).
// Public API — no authentication required.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const BAGS_API = 'https://data-api.bags.fm';
const LAUNCHPAD_MAP: Record<string, { id: string; name: string }> = {
  'Pumpfun': { id: 'pumpfun', name: 'Pump.fun' },
  'Stonkfun': { id: 'stonkfun', name: 'Stonkfun' },
  'Dbc': { id: 'dbc', name: 'DBC' },
  'Moonshot': { id: 'moonshot', name: 'Moonshot' },
};

interface BagsLaunch {
  ts: string;
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  launchpad: string;
  feeShareDeployer: string | null;
}

async function fetchLaunches(): Promise<BagsLaunch[]> {
  const resp = await fetch(`${BAGS_API}/v2/launches?limit=100`, {
    signal: AbortSignal.timeout(15000),
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) throw new Error(`Bags API ${resp.status}`);
  const data = await resp.json();
  return data.launches || [];
}

export function createBagsApiAdapter(): DiscoveryAdapter {
  // Track the last seen timestamp to avoid re-processing
  let lastSeenTs = 0;

  let health: AdapterHealth = {
    adapterId: 'bags-api-solana',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'bags-api-solana',
    launchpadId: 'bags',
    launchpadName: 'Bags',
    chainId: 'solana' as ChainId,
    method: 'bags_api',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];

      try {
        const launches = await fetchLaunches();
        if (!launches.length) return { tokens: [], cursor, scanned: 0, errors };

        // Use cursor.solanaSlot as a timestamp proxy (ms epoch for API-based sources)
        const cursorTs = cursor.solanaSlot ?? 0;
        const effectiveCursor = Math.max(cursorTs, lastSeenTs);

        let maxTs = effectiveCursor;
        let scanned = 0;

        for (const launch of launches) {
          const ts = new Date(launch.ts).getTime();
          scanned++;

          // Skip already processed launches
          if (ts <= effectiveCursor) continue;

          // Only index tokens with verified launchpad attribution
          const lpInfo = LAUNCHPAD_MAP[launch.launchpad];
          if (!lpInfo) continue;

          tokens.push({
            chainId: 'solana' as ChainId,
            address: launch.mint,
            launchpadId: lpInfo.id,
            launchpadName: lpInfo.name,
            creator: launch.creator,
            launchTimestamp: ts,
            blockNumber: null,
            solanaSlot: ts, // using timestamp as cursor for API-based source
            sourceTxHash: launch.signature,
            sourceLogIndex: 0,
            discoverySource: 'bags_api',
            discoveryStatus: 'verified',
            marketDataStatus: 'awaiting',
            name: launch.name,
            symbol: launch.symbol,
            icon: null,
          });

          if (ts > maxTs) maxTs = ts;
        }

        lastSeenTs = maxTs;

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          cursorPosition: `ts ${new Date(maxTs).toISOString()}`,
          tokensDiscovered: health.tokensDiscovered + tokens.length,
        };

        return {
          tokens,
          cursor: { ...cursor, solanaSlot: maxTs, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned,
          errors,
        };
      } catch (e: any) {
        errors.push(`Bags API scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens: [], cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}
