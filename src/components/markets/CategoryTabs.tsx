// Cupcak8 Swap — Market Category Tabs
// Strawberry pink active, buttercream hover, pixel font labels
import type { DiscoveryCategory } from '../../lib/market-discovery';

interface CatDef {
  id: string;
  label: string;
  mapped: DiscoveryCategory;
  tip?: string;
  icon?: string;
}

const CATEGORIES: CatDef[] = [
  { id: 'trending', label: 'Trending', mapped: 'trending', icon: '🔥', tip: 'Ranked by recent real market activity' },
  { id: 'hot', label: 'Hot', mapped: 'volume', icon: '⚡' },
  { id: 'new', label: 'New', mapped: 'new', icon: '✨' },
  { id: 'gainers', label: 'Gainers', mapped: 'gainers', icon: '📈' },
  { id: 'losers', label: 'Losers', mapped: 'losers', icon: '📉' },
  { id: 'active', label: 'Active', mapped: 'active', icon: '◉' },
  { id: 'volume', label: 'Volume', mapped: 'volume', icon: '◈' },
  { id: 'liquidity', label: 'Liquidity', mapped: 'liquidity', icon: '💧' },
  { id: 'watchlist', label: 'Watchlist', mapped: 'watchlist', icon: '♡' },
];

interface Props {
  active: string;
  onChange: (cat: string) => void;
}

export default function CategoryTabs({ active, onChange }: Props) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto', flexShrink: 0,
      scrollbarWidth: 'none',
      background: 'var(--bg-surface)',
    }}>
      {CATEGORIES.map(cat => {
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            title={cat.tip}
            style={{
              padding: '10px 16px', fontSize: 11, fontWeight: 700,
              background: isActive ? 'var(--green-bg)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: isActive ? '#E8547C' : 'var(--text-dim)',
              borderBottom: isActive ? '2px solid #E8547C' : '2px solid transparent',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-bright)'; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-dim)'; }}
          >
            {cat.icon && <span style={{ fontSize: 12 }}>{cat.icon}</span>}
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

export { CATEGORIES };