// BSTONKEX Quote Engine — Unified quoting across all chains
import { PLATFORM_FEE_PCT, CHAINS, type ChainId } from '../config';
import { getChainAdapter } from './chain-registry';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import type { SwapQuote, SwapParams } from './types';

export interface UnifiedQuote {
  available: boolean;
  chainId: ChainId;
  side: 'buy' | 'sell';
  tokenSymbol: string;

  // Amounts
  inputAmount: string;
  inputAmountFormatted: string;
  outputAmount: string;
  outputAmountFormatted: string;
  outputAmountMin: string;

  // Fees
  platformFeeUsd: number;
  platformFeeFormatted: string;
  dexFeeUsd: number;
  networkFeeUsd: number;
  priceImpactPct: number;

  // Routing
  route: string[];
  source: string;
  slippagePct: number;

  // Raw swap data for execution
  swapQuote: SwapQuote | null;
  swapParams: SwapParams | null;

  error?: string;
}

export interface QuoteRequest {
  chainId: ChainId;
  side: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  slippagePct: number;
  walletAddress: string | null;
}

/** Get a unified quote for any chain/token pair. */
export async function getUnifiedQuote(req: QuoteRequest): Promise<UnifiedQuote> {
  const { chainId, side, tokenAddress, tokenSymbol, amountUsd, slippagePct, walletAddress } = req;

  // Validate chain
  const chain = CHAINS[chainId];
  if (!chain?.configured) {
    return emptyQuote(chainId, side, tokenSymbol, 'CHAIN NOT CONFIGURED');
  }

  // Validate amount
  if (amountUsd <= 0) {
    return emptyQuote(chainId, side, tokenSymbol, 'Enter an amount');
  }

  // Get adapter
  const adapter = getChainAdapter(chainId);
  if (!adapter) {
    return emptyQuote(chainId, side, tokenSymbol, 'CHAIN ADAPTER NOT AVAILABLE');
  }

  // Cache key for this quote
  const cacheKey = CACHE_KEYS.quote(`${chainId}:${side}:${tokenAddress}:${amountUsd}:${slippagePct}`);

  try {
    return await cacheGetOrCompute(cacheKey, async () => {
      // Get native token price to convert USD to native
      const nativePrice = await adapter.getNativePriceUsd();
      const nativeDecimals = adapter.nativeDecimals;

      // Determine token addresses for swap
      const nativeAddr = adapter.isEvm ? 'native' : 'native';
      const tokenIn = side === 'buy' ? nativeAddr : tokenAddress;
      const tokenOut = side === 'buy' ? tokenAddress : nativeAddr;

      // Convert USD amount to smallest native unit
      const nativeAmount = amountUsd / nativePrice;
      const amountInSmallest = BigInt(Math.floor(nativeAmount * Math.pow(10, nativeDecimals))).toString();

      const slippageBps = Math.floor(slippagePct * 100);

      const swapParams: SwapParams = {
        chainId,
        tokenIn,
        tokenOut,
        amountIn: amountInSmallest,
        slippageBps,
        walletAddress: walletAddress || '',
      };

      // Get swap quote from chain adapter
      const swapQuote = await adapter.getSwapQuote(swapParams);

      if (!swapQuote.available) {
        return emptyQuote(chainId, side, tokenSymbol, swapQuote.error || 'NO ROUTE AVAILABLE');
      }

      // Calculate platform fee from the trade value
      const platformFeeUsd = amountUsd * PLATFORM_FEE_PCT;

      // Format amounts
      const outDecimals = side === 'buy' ? (await adapter.getTokenMetadata(tokenAddress)).decimals : nativeDecimals;
      const outputFormatted = (Number(swapQuote.amountOut) / Math.pow(10, outDecimals)).toFixed(4);

      return {
        available: true,
        chainId,
        side,
        tokenSymbol,
        inputAmount: amountInSmallest,
        inputAmountFormatted: `${nativeAmount.toFixed(6)} ${adapter.nativeSymbol}`,
        outputAmount: swapQuote.amountOut,
        outputAmountFormatted: `${outputFormatted} ${tokenSymbol}`,
        outputAmountMin: swapQuote.amountOutMin,
        platformFeeUsd,
        platformFeeFormatted: `$${platformFeeUsd.toFixed(4)}`,
        dexFeeUsd: swapQuote.dexFeeUsd,
        networkFeeUsd: swapQuote.gasPriceUsd,
        priceImpactPct: swapQuote.priceImpactBps / 100,
        route: swapQuote.route.map(r => r.dex),
        source: swapQuote.source,
        slippagePct,
        swapQuote,
        swapParams,
      };
    }, TTL.QUOTE);
  } catch (e: any) {
    return emptyQuote(chainId, side, tokenSymbol, e.message || 'QUOTE FAILED');
  }
}

function emptyQuote(chainId: ChainId, side: 'buy' | 'sell', tokenSymbol: string, error: string): UnifiedQuote {
  return {
    available: false, chainId, side, tokenSymbol,
    inputAmount: '0', inputAmountFormatted: '0',
    outputAmount: '0', outputAmountFormatted: '0', outputAmountMin: '0',
    platformFeeUsd: 0, platformFeeFormatted: '$0',
    dexFeeUsd: 0, networkFeeUsd: 0, priceImpactPct: 0,
    route: [], source: '', slippagePct: 0,
    swapQuote: null, swapParams: null, error,
  };
}