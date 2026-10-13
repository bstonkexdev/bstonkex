/**
 * BSTONKEX — Launchpad Configuration
 * 
 * Multi-chain launchpad registry with verified on-chain factory addresses,
 * event types, and RPC endpoints. Used by the server to listen for new token
 * creation events across all supported chains.
 */

export interface SolanaLaunchpad {
  id: string;
  name: string;
  factoryAddress: string;
  eventType: 'solana_program_log' | 'tron_event_log';
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
        factoryAddress: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
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
        factoryAddress: '0x8909Dc15e2017e5d71a179612A0f496ACD58eeF0',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'stonk',
        name: 'Stonk Base',
        factoryAddress: '0x35084B692F09193796d1D50A2E2C85C83416FfeE',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'openlaunch',
        name: 'OpenLaunch',
        factoryAddress: '0x028682F8125C170F5E6c5EE5cBA116AC6C3A824b',
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
        factoryAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'longpad',
        name: 'Long',
        factoryAddress: '0x17A6321287e076A1B0220A9aEE2a20e231b17bF1',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'openlaunch',
        name: 'OpenLaunch RH',
        factoryAddress: '0x1034A0a7E01C31f0E36087d853b51Ac60D25C030',
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
        factoryAddress: '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 5. TRON NETWORK (TRX Chain) ───────────────────────────────
  tron: {
    chainId: 'tron',
    rpcEndpoint: process.env.TRON_RPC_URL || 'https://api.trongrid.io',
    launchpads: [
      {
        id: 'sunpump',
        name: 'SunPump',
        factoryAddress: 'TTfvyrAz86hbZk5iDpKD78pqLGgi8C7AAw',
        eventType: 'tron_event_log',
        signatureKeyword: 'TokenCreate',
      },
    ],
  },

  // ── 6. BNB SMART CHAIN (BSC — EVM Chain ID: 56) ──────────────
  bsc: {
    chainId: 56,
    rpcEndpoint: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    launchpads: [
      {
        id: 'fourmeme',
        name: 'Four.Meme',
        factoryAddress: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'flap',
        name: 'Flap Swap',
        factoryAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
      {
        id: 'genius',
        name: 'Genius',
        factoryAddress: '0xca143ce32fe78f1f7019d7d551a6402fc5350c73',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 7. ARCHWAY / ARC (EVM / Cosmos ETH-compatible) ────────────
  arc: {
    chainId: 'archway-1',
    rpcEndpoint: process.env.ARC_RPC_URL || 'https://rpc.mainnet.archway.io',
    launchpads: [
      {
        id: 'archlaunch',
        name: 'Arch Launch',
        factoryAddress: '0x8035D4e1d9d95F47A22792c307040EcA9bA3B913',
        topic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
      },
    ],
  },

  // ── 8. STABLE CHAIN ───────────────────────────────────────────
  stable: {
    chainId: 'stable-mainnet',
    rpcEndpoint: process.env.STABLE_RPC_URL || 'https://rpc.stable.org',
    launchpads: [
      {
        id: 'stablelaunch',
        name: 'Stable Launchpad',
        factoryAddress: '0x2213F9f4c3dE81f3b890a599F84F8171112DDEB4',
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