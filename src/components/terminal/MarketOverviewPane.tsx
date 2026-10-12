// Cupcak8 Swap — Market Overview Pane (left sidebar)
// Token list with search, filters, warm cream theme
import { useState } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
  loading: boolean;
  onSelect: (t: MarketToken) => void;
}

type Filter = 'all' | 'volume' | 'gainers' | 'losers' | 'hot';

const FILTERS: { id: Filter; label: string; icon?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'volume', label: 'Vol' },
  { id: 'gainers', label: '↑ Gainers' },
  { id: 'losers', label: '↓ Losers' },
  { id: 'hot', label: '🔥 Hot' },
];

export default function MarketOverviewPane({ tokens, loading, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = tokens.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    if (filter === 'gainers') return (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0);
    if (filter === 'losers') return (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0);
    return (b.volume24h ?? 0) - (a.volume24h ?? 0);
  });

  return (
    <div className="terminal-pane" style={{ fontSize: 11 }}>
      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '6px 8px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
        background: 'var(--bg-elevated)',
      }}>
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '4px 8px', fontSize: 10, fontWeight: 600,
              background: isActive ? 'var(--green-bg)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: isActive ? '#E8547C' : 'var(--text-dim)',
              transition: 'all 0.12s',
            }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: '6px 8px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search pair..." style={{
            fontSize: 11, padding: '6px 10px', width: '100%',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-bright)', outline: 'none',
            transition: 'border-color 0.12s', boxSizing: 'border-box',
          }}
          onFocus={e => e.currentTarget.style.borderColor = '#E8547C'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 70px 60px',
        padding: '5px 8px', fontSize: 9, fontWeight: 700,
        color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
        letterSpacing: '0.04em', background: 'var(--bg-elevated)',
      }}>
        <span>Pair</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>24H</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
            Loading markets...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No pairs found</div>
          </div>
        )}
        {!loading && filtered.slice(0, 50).map((t, i) => {
          const isUp = (t.priceChange24h ?? 0) >= 0;
          return (
            <div key={`${t.chainId}-${t.address}-${i}`}
              onClick={() => onSelect(t)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 70px 60px',
                padding: '6px 8px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChainIcon chainId={t.chainId as ChainId} size={12} />
                <span style={{ fontWeight: 700, color: 'var(--text-bright)', fontSize: 11 }}>{t.symbol}</span>
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, color: 'var(--text-bright)' }}>
                {formatUsd(t.price)}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 700, fontSize: 11,
                color: isUp ? 'var(--lime-dim)' : 'var(--red)',
              }}>
                {isUp ? '+' : ''}{formatPct(t.priceChange24h)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}