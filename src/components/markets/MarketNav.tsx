import { useState } from 'react';

type NavTab = 'market' | 'pump' | 'follow' | 'smarter' | 'charts' | 'assets';

const TABS: { id: NavTab; label: string }[] = [
  { id: 'market', label: 'MARKET' },
  { id: 'pump', label: 'PUMP' },
  { id: 'follow', label: 'FOLLOW' },
  { id: 'smarter', label: 'SMARTER' },
  { id: 'charts', label: 'CHARTS' },
  { id: 'assets', label: 'ASSETS' },
];

interface Props {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

export default function MarketNav({ active, onChange }: Props) {
  return (
    <div className="market-nav">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`market-nav-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export type { NavTab };