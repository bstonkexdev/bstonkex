// Multi-chain launchpad mapping matrix — 8 chains with official logos + launchpads
import { CHAIN_LOGOS } from '../../assets/wallet-chains';

export interface ChainInfo {
  key: string;
  label: string;
  logo: string;
  color: string;
}

export interface LaunchpadInfo {
  id: string;
  name: string;
}

// Official chain logos from DefiLlama icon service (wallet-chains assets)
export const CHAIN_LIST: ChainInfo[] = [
  { key: 'BSC', label: 'BSC', logo: CHAIN_LOGOS.bsc, color: '#F0B90B' },
  { key: 'BASE', label: 'Base', logo: CHAIN_LOGOS.base, color: '#0052FF' },
  { key: 'RH', label: 'Robinhood', logo: CHAIN_LOGOS.robinhood, color: '#00C805' },
  { key: 'SOL', label: 'Solana', logo: CHAIN_LOGOS.sol, color: '#9945FF' },
  { key: 'INK', label: 'Ink', logo: CHAIN_LOGOS.ink, color: '#7B3FE4' },
  { key: 'ARC', label: 'Arc', logo: CHAIN_LOGOS.arc, color: '#E84142' },
  { key: 'STABLE', label: 'Stable', logo: CHAIN_LOGOS.stable, color: '#26A17B' },
  { key: 'TRON', label: 'Tron', logo: '/assets/1791895113291-t3hkdu.png', color: '#EF0027' },
];

export const CHAINS = CHAIN_LIST.map(c => c.key);

export const LAUNCHPADS_BY_CHAIN: Record<string, LaunchpadInfo[]> = {
  BSC: [
    { id: 'flap', name: 'Flap Swap' },
    { id: 'fourmeme', name: '4meme' },
    { id: 'genius', name: 'Genius' },
  ],
  BASE: [
    { id: 'o1exchange', name: 'O1 Exchange' },
    { id: 'stonk', name: 'Stonk' },
    { id: 'openlaunch', name: 'OpenLaunch' },
  ],
  RH: [
    { id: 'pons', name: 'Pons' },
    { id: 'longpad', name: 'Longpad' },
    { id: 'openlaunch', name: 'OpenLaunch' },
  ],
  SOL: [
    { id: 'pumpfun', name: 'Pump.fun' },
    { id: 'stonkfun', name: 'Stonkfun' },
  ],
  INK: [
    { id: 'inkypump', name: 'InkyPump' },
  ],
  ARC: [
    { id: 'archway', name: 'Archway Launch' },
  ],
  STABLE: [
    { id: 'stablefun', name: 'Stable Launch' },
  ],
  TRON: [
    { id: 'sunpump', name: 'SunPump' },
  ],
};

export const FILTER_TABS = [
  { id: 'trending', label: '🔥 Trending' },
  { id: 'new', label: '✨ New' },
  { id: 'bonding', label: '🫧 Bonding' },
  { id: 'migrated', label: '🚀 Migrated' },
  { id: 'gainers', label: '📈 Gainers' },
  { id: 'losers', label: '📉 Losers' },
] as const;

export function getChainInfo(key: string): ChainInfo | undefined {
  return CHAIN_LIST.find(c => c.key === key);
}
