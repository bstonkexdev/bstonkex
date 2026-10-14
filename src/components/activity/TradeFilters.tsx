// Cupcak8 Swap — Trade Filters Component
// Tab filters: All | KOL | SmartMoney | Sniper | Cabal | Followed | Creator
// Matches ave.ai filter style

interface Props {
  active: string;
  onSelect: (filter: string) => void;
  counts?: Record<string, number>;
}

const FILTERS = [
  { id: 'all',      label: 'ALL',     icon: '' },
  { id: 'kol',      label: 'KOL',     icon: '📢' },
  { id: 'smart',    label: 'SMART',   icon: '🍃' },
  { id: 'sniper',   label: 'SNIPER',  icon: '⚡' },
  { id: 'cabal',    label: 'CABAL',   icon: '🤝' },
  { id: 'followed', label: 'FOLLOW',  icon: '👁' },
  { id: 'creator',  label: 'CREATOR', icon: '👑' },
];

export default function TradeFilters({ active, onSelect, counts }: Props) {
  return (
    <div style={{
      display: 'flex',
      gap: 2,
      overflowX: 'auto',
      padding: '4px 0',
      scrollbarWidth: 'none',
    }}>
      {FILTERS.map(f => {
        const isActive = active === f.id;
        const count = counts?.[f.id];
        return (
          <button key={f.id} onClick={() => onSelect(f.id)} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
            background: isActive ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.03)',
            color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)',
            transition: 'all 0.15s ease',
          }}>
            {f.icon && <span style={{ fontSize: 10 }}>{f.icon}</span>}
            <span>{f.label}</span>
            {count != null && count > 0 && (
              <span style={{
                fontSize: 7,
                padding: '1px 4px',
                borderRadius: 3,
                background: isActive ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.25)',
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}