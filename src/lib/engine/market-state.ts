// Cupcak8 Swap — Market Lifecycle State Machine
// Tracks the lifecycle of a token from bonding curve → DEX migration → launched.
import type { ChainId } from '../config';
import type { MarketToken } from '../market-discovery';
import type { TokenIndexRecord } from './discovery/types';
import { getBondingCurveState, isTokenOnBondingCurve } from './bonding-curve';

// ── Market Lifecycle States ────────────────────────────────

export type MarketLifecycleState =
  | 'bonding_curve'   // Active bonding curve, no migrated DEX market
  | 'migrating'       // Migration detected but final market not yet verified
  | 'launched'        // Verified live DEX pool with valid market data
  | 'inactive'        // No longer actively trading
  | 'unknown';        // Insufficient evidence to classify

// ── State Classification ───────────────────────────────────

/** Classify a token's market state based on available data */
export function classifyMarketState(token: Partial<TokenIndexRecord> & { chainId: ChainId; address: string }): {
  state: MarketLifecycleState;
  priceSource: 'bonding_curve' | 'dex_pair' | 'none';
  liquidityType: 'real' | 'virtual' | null;
} {
  const chain = token.chainId;

  // If we have enriched market data with DEX liquidity, it's launched
  if (token.marketDataStatus === 'enriched' && token.liquidity != null && token.liquidity > 0) {
    return {
      state: 'launched',
      priceSource: 'dex_pair',
      liquidityType: 'real',
    };
  }

  // If we have DexScreener data (from discovery), it's likely launched
  if (token.marketDataStatus === 'enriched' && token.price != null) {
    return {
      state: 'launched',
      priceSource: 'dex_pair',
      liquidityType: token.liquidity != null ? 'real' : null,
    };
  }

  // If awaiting enrichment, check bonding curve
  if (token.marketDataStatus === 'awaiting' || token.marketDataStatus === 'no_data') {
    // For Solana/Pump.fun tokens, check bonding curve (async — caller must await)
    if (chain === 'solana' && token.launchpadId === 'pumpfun') {
      return {
        state: 'bonding_curve', // Optimistic — caller should verify async
        priceSource: 'bonding_curve',
        liquidityType: 'virtual',
      };
    }
  }

  // Default to unknown
  return {
    state: 'unknown',
    priceSource: 'none',
    liquidityType: null,
  };
}

/** Async classification with on-chain verification */
export async function classifyMarketStateAsync(token: { chainId: ChainId; address: string; launchpadId?: string }): Promise<{
  state: MarketLifecycleState;
  priceSource: 'bonding_curve' | 'dex_pair' | 'none';
  liquidityType: 'real' | 'virtual' | null;
}> {
  // Check if on bonding curve
  if (token.chainId === 'solana') {
    const onCurve = await isTokenOnBondingCurve(token.chainId, token.address);
    if (onCurve) {
      return {
        state: 'bonding_curve',
        priceSource: 'bonding_curve',
        liquidityType: 'virtual',
      };
    }
  }

  return {
    state: 'unknown',
    priceSource: 'none',
    liquidityType: null,
  };
}

// ── Market State Labels (for UI) ───────────────────────────

export const MARKET_STATE_LABELS: Record<MarketLifecycleState, { label: string; color: string; badge: string }> = {
  bonding_curve: { label: 'BONDING CURVE', color: 'var(--cyan, #0088FF)', badge: '🔵' },
  migrating: { label: 'MIGRATING', color: 'var(--amber, #FFD700)', badge: '🟡' },
  launched: { label: 'LAUNCHED', color: 'var(--green)', badge: '🟢' },
  inactive: { label: 'INACTIVE', color: 'var(--text-muted)', badge: '⚫' },
  unknown: { label: 'UNKNOWN', color: 'var(--text-dim)', badge: '❓' },
};

/** Get display info for a market state */
export function getMarketStateDisplay(state: MarketLifecycleState) {
  return MARKET_STATE_LABELS[state];
}

// ── Enrich Token with Market State ─────────────────────────

/** Enrich a MarketToken with bonding curve data if applicable */
export async function enrichWithBondingCurve(token: MarketToken): Promise<MarketToken> {
  // Only for Solana tokens that might be on bonding curve
  if (token.chainId !== 'solana') return token;
  if (token.launchpadId !== 'pumpfun') return token;
  if (token.liquidity != null && token.liquidity > 0) return token; // Already has DEX liquidity

  try {
    const state = await getBondingCurveState(token.chainId, token.address);
    if (!state) return token;

    const completion = Math.round(state.completionRatio * 100);
    const marketState = state.isComplete ? 'migrating' as const : 'bonding_curve' as const;

    // Non-SOL quote mints: curve pricing is explicitly unavailable — keep price
    // and liquidity null rather than substituting a SOL-denominated fabrication.
    if (!state.isSolQuote) {
      // Preserve only prices already observed from a real DEX source; never
      // invent a curve price for a non-SOL quote asset.
      const keepDexPrice = token.priceSource === 'dex_pair' && token.price != null;
      return {
        ...token,
        price: keepDexPrice ? token.price : null,
        priceSource: keepDexPrice ? 'dex_pair' as const : 'none' as const,
        liquidityType: 'none' as const,
        marketState,
        bondingCurveProgress: completion,
        dataFreshness: 'live' as const,
        liquidity: null,
      };
    }

    // Keep USD price null when the SOL/USD source is stale — never fabricate.
    const price = state.spotPriceUsd;

    return {
      ...token,
      price: price ?? token.price,
      priceSource: price != null ? 'bonding_curve' as const : token.priceSource,
      liquidityType: 'virtual' as const,
      marketState,
      bondingCurveProgress: completion,
      dataFreshness: 'live' as const,
      // Real quote reserves value (lamports → SOL → USD). Null when no USD price.
      liquidity: price != null ? state.realQuoteReserves / 1e9 * price : null,
    };
  } catch {
    return token;
  }
}