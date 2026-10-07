// BSTONKEX Configuration

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
    rpcUrl: 'https://bsc-dataseed1.binance.org',
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
    rpcUrl: 'https://api.mainnet-beta.solana.com',
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
    rpcUrl: 'https://mainnet.base.org',
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
    rpcUrl: 'https://rpc.ankr.com/robinhood',
    chainIdHex: '0x1237', // 4663 in hex
    isEvm: true,
    configured: true, // Now configured as first-class EVM chain
  },
};

export const ALL_CHAINS = Object.values(CHAINS);
export const CONFIGURED_CHAINS = ALL_CHAINS.filter(c => c.configured);

// BSTONKEX Platform Fee
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

// API Endpoints
export const DEXSCREENER_API = 'https://api.dexscreener.com';
export const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
export const JUPITER_API = 'https://quote-api.jup.ag/v6';

// BSTONKEX App Config
export const APP_NAME = 'BSTONKEX';
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
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
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