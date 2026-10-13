// Cupcak8 Swap — Ave.ai-Style Sub-Filter Bar
// [New] [Bonding] [Migrated] [Gainers] [Losers]
// Filters the market feed dynamically based on token state.

import type { DiscoveryCategory } from '../../lib/market-discovery';

export type SubFilter = 'trending' | 'new' | 'bonding' | 'migrated' | 'gainers' | 'losers';

interface SubFilterDef {
  id: SubFilter;
  label: string;
  icon: string;
  mapped: DiscoveryCategory;
  /** Custom filter applied to token list (in addition to discovery category) */
  tokenFilter?: (t: { bondingCurveProgress?: number | null; priceChange24h?: number | null }) => boolean;
  tip: string;
}

export const SUB_FILTERS: SubFilterDef[] = [
  {
    id: 'trending', label: 'Trending', icon: '🔥', mapped: 'trending',
    tip: 'Trending tokens by holders and market cap',
  },
  {
    id: 'new', label: 'New', icon: '✨', mapped: 'new',
    tip: 'Newest launches sorted by creation time',
  },
  {
    id: 'bonding', label: 'Bonding', icon: '🫧', mapped: 'trending',
    tokenFilter: t => (t.bondingCurveProgress ?? 0) < 100,
    tip: 'Inner market — still on bonding curve (progress < 100%)',
  },
  {
    id: 'migrated', label: 'Migrated', icon: '🔄', mapped: 'trending',
    tokenFilter: t => (t.bondingCurveProgress ?? 0) >= 80,
    tip: 'Near or past graduation (80%+ curve progress)',
  },
  {
    id: 'gainers', label: 'Gainers', icon: '📈', mapped: 'gainers',
    tip: 'Top 24h price gainers',
  },
  {
    id: 'losers', label: 'Losers', icon: '📉', mapped: 'losers',
    tip: 'Top 24h price losers',
  },
];

interface Props {
  active: SubFilter;
  onChange: (filter: SubFilter) => void;
}

export default function SubFilterBar({ active, onChange }: Props) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '8px 16px',
      borderBottom: '1px solid var(--border, #1E293B)',
      overflowX: 'auto', background: 'var(--bg-surface, #0F172A)',
    }}>
      {SUB_FILTERS.map(f => {
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            title={f.tip}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: isActive ? 'rgba(232, 84, 124, 0.15)' : 'rgba(255,255,255,0.04)',
              color: isActive ? '#E8547C' : 'var(--text-dim, #64748B)',
              fontSize: 11, fontWeight: isActive ? 700 : 500,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
              borderBottom: isActive ? '2px solid #E8547C' : '2px solid transparent',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            }}
          >
            {f.icon} {f.label}
          </button>
        );
      })}
    </div>
  );
}

/** Get the DiscoveryCategory for a sub-filter. */
export function getSubFilterCategory(filter: SubFilter): DiscoveryCategory {
  return SUB_FILTERS.find(f => f.id === filter)?.mapped ?? 'trending';
}

/** Apply sub-filter's custom token filter to a list. */
export function applySubFilter<T extends { bondingCurveProgress?: number | null; priceChange24h?: number | null }>(
  tokens: T[],
  filter: SubFilter,
): T[] {
  const def = SUB_FILTERS.find(f => f.id === filter);
  if (!def?.tokenFilter) return tokens;
  return tokens.filter(def.tokenFilter);
}
