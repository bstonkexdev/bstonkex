// BSTONKEX Provider Configuration — centralized, env-driven, never hardcoded secrets
import type { ChainId } from '../config';

// ── Provider Config per Chain ────────────────────────────────

export interface ProviderSet {
  rpc: { primary: string; fallbacks: string[] };
  ws?: { primary: string; fallbacks: string[] };
  indexer?: string;
  explorer: { url: string; name: string; apiUrl?: string };
  router: { type: '1inch' | 'jupiter' | 'uniswap' | 'custom'; apiUrl: string; apiKey?: string };
  priceFeed: { primary: string; fallback: string };
}

// Read from env or use public defaults (no secrets in frontend)
function env(key: string, fallback: string): string {
  try { return (import.meta as any).env?.[key] || fallback; } catch { return fallback; }
}

export const PROVIDERS: Record<ChainId, ProviderSet> = {
  bsc: {
    rpc: {
      primary: env('VITE_BNB_RPC_PRIMARY', 'https://bsc-dataseed1.binance.org'),
      fallbacks: [
        env('VITE_BNB_RPC_FALLBACK_1', 'https://bsc-dataseed2.binance.org'),
        env('VITE_BNB_RPC_FALLBACK_2', 'https://rpc.ankr.com/bsc'),
      ],
    },
    explorer: { url: 'https://bscscan.com', name: 'BscScan', apiUrl: env('VITE_BNB_EXPLORER_API', '') },
    router: { type: '1inch', apiUrl: env('VITE_BNB_ROUTER_API', 'https://api.1inch.dev/swap/v6.0'), apiKey: env('VITE_1INCH_API_KEY', '') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  base: {
    rpc: {
      primary: env('VITE_BASE_RPC_PRIMARY', 'https://mainnet.base.org'),
      fallbacks: [
        env('VITE_BASE_RPC_FALLBACK_1', 'https://rpc.ankr.com/base'),
        env('VITE_BASE_RPC_FALLBACK_2', 'https://base.llamarpc.com'),
      ],
    },
    explorer: { url: 'https://basescan.org', name: 'BaseScan', apiUrl: env('VITE_BASE_EXPLORER_API', '') },
    router: { type: '1inch', apiUrl: env('VITE_BASE_ROUTER_API', 'https://api.1inch.dev/swap/v6.0'), apiKey: env('VITE_1INCH_API_KEY', '') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  robinhood: {
    rpc: {
      // Robinhood Chain 4663 has NO public RPC endpoints that work without API keys.
      // Ankr returns 403. Alchemy demo blocked. All others timeout.
      // To enable: set VITE_RH_RPC_PRIMARY to a key-authenticated endpoint.
      primary: env('VITE_RH_RPC_PRIMARY', 'https://rpc.ankr.com/robinhood'),
      fallbacks: [
        env('VITE_RH_RPC_FALLBACK_1', 'https://robinhood-mainnet.g.alchemy.com/v2/demo'),
        env('VITE_RH_RPC_FALLBACK_2', ''),
      ].filter(Boolean),
    },
    explorer: { url: 'https://explorer.robinhood.com', name: 'Robinhood Explorer' },
    router: { type: '1inch', apiUrl: env('VITE_RH_ROUTER_API', 'https://api.1inch.dev/swap/v6.0'), apiKey: env('VITE_1INCH_API_KEY', '') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  solana: {
    rpc: {
      primary: env('VITE_SOL_RPC_PRIMARY', 'https://api.mainnet-beta.solana.com'),
      fallbacks: [
        env('VITE_SOL_RPC_FALLBACK_1', 'https://rpc.ankr.com/solana'),
        env('VITE_SOL_RPC_FALLBACK_2', 'https://solana-mainnet.g.alchemy.com/v2/demo'),
      ],
    },
    explorer: { url: 'https://solscan.io', name: 'Solscan' },
    router: { type: 'jupiter', apiUrl: env('VITE_SOL_ROUTER_API', 'https://quote-api.jup.ag/v6') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
};

/** Get all RPC URLs for a chain (primary + fallbacks). */
export function getRpcUrls(chainId: ChainId): string[] {
  const p = PROVIDERS[chainId];
  return [p.rpc.primary, ...p.rpc.fallbacks];
}

/** Get router API URL for a chain. */
export function getRouterApi(chainId: ChainId): string {
  return PROVIDERS[chainId].router.apiUrl;
}

/** Get router API key (empty string if not configured — public endpoint). */
export function getRouterApiKey(chainId: ChainId): string {
  return PROVIDERS[chainId].router.apiKey || '';
}