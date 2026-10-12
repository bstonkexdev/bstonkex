// Cupcak8 Swap Provider Configuration — centralized, env-driven, never hardcoded secrets
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

// SECURITY (Step 5): VITE_1INCH_API_KEY is REMOVED from client config.
// 1inch API requires an API key for authenticated endpoints. The key must NOT
// be in the client bundle. When no server proxy is available, 1inch routes
// use the public (keyless) rate-limited tier or are disabled.
// For authenticated 1inch access, deploy backend/ which proxies via ONEINCH_API_KEY.

export const PROVIDERS: Record<ChainId, ProviderSet> = {
  bsc: {
    rpc: {
      primary: env('VITE_BNB_RPC_PRIMARY', 'https://rpc.ankr.com/bsc'),
      fallbacks: [
        env('VITE_BNB_RPC_FALLBACK_1', 'https://bsc-dataseed1.binance.org'),
        env('VITE_BNB_RPC_FALLBACK_2', 'https://bsc-dataseed2.binance.org'),
      ],
    },
    explorer: { url: 'https://bscscan.com', name: 'BscScan', apiUrl: env('VITE_BNB_EXPLORER_API', '') },
    router: { type: '1inch', apiUrl: env('VITE_BNB_ROUTER_API', 'https://api.1inch.dev/swap/v6.0') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  base: {
    rpc: {
      primary: env('VITE_BASE_RPC_PRIMARY', 'https://rpc.ankr.com/base'),
      fallbacks: [
        env('VITE_BASE_RPC_FALLBACK_1', 'https://mainnet.base.org'),
        env('VITE_BASE_RPC_FALLBACK_2', 'https://base.llamarpc.com'),
      ],
    },
    explorer: { url: 'https://basescan.org', name: 'BaseScan', apiUrl: env('VITE_BASE_EXPLORER_API', '') },
    router: { type: '1inch', apiUrl: env('VITE_BASE_ROUTER_API', 'https://api.1inch.dev/swap/v6.0') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  robinhood: {
    rpc: {
      primary: env('VITE_RH_RPC_PRIMARY', 'https://rpc.mainnet.chain.robinhood.com'),
      fallbacks: [],
    },
    explorer: { url: 'https://explorer.robinhood.com', name: 'Robinhood Explorer' },
    router: { type: '1inch', apiUrl: env('VITE_RH_ROUTER_API', 'https://api.1inch.dev/swap/v6.0') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
  solana: {
    rpc: {
      primary: env('VITE_SOL_RPC_PRIMARY', 'https://rpc.ankr.com/solana'),
      fallbacks: [
        env('VITE_SOL_RPC_FALLBACK_1', 'https://api.mainnet-beta.solana.com'),
        env('VITE_SOL_RPC_FALLBACK_2', 'https://solana-mainnet.g.alchemy.com/v2/demo'),
      ],
    },
    explorer: { url: 'https://solscan.io', name: 'Solscan' },
    router: { type: 'jupiter', apiUrl: env('VITE_SOL_ROUTER_API', 'https://lite-api.jup.ag/swap/v1') },
    priceFeed: { primary: 'https://api.dexscreener.com', fallback: 'https://api.coingecko.com/api/v3' },
  },
};

/**
 * Check if the 1inch router has an authenticated API key available.
 * Returns false when running in the browser (no server proxy = no private key).
 */
export function isRouterAuthenticated(_chainId: ChainId): boolean {
  // Browser code NEVER has access to the private 1inch key.
  // Authenticated routing requires the backend proxy (POST /api/route).
  return false;
}

/** Get the backend proxy URL for authenticated routing (if deployed). */
/**
 * Get the backend base URL derived from VITE_WS_URL.
 * Example: wss://api.example.com/ws → https://api.example.com
 * Returns null if VITE_WS_URL is not configured or the derived URL is invalid.
 */
export function getBackendBaseUrl(): string | null {
  try {
    const wsUrl = (import.meta as any).env?.VITE_WS_URL;
    if (!wsUrl || typeof wsUrl !== 'string') return null;
    // Derive HTTP(S) base from WS(S) URL
    const httpUrl = wsUrl.replace(/\/ws$/, '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    // Validate it's a proper HTTP(S) URL
    const parsed = new URL(httpUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return httpUrl;
  } catch { return null; }
}

/**
 * Get the backend quote proxy URL for 0x quotes.
 * Returns null if backend is not configured.
 */
export function getQuoteProxyUrl(): string | null {
  const base = getBackendBaseUrl();
  return base ? `${base}/api/quote` : null;
}

/**
 * Get the backend swap TX proxy URL for 0x swap transaction building.
 * Returns null if backend is not configured.
 */
export function getSwapProxyUrl(): string | null {
  const base = getBackendBaseUrl();
  return base ? `${base}/api/swap` : null;
}

export function getRouterProxyUrl(): string | null {
  const base = getBackendBaseUrl();
  return base ? `${base}/api/route` : null;
}

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

// ── Discovery Sources (Step 3) ──────────────────────────────

export interface DiscoverySourceConfig {
  id: string;
  type: 'eth_getLogs' | 'solana_program' | 'bags_api' | 'dexscreener_fallback';
  chainId: ChainId;
  endpoint: string;
  requiresAuth: boolean;
  description: string;
}

export const DISCOVERY_SOURCES: DiscoverySourceConfig[] = [
  {
    id: 'openlaunch-base',
    type: 'eth_getLogs',
    chainId: 'base',
    endpoint: 'eth_getLogs on 0x815542E8b392389A1389E22E588E4B62A67Ade72',
    requiresAuth: false,
    description: 'OpenLaunch Launched events on Base (topic 0xda18b133)',
  },
  {
    id: 'openlaunch-rh',
    type: 'eth_getLogs',
    chainId: 'robinhood',
    endpoint: 'eth_getLogs on 0x815542E8b392389A1389E22E588E4B62A67Ade72',
    requiresAuth: false,
    description: 'OpenLaunch Launched events on Robinhood (topic 0xda18b133)',
  },
  {
    id: 'pumpfun-solana',
    type: 'solana_program',
    chainId: 'solana',
    endpoint: 'Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    requiresAuth: false,
    description: 'Pump.fun token creation instruction scanning',
  },
  {
    id: 'bags-api-solana',
    type: 'bags_api',
    chainId: 'solana',
    endpoint: 'https://data-api.bags.fm/v2/launches',
    requiresAuth: false,
    description: 'Bags API — tracks Pumpfun, Stonkfun, Dbc, Moonshot',
  },
];