// Cupcak8 Swap — Compact token page tab bars (bar A below header, bar B below chart).
// Both bars switch the same data panel; only real, functional views are listed.

export type PanelTab =
  | 'markets' | 'detail' | 'history' | 'risk'
  | 'trade' | 'liquidity' | 'orders' | 'activity' | 'info';

export interface TabDef { id: PanelTab; label: string; }

// Bar A — info views. HOLDERS is intentionally absent: the holder indexer returns
// no data today, and the spec forbids fake holder counts.
export const TABS_A: TabDef[] = [
  { id: 'markets', label: 'MARKETS' },
  { id: 'detail', label: 'DETAIL' },
  { id: 'history', label: 'HISTORY' },
  { id: 'risk', label: 'RISK' },
];

// Bar B — trading views.
export const TABS_B: TabDef[] = [
  { id: 'trade', label: 'TRADE' },
  { id: 'liquidity', label: 'LIQUIDITY' },
  { id: 'orders', label: 'MY ORDERS' },
  { id: 'activity', label: 'ACTIVITY' },
  { id: 'info', label: 'INFO' },
];

interface BarProps {
  tabs: TabDef[];
  active: PanelTab;
  onSelect: (t: PanelTab) => void;
  label: string;
}

export function TokenTabBar({ tabs, active, onSelect, label }: BarProps) {
  return (
    <div className="token-tabbar" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`token-tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
