interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  resultCount: number;
  loading: boolean;
}

export default function MarketHeader({ search, onSearchChange, showFilters, onToggleFilters, resultCount, loading }: Props) {
  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: 'var(--pixel) solid var(--border)',
      background: 'var(--bg-panel)',
      flexShrink: 0,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 13, fontWeight: 900,
          color: 'var(--text-bright)',
          letterSpacing: '0.12em',
        }}>
          MARKETS
        </span>
        <span style={{
          fontSize: 8, color: 'var(--text-dim)',
          letterSpacing: '0.05em',
        }}>
          Discover and analyze real-time multi-chain markets.
        </span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 8, color: 'var(--text-dim)',
          letterSpacing: '0.05em',
        }}>
          {loading ? 'LOADING...' : `${resultCount} MARKETS`}
        </span>
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            className="input"
            placeholder="Search token, contract, wallet or market..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              fontSize: 10,
              padding: '7px 10px 7px 28px',
              width: '100%',
            }}
          />
          {/* Search icon */}
          <svg
            width="12" height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2.5"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <button
          className={`btn btn-sm ${showFilters ? 'btn-cyan' : ''}`}
          onClick={onToggleFilters}
          style={{ fontSize: 8, padding: '3px 10px' }}
        >
          FILTERS {showFilters ? '▴' : '▾'}
        </button>
      </div>
    </div>
  );
}