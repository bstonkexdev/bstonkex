// Multi-chain launchpad mapping matrix — 8 chains with their launchpads

export interface LaunchpadInfo {
  id: string;
  name: string;
}

export const CHAINS = ['BSC', 'BASE', 'RH', 'SOL', 'INK', 'ARC', 'STABLE', 'TRON'] as const;

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
