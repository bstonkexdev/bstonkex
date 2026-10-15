// Cupcak8 Swap Configuration

export type ChainId = 'bsc' | 'solana' | 'base' | 'robinhood';

export interface ChainConfig {
  id: ChainId;
  name: string;
  shortName: string;
  nativeSymbol: string;
  explorerUrl: string;
  explorerName: string;
  dexScreenerId: string; // DexScreener chain identifier
  color: string;
  rpcUrl: string;
  chainIdHex?: string; // For EVM chains
  isEvm: boolean;
  configured: boolean; // false = show NOT CONFIGURED
}

// ── Robinhood RPC: public endpoint (Alchemy key stays server-side) ──
function getRobinhoodRpcUrl(): string {
  return 'https://rpc.mainnet.chain.robinhood.com';
}

export const CHAINS: Record<ChainId, ChainConfig> = {
  bsc: {
    id: 'bsc',
    name: 'BNB Chain',
    shortName: 'BNB',
    nativeSymbol: 'BNB',
    explorerUrl: 'https://bscscan.com',
    explorerName: 'BscScan',
    dexScreenerId: 'bsc',
    color: '#f0b90b',
    rpcUrl: 'https://rpc.ankr.com/bsc',
    chainIdHex: '0x38',
    isEvm: true,
    configured: true,
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    shortName: 'SOL',
    nativeSymbol: 'SOL',
    explorerUrl: 'https://solscan.io',
    explorerName: 'Solscan',
    dexScreenerId: 'solana',
    color: '#00ffa3',
    rpcUrl: 'https://rpc.ankr.com/solana',
    isEvm: false,
    configured: true,
  },
  base: {
    id: 'base',
    name: 'Base',
    shortName: 'BASE',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://basescan.org',
    explorerName: 'BaseScan',
    dexScreenerId: 'base',
    color: '#0052ff',
    rpcUrl: 'https://rpc.ankr.com/base',
    chainIdHex: '0x2105',
    isEvm: true,
    configured: true,
  },
  robinhood: {
    id: 'robinhood',
    name: 'Robinhood',
    shortName: 'RHC',
    nativeSymbol: 'ETH',
    explorerUrl: 'https://explorer.robinhood.com',
    explorerName: 'Robinhood Explorer',
    dexScreenerId: 'robinhood',
    color: '#00c805',
    rpcUrl: getRobinhoodRpcUrl(),
    chainIdHex: '0x1237', // 4663 in hex
    isEvm: true,
    configured: true,
  },
};

export const ALL_CHAINS = Object.values(CHAINS);
export const CONFIGURED_CHAINS = ALL_CHAINS.filter(c => c.configured);

// Cupcak8 Swap Platform Fee
export const PLATFORM_FEE_BPS = 40; // 0.40% = 40 basis points
export const PLATFORM_FEE_PCT = PLATFORM_FEE_BPS / 10000;

// Referral Tiers
export interface ReferralTier {
  name: string;
  minVolume: number;
  maxVolume: number | null;
  sharePct: number;
}

export const REFERRAL_TIERS: ReferralTier[] = [
  { name: 'STARTER', minVolume: 0, maxVolume: 9999, sharePct: 10 },
  { name: 'BUILDER', minVolume: 10000, maxVolume: 49999, sharePct: 20 },
  { name: 'PRO', minVolume: 50000, maxVolume: 249999, sharePct: 30 },
  { name: 'ELITE', minVolume: 250000, maxVolume: null, sharePct: 35 },
];

export const MIN_CLAIM_AMOUNT = 10; // $10 minimum claim
export const REFERRAL_ROLLING_DAYS = 30;

// Cashback Tiers — monthly UTC cycle, applied to eligible platform fees
export interface CashbackTier {
  name: string;
  minVolume: number;
  maxVolume: number | null;
  ratePct: number; // % of eligible platform fee returned as cashback
}

export const CASHBACK_TIERS: CashbackTier[] = [
  { name: 'Novice',   minVolume: 0,         maxVolume: 999.99,      ratePct: 5 },
  { name: 'Advanced', minVolume: 1000,      maxVolume: 9999.99,     ratePct: 7.5 },
  { name: 'Pro',      minVolume: 10000,     maxVolume: 99999.99,    ratePct: 10 },
  { name: 'Elite',    minVolume: 100000,    maxVolume: 999999.99,   ratePct: 12.5 },
  { name: 'Legend',   minVolume: 1000000,   maxVolume: null,        ratePct: 15 },
];

// API Endpoints
export const DEXSCREENER_API = 'https://api.dexscreener.com';
export const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
export const JUPITER_API = 'https://lite-api.jup.ag/swap/v1';

// Cupcak8 Swap App Config
export const APP_NAME = 'Cupcak8 Swap';
export const APP_TAGLINE = 'Multi-Chain Trading Terminal';

// Format helpers
export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toExponential(2)}`;
}

export function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n) || n === 0) return '$0.00';
  const num = Number(n);

  if (num >= 1) return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Convert to fixed decimal string for micro-cap tokens
  const str = num.toFixed(12);
  const match = str.match(/^0\.(0+)(\d{2,4})/);

  if (match) {
    const zeroCount = match[1].length;
    const sigDigits = match[2];
    if (zeroCount >= 3) {
      // Formats 0.0000000280 as $0.0{7}280
      return `$0.0{${zeroCount}}${sigDigits}`;
    }
  }

  return `${num.toFixed(6)}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

export function shortenAddress(addr: string, chars = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
}

export function explorerTxUrl(chainId: ChainId, txHash: string): string {
  const chain = CHAINS[chainId];
  if (!chain.explorerUrl) return '#';
  return `${chain.explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(chainId: ChainId, address: string): string {
  const chain = CHAINS[chainId];
  if (!chain.explorerUrl) return '#';
  return `${chain.explorerUrl}/address/${address}`;
}

// ── Safe Image URL (fixes broken IPFS logos) ─────────────────

const DEFAULT_TOKEN_IMAGE = 'https://bstonkex.xyz/assets/tokens/default.png';

const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
];

/**
 * Fix broken IPFS logos for frontend display.
 * Converts ipfs:// to Cloudflare/Pinata HTTPS gateway.
 * Returns default token image for empty/invalid URLs.
 */
export function getSafeImageUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return DEFAULT_TOKEN_IMAGE;
  if (rawUrl.startsWith('data:image')) return rawUrl;

  // Replace ipfs:// protocol with fast Cloudflare / Pinata gateway
  if (rawUrl.startsWith('ipfs://')) {
    const hash = rawUrl.replace('ipfs://', '').replace(/^ipfs\//, '');
    return `${IPFS_GATEWAYS[0]}${hash}`;
  }

  // Already HTTPS with /ipfs/ path — use as-is
  if (rawUrl.includes('/ipfs/')) return rawUrl;

  // Normal HTTPS URL
  if (rawUrl.startsWith('http')) return rawUrl;

  return DEFAULT_TOKEN_IMAGE;
}

/** Try multiple IPFS gateways on image error (used as onError fallback). */
export function tryNextGateway(imgElement: HTMLImageElement, currentUrl: string): void {
  const hash = currentUrl.match(/\/ipfs\/([a-zA-Z0-9]+)/)?.[1];
  if (!hash) return;

  const currentGateway = IPFS_GATEWAYS.find(gw => currentUrl.startsWith(gw));
  const currentIdx = currentGateway ? IPFS_GATEWAYS.indexOf(currentGateway) : -1;
  const nextIdx = currentIdx + 1;

  if (nextIdx < IPFS_GATEWAYS.length) {
    imgElement.src = `${IPFS_GATEWAYS[nextIdx]}${hash}`;
  } else {
    imgElement.src = DEFAULT_TOKEN_IMAGE;
  }
}