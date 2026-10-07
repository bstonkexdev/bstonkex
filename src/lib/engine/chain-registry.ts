// BSTONKEX Chain Registry — maps ChainId to adapter instances
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
    'https://bsc-dataseed1.binance.org',
    'https://bsc-dataseed2.binance.org',
    'https://bsc-dataseed3.binance.org',
    'https://rpc.ankr.com/bsc',
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
    'https://mainnet.base.org',
    'https://rpc.ankr.com/base',
    'https://base.llamarpc.com',
  ],
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  oneInchChainId: 8453,
  wrappedNative: '0x4200000000000000000000000000000000000006', // WETH on Base
};

const ROBINHOOD_CONFIG: EvmChainConfig = {
  chainId: 'robinhood',
  numericChainId: 4663,
  rpcUrls: [
    'https://rpc.ankr.com/robinhood',
    'https://robinhood-mainnet.g.alchemy.com/v2/demo',
  ],
  nativeSymbol: 'ETH',
  nativeDecimals: 18,
  oneInchChainId: 4663, // May not be supported by 1inch yet
  wrappedNative: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // Placeholder — needs real address
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
 *  Robinhood returns null unless an RPC credential override is set (public Ankr endpoint returns 403). */
export function getChainAdapter(chainId: ChainId): ChainAdapter | null {
  const chain = CHAINS[chainId];
  if (!chain?.configured) return null;
  // Skip Robinhood unless user has configured an authenticated RPC in credentials
  if (chainId === 'robinhood') {
    try {
      const envKey = (import.meta as any).env?.VITE_RH_RPC_PRIMARY;
      if (!envKey) return null; // No credential — don't create adapter (will 403)
    } catch { return null; }
  }
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