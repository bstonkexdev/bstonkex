// BSTONKEX Trading Engine — Production: DexRouter, quote expiry, readiness gate
import { PLATFORM_FEE_PCT, CHAINS, type ChainId } from './config';
import { getUnifiedQuote, type QuoteRequest } from './engine/quote-engine';
import { executeTrade as engineExecuteTrade, confirmTradeSubmission, getTradeTxData, type TradeExecution } from './engine/trade-engine';
import { calculateFees } from './engine/fee-engine';
import { isChainReadyForTrading } from './engine/chain-readiness';
import { isQuoteValid, getQuoteRemainingSeconds, type RoutedQuote } from './engine/dex-router';
import type { SwapParams, SwapQuote } from './engine/types';

export type TradeSide = 'buy' | 'sell';

export interface QuoteParams {
  chainId: ChainId;
  side: TradeSide;
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  slippagePct: number;
  walletAddress: string | null;
}

export interface TradeQuote {
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  estimatedOutput: string;
  priceImpact: number;
  platformFee: string;
  platformFeeUsd: number;
  dexFee: string;
  dexFeeUsd: number;
  networkFee: string;
  networkFeeUsd: number;
  slippage: number;
  minReceived: string;
  route: string[];
  dex: string;
  available: boolean;
  error?: string;
  // Quote expiry
  quoteId: string;
  expiresAt: number;
  validForSeconds: number;
  // Internal
  _unifiedQuote?: import('./engine/quote-engine').UnifiedQuote;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  error?: string;
  tradeId?: string;
  status?: TradeStatus;
  txData?: any;
}

export type TradeStatus = 'preparing' | 'awaiting_approval' | 'approving' | 'awaiting_signature' | 'signing' | 'submitting' | 'pending' | 'confirmed' | 'failed';

// ── Quote Expiry Constants ───────────────────────────────────
const QUOTE_TTL_MS = 8_000;

export function calcPlatformFee(amountUsd: number): number {
  return amountUsd * PLATFORM_FEE_PCT;
}

/** Get a unified quote — includes expiry tracking. */
export async function getQuote(params: QuoteParams): Promise<TradeQuote> {
  const req: QuoteRequest = {
    chainId: params.chainId,
    side: params.side,
    tokenAddress: params.tokenAddress,
    tokenSymbol: params.tokenSymbol,
    amountUsd: params.amountUsd,
    slippagePct: params.slippagePct,
    walletAddress: params.walletAddress,
  };

  const unified = await getUnifiedQuote(req);
  const quoteId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Date.now() + QUOTE_TTL_MS;

  const result: TradeQuote = {
    inputToken: unified.inputAmountFormatted,
    outputToken: unified.outputAmountFormatted,
    inputAmount: unified.inputAmount,
    estimatedOutput: unified.outputAmount,
    priceImpact: unified.priceImpactPct,
    platformFee: unified.platformFeeFormatted,
    platformFeeUsd: unified.platformFeeUsd,
    dexFee: unified.dexFeeUsd.toFixed(4),
    dexFeeUsd: unified.dexFeeUsd,
    networkFee: unified.networkFeeUsd.toFixed(4),
    networkFeeUsd: unified.networkFeeUsd,
    slippage: unified.slippagePct,
    minReceived: unified.outputAmountMin,
    route: unified.route,
    dex: unified.source || 'N/A',
    available: unified.available,
    error: unified.error,
    quoteId,
    expiresAt,
    validForSeconds: QUOTE_TTL_MS / 1000,
    _unifiedQuote: unified,
  };

  return result;
}

/** Execute a trade — gates on chain readiness and quote validity. */
export async function executeTrade(
  params: QuoteParams,
  quote: TradeQuote,
  walletAddress: string,
  referrerUsername?: string | null,
): Promise<TradeResult> {
  // Gate: chain readiness
  const ready = await isChainReadyForTrading(params.chainId);
  if (!ready) {
    return { success: false, error: 'TRADING NOT ENABLED — Chain infrastructure not ready. Market data only.' };
  }

  // Gate: quote validity
  if (!isQuoteValid(quote.quoteId)) {
    return { success: false, error: 'QUOTE EXPIRED — Please request a new quote.' };
  }

  if (!quote.available || !quote._unifiedQuote?.swapParams || !quote._unifiedQuote?.swapQuote) {
    return { success: false, error: quote.error || 'Quote not available' };
  }

  try {
    const trade = await engineExecuteTrade({
      chainId: params.chainId,
      side: params.side,
      tokenAddress: params.tokenAddress,
      tokenSymbol: params.tokenSymbol,
      amountUsd: params.amountUsd,
      slippagePct: params.slippagePct,
      walletAddress,
      swapParams: quote._unifiedQuote.swapParams,
      swapQuote: quote._unifiedQuote.swapQuote,
      referrerUsername,
      quoteId: quote.quoteId,
    });

    if (trade.status === 'failed') {
      return { success: false, error: trade.error || 'TRADE FAILED' };
    }

    const txData = getTradeTxData(trade.id);
    return { success: true, tradeId: trade.id, status: trade.status as TradeStatus, txData };
  } catch (e: any) {
    return { success: false, error: e.message || 'EXECUTION FAILED' };
  }
}

export async function submitSignedTx(
  tradeId: string,
  txHash: string,
  referrerUsername?: string | null,
): Promise<TradeResult> {
  try {
    const trade = await confirmTradeSubmission(tradeId, txHash, referrerUsername);
    return {
      success: trade.status === 'confirmed',
      txHash: trade.hash || undefined,
      error: trade.error || undefined,
      tradeId: trade.id,
      status: trade.status as TradeStatus,
    };
  } catch (e: any) {
    return { success: false, error: e.message || 'SUBMISSION FAILED' };
  }
}

export { calculateFees, isQuoteValid, getQuoteRemainingSeconds };
export { onTradeUpdate, getTrade, getActiveTrades } from './engine/trade-engine';