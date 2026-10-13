/**
 * BSTONKEX — Launchpad Configuration
 * 
 * Multi-chain launchpad registry with factory addresses, event types,
 * and RPC endpoints. Used by the server to listen for new token creation
 * events across all supported chains.
 *
 * Replace PLACEHOLDER addresses with real on-chain factory contracts.
 */

export interface SolanaLaunchpad {
  id: string;
  name: string;
  factoryAddress: string;
  eventType: 'solana_program_log';
  signatureKeyword: string;
}

export interface EvmLaunchpad {
  id: string;
  name: string;
  factoryAddress: string;
  topic0: string;
}

export interface ChainConfig {
  chainId: string | number;
  rpcEndpoint: string;
  launchpads: (SolanaLaunchpad | EvmLaunchpad)[];
}

// Default Uniswap V2-style PairCreated topic0 (used by most EVM DEXes/factories)
const UNISWAP_V2_PAIR_CREATED_TOPIC0 =
  '0x0d36480ed686537000743d64d477322b3daed53670a6f9a28d249a8e01ed8920';

export const LAUNCHPAD_CONFIG: Record<string, ChainConfig> = {
  // ── 1. SOLANA ─────────────────────────────────────────────────
  sol: {
    chainId: 'solana',
    rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    launchpads: [
      {
        id: 'pumpfun',
        name: 'Pump.fun',
        factoryAddress: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
        eventType: 'solana_program_log',
        signatureKeyword: 'Program log: Instruction: Create',
      },
      {
        id: 'stonkfun',
        name: 'Stonkfun',
        factoryAddress: 'STNK...PLACEHOLDER_PROGRAM_ID',
        eventType: 'solana_program_log',
        signatureKeyword: 'Instruction: CreateCoin',
      },
    ],
  },

  // ── 2. BASE (EVM Chain ID: 8453) ──────────────────────────────
  base: {
    chainId: 8453,
    rpcEndpoint: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    launchpads: [
      {
        id: 'o1exchange',
        name: 'O1 Exchange',
        factoryAddress: '0x01...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'stonk',
        name: 'Stonk Base',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'openlaunch',
        name: 'OpenLaunch',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 3. PULSECHAIN (EVM Chain ID: 369) ─────────────────────────
  rh: {
    chainId: 369,
    rpcEndpoint: process.env.PULSECHAIN_RPC_URL || 'https://rpc.pulsechain.com',
    launchpads: [
      {
        id: 'pons',
        name: 'Pons',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'longpad',
        name: 'Long',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'openlaunch',
        name: 'OpenLaunch RH',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 4. INK CHAIN (EVM Chain ID: 57073) ────────────────────────
  ink: {
    chainId: 57073,
    rpcEndpoint: process.env.INK_RPC_URL || 'https://rpc-gel.inkonchain.com',
    launchpads: [
      {
        id: 'inkypump',
        name: 'InkyPump',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 5. TRON (non-EVM — uses node event polling) ───────────────
  tron: {
    chainId: 'tron',
    rpcEndpoint: process.env.TRON_RPC_URL || 'https://api.trongrid.io',
    launchpads: [
      {
        id: 'sunpump',
        name: 'SunPump',
        factoryAddress: 'TKMpW4MFpwLUMF6Fs2VthLKVfGFpLPjZbs',
        eventType: 'solana_program_log' as const,
        signatureKeyword: 'ContractCreate',
      },
    ],
  },

  // ── 6. BSC (EVM Chain ID: 56) ─────────────────────────────────
  bsc: {
    chainId: 56,
    rpcEndpoint: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    launchpads: [
      {
        id: 'fourmeme',
        name: '4meme',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'flap',
        name: 'Flap Swap',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'genius',
        name: 'Genius',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 7. ARCADEUM (EVM Chain ID: ?) ─────────────────────────────
  arc: {
    chainId: 'arc',
    rpcEndpoint: process.env.ARC_RPC_URL || '',
    launchpads: [
      {
        id: 'archway',
        name: 'Archway Launch',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 8. STABLE CHAIN ───────────────────────────────────────────
  stable: {
    chainId: 'stable',
    rpcEndpoint: process.env.STABLE_RPC_URL || '',
    launchpads: [
      {
        id: 'stablefun',
        name: 'Stable Launch',
        factoryAddress: '0x...PLACEHOLDER_ADDRESS',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },
};

/**
 * Get all launchpads across all chains as a flat list with chain context.
 */
export function getAllLaunchpads(): Array<{
  chain: string; chainId: string | number; id: string; name: string; factoryAddress: string;
}> {
  const result: Array<{
    chain: string; chainId: string | number; id: string; name: string; factoryAddress: string;
  }> = [];

  for (const [chainKey, config] of Object.entries(LAUNCHPAD_CONFIG)) {
    for (const lp of config.launchpads) {
      result.push({
        chain: chainKey,
        chainId: config.chainId,
        id: lp.id,
        name: lp.name,
        factoryAddress: (lp as any).factoryAddress,
      });
    }
  }
  return result;
}

/**
 * Get launchpad config by chain + id.
 */
export function getLaunchpad(chainKey: string, launchpadId: string): {
  chainConfig: ChainConfig;
  launchpad: SolanaLaunchpad | EvmLaunchpad;
} | null {
  const chainConfig = LAUNCHPAD_CONFIG[chainKey.toLowerCase()];
  if (!chainConfig) return null;
  const lp = chainConfig.launchpads.find(l => l.id === launchpadId);
  return lp ? { chainConfig, launchpad: lp } : null;
}