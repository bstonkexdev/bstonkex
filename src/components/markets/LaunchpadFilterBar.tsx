// Cupcak8 Swap — Launchpad Filter Bar
// Chain-specific launchpad tab filter with active state styling
import { memo } from 'react';

interface LaunchpadTab {
  id: string;
  label: string;
}

const CUPCAK8_LAUNCHPAD_TABS: Record<string, LaunchpadTab[]> = {
  bsc: [
    { id: 'all', label: 'All BSC' },
    { id: 'flapswap', label: 'Flapswap' },
    { id: 'fourmeme', label: 'Four.meme' },
    { id: 'genius', label: 'Genius' },
  ],
  base: [
    { id: 'all', label: 'All Base' },
    { id: 'o1', label: 'Base O1' },
    { id: 'stonk', label: 'Stonk' },
    { id: 'openlaunch', label: 'OpenLaunch' },
  ],
  robinhood: [
    { id: 'all', label: 'All PulseChain' },
    { id: 'pons', label: 'Pons' },
    { id: 'long', label: 'Long' },
    { id: 'openlaunch', label: 'OpenLaunch' },
  ],
  solana: [
    { id: 'all', label: 'All Solana' },
    { id: 'pumpfun', label: 'Pump.fun' },
    { id: 'stonkfun', label: 'Stonkfun' },
    { id: 'bags', label: 'Bags' },
  ],
};

interface Props {
  selectedChain: string;
  activeFilter: string;
  onSelectFilter: (id: string) => void;
}

export default memo(function LaunchpadFilterBar({ selectedChain, activeFilter, onSelectFilter }: Props) {
  const currentTabs = CUPCAK8_LAUNCHPAD_TABS[selectedChain] || [{ id: 'all', label: 'All' }];

  return (
    <div style={{
      display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 12px',
      background: '#0d1117', borderBottom: '1px solid #1f2937',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {currentTabs.map(tab => {
        const isActive = activeFilter === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectFilter(tab.id)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              cursor: 'pointer', transition: 'all 0.15s',
              background: isActive ? '#7c3aed' : 'rgba(31,41,55,0.8)',
              color: isActive ? '#fff' : '#9ca3af',
              boxShadow: isActive ? '0 4px 12px rgba(124,58,237,0.5)' : 'none',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = '#374151';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.color = '#9ca3af';
                e.currentTarget.style.background = 'rgba(31,41,55,0.8)';
              }
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});
