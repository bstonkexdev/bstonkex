// Launchpad metadata — chain → launchpad mapping with display info

export interface LaunchpadInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const LAUNCHPADS_BY_CHAIN: Record<string, LaunchpadInfo[]> = {
  SOL: [
    { id: 'pumpfun', name: 'Pump.fun', icon: '🟢', color: '#22C55E' },
    { id: 'bags', name: 'Bags', icon: '🟣', color: '#A855F7' },
    { id: 'stonk', name: 'Stonk', icon: '🟡', color: '#EAB308' },
    { id: 'openlaunch', name: 'OpenLaunch', icon: '🔴', color: '#EF4444' },
  ],
  BNB: [
    { id: 'fourmeme', name: 'Four.meme', icon: '🔵', color: '#3B82F6' },
    { id: 'genius', name: 'Genius', icon: '⚡', color: '#F59E0B' },
  ],
  BASE: [
    { id: 'apestore', name: 'ApeStore', icon: '🦍', color: '#8B5CF6' },
  ],
};

export const CHAINS = [
  { key: 'ALL', label: 'All Chains' },
  { key: 'SOL', label: '◎ SOL' },
  { key: 'BNB', label: '◆ BNB' },
  { key: 'BASE', label: '⬡ Base' },
] as const;

export const FILTER_TABS = [
  { id: 'trending', label: '🔥 Trending' },
  { id: 'new', label: '✨ New' },
  { id: 'bonding', label: '🫧 Bonding' },
  { id: 'migrated', label: '🔄 Migrated' },
  { id: 'gainers', label: '📈 Gainers' },
  { id: 'losers', label: '📉 Losers' },
] as const;

export function getLaunchpadName(id: string): string {
  for (const chain of Object.values(LAUNCHPADS_BY_CHAIN)) {
    const found = chain.find(lp => lp.id === id);
    if (found) return found.name;
  }
  return id;
}
