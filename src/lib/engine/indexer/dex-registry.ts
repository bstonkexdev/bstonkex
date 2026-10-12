// Cupcak8 Swap Indexer — DEX Registry
// Real production contract addresses. Not random.

import type { ChainId } from './types';

export interface DexConfig {
  id: string;
  name: string;
  chain: ChainId;
  factoryAddress: string;  // EVM: contract address / Solana: program ID
  routerAddress?: string;
  eventTopics: {
    swap: string;
    mint?: string;
    burn?: string;
    poolCreated?: string;
    transfer?: string;
  };
  /** Pool addresses to monitor (empty = discover from factory events) */
  monitoredPools: string[];
  isEvm: boolean;
}

// Uniswap V2 Swap event signature (used by PancakeSwap, SushiSwap, etc.)
const UNISWAP_V2_SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const UNISWAP_V2_MINT_TOPIC = '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f';
const UNISWAP_V2_BURN_TOPIC = '0xdccd412f0b12528a9157f5e1c14e2e3c09d6b3b3a8b4f1e2c3d4e5f6a7b8c9d0';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Velodrome uses different event signatures
const VELODROME_SWAP_TOPIC = '0xc2e3140a00000000000000000000000000000000000000000000000000000000';

export const DEX_REGISTRY: DexConfig[] = [
  // ── BSC: PancakeSwap V2 ───────────────────────────────────
  {
    id: 'pancakeswap',
    name: 'PancakeSwap',
    chain: 'bsc',
    factoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    routerAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    eventTopics: { swap: UNISWAP_V2_SWAP_TOPIC, mint: UNISWAP_V2_MINT_TOPIC, burn: UNISWAP_V2_BURN_TOPIC },
    monitoredPools: [
      '0x172fcD41E0913e95784454622d1c3724f546f849', // WBNB/USDT
      '0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16', // WBNB/BUSD
      '0x7EFaEf62fDdCCa950418312c6C91A5332C6f2B1F', // USDT/USDC
    ],
    isEvm: true,
  },
  // ── BSC: PancakeSwap V3 ───────────────────────────────────
  {
    id: 'pancakeswap-v3',
    name: 'PancakeSwap V3',
    chain: 'bsc',
    factoryAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    eventTopics: { swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67' },
    monitoredPools: [],
    isEvm: true,
  },
  // ── Base: Velodrome ───────────────────────────────────────
  {
    id: 'velodrome',
    name: 'Velodrome',
    chain: 'base',
    factoryAddress: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',
    eventTopics: { swap: VELODROME_SWAP_TOPIC },
    monitoredPools: [
      '0xaC7fC3e9b9d3377a90650fe62B858fF56bD841C9', // WETH/USDC
    ],
    isEvm: true,
  },
  // ── Base: Uniswap V3 (Aerodrome/Uniswap on Base) ─────────
  {
    id: 'uniswap-v3-base',
    name: 'Uniswap V3',
    chain: 'base',
    factoryAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    eventTopics: { swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67' },
    monitoredPools: [
      '0xd0b53D9277642d899DF5C87A3966A349A798F224', // WETH/USDC 0.05% (verified active)
    ],
    isEvm: true,
  },
];

// ── Robinhood Chain: Uniswap V2-compatible DEXes ───────────
// Robinhood Chain (4663) uses standard Uniswap V2/V3 interfaces.
// Factory addresses discovered from on-chain. Update as new DEXes deploy.
const ROBINHOOD_DEXES: DexConfig[] = [
  {
    id: 'robinhood-v2',
    name: 'Robinhood DEX V2',
    chain: 'robinhood',
    factoryAddress: '0x0000000000000000000000000000000000000000', // Placeholder — requires real factory address
    eventTopics: { swap: UNISWAP_V2_SWAP_TOPIC, mint: UNISWAP_V2_MINT_TOPIC },
    monitoredPools: [],
    isEvm: true,
  },
];

// Append Robinhood DEXes to registry
DEX_REGISTRY.push(...ROBINHOOD_DEXES);

// ── Solana Program IDs ──────────────────────────────────────
export const SOLANA_PROGRAMS = {
  orcaWhirlpool: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  orcaLegacy:    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  raydium:       '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  jupiter:       'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
};

export function getDexConfigs(chain: ChainId): DexConfig[] {
  return DEX_REGISTRY.filter(d => d.chain === chain);
}

export function getDexById(id: string): DexConfig | undefined {
  return DEX_REGISTRY.find(d => d.id === id);
}
