// BSTONKEX DexRouter — Abstraction over DEX/aggregator routing
// Frontend never calls a specific DEX directly; all swaps go through this interface.
import type { ChainId } from '../config';
import type { SwapParams, SwapQuote, UnsignedTx, GasEstimate } from './types';
import { getChainAdapter } from './chain-registry';

// ── Quote Expiry ─────────────────────────────────────────────

const QUOTE_TTL_MS = 8_000; // 8 seconds

export interface RoutedQuote {
  quote: SwapQuote;
  expiresAt: number;
  quoteId: string;
}

const activeQuotes = new Map<string, RoutedQuote>();

function makeQuoteId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Check if a quote is still valid. */
export function isQuoteValid(quoteId: string): boolean {
  const q = activeQuotes.get(quoteId);
  return !!q && Date.now() < q.expiresAt;
}

/** Get remaining seconds for a quote. */
export function getQuoteRemainingSeconds(quoteId: string): number {
  const q = activeQuotes.get(quoteId);
  if (!q) return 0;
  return Math.max(0, Math.floor((q.expiresAt - Date.now()) / 1000));
}

// ── DexRouter Interface ──────────────────────────────────────

export interface RouteOption {
  dex: string;
  estimatedOutput: string;
  priceImpact: number;
  gasUsd: number;
  feeUsd: number;
  score: number; // higher = better executable result
}

/** Get a quote through the DexRouter abstraction. */
export async function getRoute(params: SwapParams): Promise<RoutedQuote | null> {
  const adapter = getChainAdapter(params.chainId);
  if (!adapter) return null;

  try {
    const quote = await adapter.getSwapQuote(params);
    if (!quote.available) return null;

    const quoteId = makeQuoteId();
    const routed: RoutedQuote = {
      quote,
      expiresAt: Date.now() + QUOTE_TTL_MS,
      quoteId,
    };
    activeQuotes.set(quoteId, routed);
    return routed;
  } catch {
    return null;
  }
}

/** Get multiple route options and rank by best executable result. */
export async function getRoutes(params: SwapParams): Promise<RouteOption[]> {
  const routed = await getRoute(params);
  if (!routed) return [];

  const q = routed.quote;
  // Score: higher output, lower impact, lower gas, lower fees = better
  const outputNum = Number(q.amountOut) || 0;
  const score = outputNum * (1 - q.priceImpactBps / 10000) - (q.gasPriceUsd + q.dexFeeUsd);

  return [{
    dex: q.source,
    estimatedOutput: q.amountOut,
    priceImpact: q.priceImpactBps / 100,
    gasUsd: q.gasPriceUsd,
    feeUsd: q.dexFeeUsd,
    score,
  }];
}

/** Build a swap transaction for an active quote. */
export async function buildSwap(
  params: SwapParams,
  quote: SwapQuote,
): Promise<UnsignedTx | null> {
  const adapter = getChainAdapter(params.chainId);
  if (!adapter) return null;
  try {
    return await adapter.buildSwapTransaction(params, quote);
  } catch {
    return null;
  }
}

/** Estimate gas for a transaction. */
export async function estimateSwapGas(
  chainId: ChainId,
  tx: UnsignedTx,
): Promise<GasEstimate | null> {
  const adapter = getChainAdapter(chainId);
  if (!adapter) return null;
  try {
    return await adapter.estimateGas(tx);
  } catch {
    return null;
  }
}

/** Estimate total fees for a swap (platform + dex + network). */
export function estimateTotalFees(
  tradeValueUsd: number,
  platformFeePct: number,
  dexFeeUsd: number,
  networkFeeUsd: number,
): { platform: number; dex: number; network: number; total: number } {
  const platform = tradeValueUsd * platformFeePct;
  return { platform, dex: dexFeeUsd, network: networkFeeUsd, total: platform + dexFeeUsd + networkFeeUsd };
}