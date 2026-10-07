// BSTONKEX Portfolio Engine — Multi-chain wallet portfolio aggregation
import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS } from '../config';
import { getChainAdapter, getNativePrices } from './chain-registry';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import { isSandboxed } from './sandbox';
import type { WalletBalance, TokenBalance } from './types';

// ── Well-known tokens per chain (for portfolio display) ──────
const COMMON_TOKENS: Record<string, { address: string; symbol: string; decimals: number }[]> = {
  bsc: [
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18 },
    { address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', symbol: 'BUSD', decimals: 18 },
    { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18 },
  ],
  base: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18 },
  ],
  solana: [
    { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
    { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
  ],
  robinhood: [],
};

// ── Portfolio Fetching ───────────────────────────────────────

/** Fetch complete portfolio for a wallet on a single chain. */
export async function getChainPortfolio(chainId: ChainId, walletAddress: string): Promise<WalletBalance> {
  const cacheKey = CACHE_KEYS.balance(chainId, walletAddress);

  return cacheGetOrCompute(cacheKey, async () => {
    // In sandbox preview, RPCs are blocked — return empty
    if (isSandboxed()) return emptyBalance(chainId, walletAddress);

    const adapter = getChainAdapter(chainId);
    if (!adapter) return emptyBalance(chainId, walletAddress);

    const nativePrice = await adapter.getNativePriceUsd();
    const nativeBalance = await adapter.getNativeBalance(walletAddress);
    const nativeBalanceUsd = parseFloat(nativeBalance) * nativePrice;

    const tokens: TokenBalance[] = [];
    const commonTokens = COMMON_TOKENS[chainId] || [];

    // Fetch balances for common tokens
    await Promise.allSettled(commonTokens.map(async (token) => {
      try {
        const balance = await adapter.getTokenBalance(walletAddress, token.address, token.decimals);
        const balanceNum = parseFloat(balance);
        if (balanceNum <= 0) return;

        const price = await adapter.getTokenPriceUsd(token.address);
        const valueUsd = price !== null ? balanceNum * price : null;

        tokens.push({
          address: token.address,
          symbol: token.symbol,
          name: token.symbol,
          decimals: token.decimals,
          balance,
          balanceFormatted: balanceNum,
          priceUsd: price,
          valueUsd,
          logoUrl: null,
        });
      } catch { /* skip token */ }
    }));

    const totalTokenUsd = tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0);

    return {
      chainId,
      address: walletAddress,
      nativeBalance,
      nativeBalanceUsd,
      tokens,
      totalUsd: nativeBalanceUsd + totalTokenUsd,
      updatedAt: Date.now(),
    };
  }, TTL.BALANCE);
}

/** Fetch portfolio across all configured chains. */
export async function getAllChainPortfolios(walletAddress: string): Promise<WalletBalance[]> {
  const balances = await Promise.allSettled(
    CONFIGURED_CHAINS.map(chain => getChainPortfolio(chain.id as ChainId, walletAddress))
  );
  return balances
    .filter((r): r is PromiseFulfilledResult<WalletBalance> => r.status === 'fulfilled')
    .map(r => r.value);
}

/** Calculate total portfolio value across all chains. */
export async function getTotalPortfolioValue(walletAddress: string): Promise<{
  totalUsd: number;
  change24hPct: number | null;
  chains: WalletBalance[];
}> {
  const chains = await getAllChainPortfolios(walletAddress);
  const totalUsd = chains.reduce((sum, c) => sum + c.totalUsd, 0);
  return { totalUsd, change24hPct: null, chains }; // 24h change needs historical data
}

function emptyBalance(chainId: ChainId, walletAddress: string): WalletBalance {
  return {
    chainId,
    address: walletAddress,
    nativeBalance: '0',
    nativeBalanceUsd: 0,
    tokens: [],
    totalUsd: 0,
    updatedAt: Date.now(),
  };
}