// Multi-chain launchpad mapping with official logos from launchpad-logos.ts
import { CHAIN_LOGOS } from '../../assets/wallet-chains';

export interface ChainInfo {
  key: string; label: string; logo: string; color: string;
}

export interface LaunchpadInfo {
  id: string; name: string; logo: string; initials: string; brandColor: string;
}

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
    { id: 'flap', name: 'Flap Swap', logo: '/assets/1791777500495-fss118.jpg', initials: 'FS', brandColor: '#D0FF00' },
    { id: 'fourmeme', name: '4meme', logo: '/assets/1791779927588-khb50w.jpg', initials: '4M', brandColor: '#FF6D00' },
    { id: 'genius', name: 'Genius', logo: '/images/launchpads/genius.svg', initials: 'GN', brandColor: '#FE86B4' },
  ],
  BASE: [
    { id: 'o1exchange', name: 'O1 Exchange', logo: '/assets/1791781275000-fjxpw0.png', initials: 'O1', brandColor: '#0052FF' },
    { id: 'stonk', name: 'Stonk', logo: '/images/launchpads/stonk-fun.png', initials: 'ST', brandColor: '#2E7D32' },
    { id: 'openlaunch', name: 'OpenLaunch', logo: '/images/launchpads/openlaunch.svg', initials: 'OL', brandColor: '#0052FF' },
  ],
  RH: [
    { id: 'pons', name: 'Pons', logo: '/images/launchpads/pons.png', initials: 'PN', brandColor: '#F57F17' },
    { id: 'longpad', name: 'Long', logo: '/assets/1791896549191-h0uso7.jpg', initials: 'LG', brandColor: '#7C3AED' },
    { id: 'openlaunch', name: 'OpenLaunch', logo: '/images/launchpads/openlaunch.svg', initials: 'OL', brandColor: '#0052FF' },
  ],
  SOL: [
    { id: 'pumpfun', name: 'Pump.fun', logo: '/assets/1791780232085-5hdc0n.png', initials: 'PF', brandColor: '#5FCB88' },
    { id: 'stonkfun', name: 'Stonkfun', logo: '/assets/1791780570183-l76tqa.png', initials: 'SF', brandColor: '#E64A19' },
  ],
  INK: [
    { id: 'inkypump', name: 'InkyPump', logo: '', initials: 'IP', brandColor: '#7B3FE4' },
  ],
  ARC: [
    { id: 'archway', name: 'Archway Launch', logo: '', initials: 'AL', brandColor: '#E84142' },
  ],
  STABLE: [
    { id: 'stablefun', name: 'Stable Launch', logo: '', initials: 'SL', brandColor: '#26A17B' },
  ],
  TRON: [
    { id: 'sunpump', name: 'SunPump', logo: '', initials: 'SP', brandColor: '#EF0027' },
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
