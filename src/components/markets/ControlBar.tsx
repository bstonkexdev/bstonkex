import type { ChainId } from '../../lib/config';
import ChainSelector from '../ChainSelector';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '24h';
type SortBy = 'volume' | 'price' | 'change' | 'mcap' | 'age' | 'holders';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '24h'];
const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: 'volume', label: 'VOLUME' },
  { id: 'price', label: 'PRICE' },
  { id: 'change', label: '24H%' },
  { id: 'mcap', label: 'MCAP' },
  { id: 'age', label: 'AGE' },
  { id: 'holders', label: 'HOLDERS' },
];

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  chain: ChainId | 'all';
  onChainChange: (c: ChainId | 'all') => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  sortBy: SortBy;
  onSortChange: (s: SortBy) => void;
  onFilterOpen: () => void;
  filterCount: number;
}

export default function ControlBar({
  search, onSearchChange,
  chain, onChainChange,
  timeframe, onTimeframeChange,
  sortBy, onSortChange,
  onFilterOpen, filterCount,
}: Props) {
  return (
    <div className="market-control-bar">
      {/* Search */}
      <div className="market-search-wrap">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="market-search-input"
          placeholder="Search token / pair"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      {/* Chain */}
      <ChainSelector value={chain} onChange={onChainChange} />

      {/* Timeframe */}
      <div className="market-control-group">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            className={`market-control-btn ${timeframe === tf ? 'active' : ''}`}
            onClick={() => onTimeframeChange(tf)}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Sort */}
      <select
        className="market-control-select"
        value={sortBy}
        onChange={e => onSortChange(e.target.value as SortBy)}
      >
        {SORT_OPTIONS.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      {/* Filter */}
      <button className="market-control-btn filter-btn" onClick={onFilterOpen}>
        FILTER{filterCount > 0 ? ` (${filterCount})` : ''}
      </button>
    </div>
  );
}

export type { Timeframe, SortBy };