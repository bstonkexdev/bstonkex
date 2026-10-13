// Cupcak8 Swap — Dual-Router Swap Execution Engine
// Routes swaps based on token market phase:
//   - Inner Market (progress < 100%): Direct bonding curve buy()/sell() call
//   - Graduated (progress = 100%): Standard AMM router (Raydium/PancakeSwap)

import type { TrenchesToken, SwapRoute, MarketPhase } from './trenches-types';

// Pump.fun bonding curve program (Solana)
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPFUN_BUY_IX = 0x66063d1201daebea;
const PUMPFUN_SELL_IX = 0x33e68d7482cb3a4e;

// AMM Routers by chain
const AMM_ROUTERS: Record<string, { name: string; address: string }[]> = {
  solana: [
    { name: 'Raydium', address: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
    { name: 'PumpSwap', address: 'PSwapMdTB3Vy5BoC1Dr3Q4tmw1tQv1i1i1i1i1i1i1i1i' },
  ],
  bsc: [
    { name: 'PancakeSwap V2', address: '0x10ED43C718714eb63d5aA57B78B54704E256024E' },
    { name: 'PancakeSwap V3', address: '0x1b81D678ffb9C0263b24A97847620C99d213eB14' },
  ],
  base: [
    { name: 'Uniswap V3', address: '0x2626664c2603336E57B271c5C0b26F421741e481' },
  ],
};

// Priority fee presets (in microlamports for Solana, gwei for EVM)
export const PRIORITY_FEE_PRESETS = {
  low: 1_000,
  medium: 10_000,
  high: 50_000,
  max: 200_000,
} as const;

export type PriorityFeeLevel = keyof typeof PRIORITY_FEE_PRESETS;

/**
 * Determine the swap route for a token based on its market phase.
 */
export function getSwapRoute(
  token: TrenchesToken,
  method: 'buy' | 'sell',
  amountUsd: number,
  slippagePct = 1.0,
  priorityLevel: PriorityFeeLevel = 'medium',
): SwapRoute {
  const priorityFee = PRIORITY_FEE_PRESETS[priorityLevel];
  const phase: MarketPhase = token.phase;

  if (phase === 'graduated') {
    return {
      type: 'amm',
      program: getBestAmm(token.chainId),
      dex: getBestAmmName(token.chainId),
      method,
      slippagePct,
      priorityFee,
      antiMev: true,
      estimatedOutput: estimateAmmOutput(token, method, amountUsd),
      priceImpactPct: estimatePriceImpact(token, amountUsd),
    };
  }

  // Inner market or migrating — use bonding curve
  return {
    type: 'bonding_curve',
    program: token.chainId === 'solana' ? PUMPFUN_PROGRAM : token.launchpadId,
    dex: null,
    method,
    slippagePct,
    priorityFee,
    antiMev: token.chainId === 'solana',
    estimatedOutput: estimateBondingCurveOutput(token, method, amountUsd),
    priceImpactPct: estimatePriceImpact(token, amountUsd),
  };
}

/**
 * Get the human-readable route description for UI display.
 */
export function describeRoute(route: SwapRoute): string {
  if (route.type === 'bonding_curve') {
    return `⚡ Bonding Curve Direct — ${route.method === 'buy' ? 'Buy' : 'Sell'} via Launchpad Program`;
  }
  return `🔄 ${route.dex} AMM — ${route.method === 'buy' ? 'Buy' : 'Sell'} via Router`;
}

/**
 * Get the route badge color for UI.
 */
export function getRouteBadgeColor(route: SwapRoute): string {
  return route.type === 'bonding_curve' ? 'var(--cyan)' : 'var(--yellow)';
}

// ── Output Estimation ───────────────────────────────────────

function estimateBondingCurveOutput(token: TrenchesToken, method: 'buy' | 'sell', amountUsd: number): number {
  const price = token.spotPriceUsd || 0.000001;
  if (method === 'buy') {
    // Buying: USD → tokens, with price impact from reserve change
    const rawTokens = amountUsd / price;
    const impact = estimatePriceImpact(token, amountUsd);
    return rawTokens * (1 - impact / 100);
  }
  // Selling: tokens → USD (assume amountUsd represents token value)
  return amountUsd * (1 - estimatePriceImpact(token, amountUsd) / 100);
}

function estimateAmmOutput(token: TrenchesToken, method: 'buy' | 'sell', amountUsd: number): number {
  const price = token.spotPriceUsd || 0.000001;
  const raw = amountUsd / price;
  const impact = estimatePriceImpact(token, amountUsd);
  return raw * (1 - impact / 100);
}

function estimatePriceImpact(token: TrenchesToken, amountUsd: number): number {
  const mcap = token.virtualMcapUsd || 10_000;
  const pct = (amountUsd / mcap) * 100;
  return Math.min(pct, 50); // Cap at 50%
}

// ── AMM Selection ───────────────────────────────────────────

function getBestAmm(chainId: string): string {
  const routers = AMM_ROUTERS[chainId] || AMM_ROUTERS.solana;
  return routers[0].address;
}

function getBestAmmName(chainId: string): string {
  const routers = AMM_ROUTERS[chainId] || AMM_ROUTERS.solana;
  return routers[0].name;
}

/** Get all available AMM routers for a chain. */
export function getAvailableAmms(chainId: string): { name: string; address: string }[] {
  return AMM_ROUTERS[chainId] || AMM_ROUTERS.solana;
}

/**
 * Anti-MEV slippage protection config.
 * Uses Jito bundles (Solana) or private mempool (EVM).
 */
export function getAntiMevConfig(route: SwapRoute): { enabled: boolean; tip: number; useBundle: boolean } {
  if (route.type === 'bonding_curve' && route.antiMev) {
    return { enabled: true, tip: 10_000, useBundle: true };
  }
  return { enabled: route.antiMev, tip: 0, useBundle: false };
}
