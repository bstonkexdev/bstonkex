// Cupcak8 Swap — Trenches Terminal Types
// Shared across frontend components, hooks, and routing logic.

/** Market phase based on bonding curve progress. */
export type MarketPhase = 'inner' | 'migrating' | 'graduated';

/** Active tab in the Trenches terminal. */
export type TrenchesTab = 'launchpads' | 'migrating' | 'graduated';

/** Security flags from RugCheck (Solana) / GoPlus (EVM). */
export interface SecurityFlags {
  /** Overall risk level */
  risk: 'safe' | 'caution' | 'risky' | 'danger' | 'unknown';
  /** RugCheck/GoPlus numeric score (0-100, higher = safer) */
  score: number | null;
  /** Mint authority exists (Solana) */
  mintAuthority: boolean | null;
  /** Freeze authority exists (Solana) */
  freezeAuthority: boolean | null;
  /** LP locked percentage (0-100) */
  lpLockedPct: number | null;
  /** Top 10 holder concentration (0-100) */
  top10Pct: number | null;
  /** Honeypot detected (EVM) */
  honeypot: boolean | null;
  /** Buy tax percentage (EVM) */
  buyTaxPct: number | null;
  /** Sell tax percentage (EVM) */
  sellTaxPct: number | null;
  /** Audit timestamp */
  auditedAt: number | null;
}

/** A token in the trenches feed. */
export interface TrenchesToken {
  /** Contract/mint address */
  address: string;
  /** Chain identifier */
  chainId: 'solana' | 'bsc' | 'base';
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Creator/deploer wallet */
  creator: string;
  /** Current bonding curve progress (0-100) */
  bondingCurveProgress: number;
  /** Virtual spot price in USD */
  spotPriceUsd: number;
  /** Virtual market cap in USD */
  virtualMcapUsd: number;
  /** Virtual SOL/BNB/ETH in bonding curve */
  virtualReserve: number;
  /** Virtual tokens in bonding curve */
  virtualTokens: number;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Market phase */
  phase: MarketPhase;
  /** Which launchpad created this */
  launchpadId: string;
  /** Security audit results */
  security: SecurityFlags;
  /** Token image URL */
  icon: string | null;
  /** Trade count in last 24h */
  trades24h: number | null;
  /** Volume in USD last 24h */
  volume24hUsd: number | null;
  /** Liquidity in USD (0 for inner market) */
  liquidityUsd: number | null;
}

/** Swap routing decision. */
export interface SwapRoute {
  /** 'bonding_curve' for inner market, 'amm' for graduated */
  type: 'bonding_curve' | 'amm';
  /** Program/contract to call */
  program: string;
  /** Specific DEX if AMM route */
  dex: string | null;
  /** Instruction method name */
  method: 'buy' | 'sell';
  /** Slippage tolerance (%) */
  slippagePct: number;
  /** Priority fee in lamwei/wei */
  priorityFee: number;
  /** Anti-MEV protection enabled */
  antiMev: boolean;
  /** Estimated output amount */
  estimatedOutput: number;
  /** Price impact (%) */
  priceImpactPct: number;
}

/** WebSocket broadcast event types. */
export type TrenchesEvent =
  | { type: 'NEW_LAUNCHPAD_TOKEN'; data: TrenchesToken }
  | { type: 'PRICE_UPDATE'; data: { address: string; spotPriceUsd: number; bondingCurveProgress: number; phase: MarketPhase } }
  | { type: 'SECURITY_UPDATE'; data: { address: string; security: SecurityFlags } }
  | { type: 'INITIAL_TRENCHES_LOAD'; data: TrenchesToken[] };

/** Compute market phase from bonding curve progress. */
export function computePhase(progress: number): MarketPhase {
  if (progress >= 100) return 'graduated';
  if (progress >= 80) return 'migrating';
  return 'inner';
}

/** Compute virtual market cap from bonding curve reserves. */
export function computeVirtualMcap(virtualReserve: number, virtualTokens: number): number {
  if (virtualTokens <= 0) return 0;
  return (virtualReserve / virtualTokens) * 1e9; // 1B token supply
}

/** Format market cap for display. */
export function formatMcap(usd: number): string {
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

/** Format age in human-readable form. */
export function formatAge(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
