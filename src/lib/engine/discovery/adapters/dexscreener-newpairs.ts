// Cupcak8 Swap — DexScreener New Pairs Discovery Adapter
// Catches newly created DEX pairs across ALL chains and launchpads.
// This is the "catch-all" that ensures no token is missed even when
// a launchpad-specific adapter isn't configured (e.g. FOUR.MEME, FLAP,
// Raydium, PumpSwap, Uniswap V3, etc.).
//
// Strategy: poll DexScreener's token-profiles + token-boosts endpoints
// for recently active tokens, then fetch full pair data to get price,
// volume, liquidity, and launchpad attribution from dexId/pair metadata.
//
// Rate limits: DexScreener allows ~300 req/min. We batch and throttle.
import type { ChainId } from '../../../config';
import type { DiscoveryAdapter, DiscoveryCursor, DiscoveryScanResult, AdapterHealth, TokenIndexRecord } from '../types';

const DEXSCREENER_API = 'https://api.dexscreener.com';

// Chain ID mapping: DexScreener chainId → Cupcak8 ChainId
const CHAIN_MAP: Record<string, ChainId> = {
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  robinhood: 'robinhood',
  ethereum: 'base',  // map ETH to base for now (no ETH chain configured)
};

// DEX ID → launchpad attribution heuristic
// These map DexScreener's dexId to our launchpadId where possible
const DEX_LAUNCHPAD_MAP: Record<string, { id: string; name: string }> = {
  'raydium': { id: 'raydium', name: 'Raydium' },
  'raydium-clmm': { id: 'raydium', name: 'Raydium' },
  'raydium-cp': { id: 'raydium', name: 'Raydium' },
  'pumpfun': { id: 'pumpfun', name: 'Pump.fun' },
  'pump-swap': { id: 'pumpswap', name: 'PumpSwap' },
  'meteora': { id: 'meteora', name: 'Meteora' },
  'meteora-dlmm': { id: 'meteora', name: 'Meteora' },
  'orca': { id: 'orca', name: 'Orca' },
  'uniswap': { id: 'uniswap', name: 'Uniswap' },
  'uniswap-v3': { id: 'uniswap', name: 'Uniswap' },
  'pancakeswap': { id: 'pancakeswap', name: 'PancakeSwap' },
  'pancakeswap-v3': { id: 'pancakeswap', name: 'PancakeSwap' },
  'sushiswap': { id: 'sushiswap', name: 'SushiSwap' },
  'aerodrome': { id: 'aerodrome', name: 'Aerodrome' },
  'aerodrome-slipstream': { id: 'aerodrome', name: 'Aerodrome' },
  'base-swap': { id: 'baseswap', name: 'BaseSwap' },
  'alien-base': { id: 'alienbase', name: 'AlienBase' },
  'four-meme': { id: 'four-meme', name: 'FOUR.MEME' },
  'four.meme': { id: 'four-meme', name: 'FOUR.MEME' },
  'flap': { id: 'flap', name: 'FLAP' },
  'flap.sh': { id: 'flap', name: 'FLAP' },
  'stonkfun': { id: 'stonkfun', name: 'Stonkfun' },
  'dbc': { id: 'dbc', name: 'DBC' },
  'moonshot': { id: 'moonshot', name: 'Moonshot' },
};

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  volume?: { h24?: number; h1?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  txns?: { h24?: { buys: number; sells: number } };
  info?: { imageUrl?: string; websites?: any[]; socials?: any[] };
  url?: string;
}

function throttle(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<any> {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Accept': 'application/json' },
  });
  if (!resp.ok) return null;
  return resp.json();
}

export function createDexScreenerNewPairsAdapter(): DiscoveryAdapter {
  // Track processed addresses to avoid re-indexing within a session
  const seen = new Set<string>();
  const MAX_SEEN = 5000;

  let health: AdapterHealth = {
    adapterId: 'dexscreener-newpairs',
    status: 'active',
    lastSuccessAt: null, lastErrorAt: null, lastError: null,
    tokensDiscovered: 0, cursorPosition: null, latencyMs: null,
  };

  return {
    id: 'dexscreener-newpairs',
    launchpadId: 'dexscreener',
    launchpadName: 'DexScreener',
    chainId: 'solana' as ChainId, // multi-chain adapter — chainId is primary
    method: 'dexscreener_fallback',

    async scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult> {
      const errors: string[] = [];
      const tokens: Partial<TokenIndexRecord>[] = [];
      const startMs = Date.now();

      try {
        // 1. Fetch recently profiled tokens (catches boosted/new tokens)
        const profiles = await fetchJson(`${DEXSCREENER_API}/token-profiles/latest/v1`);
        await throttle(400); // respect rate limits

        // 2. Fetch recently boosted tokens
        const boosts = await fetchJson(`${DEXSCREENER_API}/token-boosts/latest/v1`);
        await throttle(400);

        // Collect unique addresses from both sources
        const addressSet = new Set<string>();
        if (Array.isArray(profiles)) {
          for (const p of profiles) {
            if (p?.tokenAddress) addressSet.add(p.tokenAddress.toLowerCase());
          }
        }
        if (Array.isArray(boosts)) {
          for (const b of boosts) {
            if (b?.tokenAddress) addressSet.add(b.tokenAddress.toLowerCase());
          }
        }

        // Filter out already-seen addresses (boosted batch for broader coverage)
        const newAddresses = [...addressSet].filter(a => !seen.has(a)).slice(0, 80);
        if (newAddresses.length === 0) {
          health = { ...health, lastSuccessAt: Date.now(), latencyMs: Date.now() - startMs };
          return { tokens: [], cursor: { ...cursor, lastRunAt: Date.now(), lastSuccessAt: Date.now() }, scanned: 0, errors };
        }

        // 3. Fetch pair data for new addresses (batched, 5 at a time with throttle)
        const pairs: DexScreenerPair[] = [];
        for (let i = 0; i < newAddresses.length; i += 5) {
          const batch = newAddresses.slice(i, i + 5);
          const results = await Promise.allSettled(
            batch.map(addr => fetchJson(`${DEXSCREENER_API}/tokens/v1/solana/${addr}`, 8000))
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              pairs.push(...r.value);
            }
          }
          if (i + 5 < newAddresses.length) await throttle(600);
        }

        // 4. Convert pairs to TokenIndexRecord entries
        for (const pair of pairs) {
          const chainId = CHAIN_MAP[pair.chainId?.toLowerCase()];
          if (!chainId) continue;

          const addr = pair.baseToken?.address?.toLowerCase();
          if (!addr || seen.has(addr)) continue;
          seen.add(addr);

          // Evict old entries if set grows too large
          if (seen.size > MAX_SEEN) {
            const iter = seen.values();
            for (let j = 0; j < 500; j++) {
              const { value, done } = iter.next();
              if (done) break;
              seen.delete(value);
            }
          }

          // Determine launchpad attribution from DEX ID
          const dexId = pair.dexId?.toLowerCase() || '';
          const lpInfo = DEX_LAUNCHPAD_MAP[dexId];
          const launchpadId = lpInfo?.id ?? (dexId || 'unknown');
          const launchpadName = lpInfo?.name ?? (pair.dexId || 'Unknown DEX');

          const createdAt = pair.pairCreatedAt || Date.now();

          tokens.push({
            chainId,
            address: addr,
            launchpadId,
            launchpadName,
            creator: null,
            launchTimestamp: createdAt,
            blockNumber: null,
            solanaSlot: null,
            sourceTxHash: pair.pairAddress || '',
            sourceLogIndex: 0,
            discoverySource: 'dexscreener_newpairs',
            discoveryStatus: 'verified',
            marketDataStatus: 'awaiting',
            name: pair.baseToken?.name || null,
            symbol: pair.baseToken?.symbol || null,
            icon: pair.info?.imageUrl || null,
          });
        }

        health = {
          ...health,
          lastSuccessAt: Date.now(),
          latencyMs: Date.now() - startMs,
          tokensDiscovered: health.tokensDiscovered + tokens.length,
          cursorPosition: `${tokens.length} new from ${newAddresses.length} addresses`,
        };

        return {
          tokens,
          cursor: { ...cursor, lastRunAt: Date.now(), lastSuccessAt: Date.now() },
          scanned: newAddresses.length,
          errors,
        };
      } catch (e: any) {
        errors.push(`DexScreener newpairs scan failed: ${e.message}`);
        health = { ...health, lastErrorAt: Date.now(), lastError: e.message, status: 'error' };
        return { tokens: [], cursor, scanned: 0, errors };
      }
    },

    getHealth(): AdapterHealth {
      return health;
    },
  };
}