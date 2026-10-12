// Cupcak8 Swap Chain Registry — maps ChainId to adapter instances
import type { ChainId } from '../config';
import { CHAINS } from '../config';
import { createEvmAdapter, type EvmChainConfig } from './evm-adapter';
import { createSolanaAdapter } from './solana-adapter';
import type { ChainAdapter } from './types';

// ── EVM Chain Configurations ─────────────────────────────────
const BNB_CONFIG: EvmChainConfig = {
  chainId: 'bsc',
  numericChainId: 56,
  rpcUrls: [
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
  ],
  nativeSymbol: 'BNB',
  nativeDecimals: 18,
  oneInchChainId: 56,
  wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
};

const BASE_CONFIG: EvmChainConfig = {
  chainId: 'base',
  numericChainId: 8453,
  rpcUrls: [
    'https://rpc.ankr.com/base',
    'https://mainnet.base.org',
  ],
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  oneInchChainId: 8453,
  wrappedNative: '0x4200000000000000000000000000000000000006', // WETH on Base
};

const ROBINHOOD_CONFIG: EvmChainConfig = {
  chainId: 'robinhood',
  numericChainId: 4663,
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  oneInchChainId: 4663,
  // WETH on Robinhood Chain — per 1inch official Robinhood Chain documentation.
  wrappedNative: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
};

// ── Singleton Adapter Instances ──────────────────────────────
const adapters = new Map<ChainId, ChainAdapter>();

function getAdapter(chainId: ChainId): ChainAdapter {
  if (adapters.has(chainId)) return adapters.get(chainId)!;

  let adapter: ChainAdapter;
  switch (chainId) {
    case 'bsc':
      adapter = createEvmAdapter(BNB_CONFIG);
      break;
    case 'base':
      adapter = createEvmAdapter(BASE_CONFIG);
      break;
    case 'robinhood':
      adapter = createEvmAdapter(ROBINHOOD_CONFIG);
      break;
    case 'solana':
      adapter = createSolanaAdapter();
      break;
    default:
      throw new Error(`Unsupported chain: ${chainId}`);
  }

  adapters.set(chainId, adapter);
  return adapter;
}

/** Get adapter for configured chains. Returns null if chain not configured.
 *  Robinhood now uses public RPC as fallback when no Alchemy key is set. */
export function getChainAdapter(chainId: ChainId): ChainAdapter | null {
  const chain = CHAINS[chainId];
  if (!chain?.configured) return null;
  try {
    return getAdapter(chainId);
  } catch {
    return null;
  }
}

/** Get all active adapters. */
export function getAllAdapters(): ChainAdapter[] {
  const result: ChainAdapter[] = [];
  for (const chain of Object.values(CHAINS)) {
    if (chain.configured) {
      const adapter = getChainAdapter(chain.id as ChainId);
      if (adapter) result.push(adapter);
    }
  }
  return result;
}

/** Get the native price across all chains (for portfolio calculations). */
export async function getNativePrices(): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const adapters = getAllAdapters();
  await Promise.allSettled(adapters.map(async (a) => {
    prices[a.chainId] = await a.getNativePriceUsd();
  }));
  return prices;
}