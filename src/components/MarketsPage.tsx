// Cupcak8 Swap — Markets Page
// Explore Markets with real data, Cupcak8 sweet-retro brand identity
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../lib/context';
import type { ChainId } from '../lib/config';
import {
  getDiscovery, sortTokens, filterTokens,
  type MarketToken, type DiscoveryCategory, type SortField, type SortDir,
  type MarketFilters, DEFAULT_FILTERS,
} from '../lib/market-discovery';
import { gitlawb } from '../lib/gitlawb';

import MarketOverview from './markets/MarketOverview';
import TrenchesTerminal from './markets/TrenchesTerminal';
import MarketChainFilter from './markets/MarketChainFilter';
import LaunchpadLogoSelector from './markets/LaunchpadLogoSelector';
import SubFilterBar, { type SubFilter, getSubFilterCategory, applySubFilter } from './markets/SubFilterBar';
import FilterDrawer, { type FilterState, DEFAULT_FILTERS as FILTER_DEFAULTS } from './markets/FilterDrawer';
import MarketTable from './markets/MarketTable';
import MarketMobileList from './markets/MarketMobileList';
import { getLaunchpadTokens, enrichWithLaunchpad } from '../lib/engine/launchpad-indexer';

const PER_PAGE = 50;
type SortBy = 'volume' | 'price' | 'change' | 'liquidity' | 'trades' | 'mcap';

const SORT_MAP: Record<SortBy, SortField> = {
  volume: 'volume', price: 'price', change: 'change24h',
  liquidity: 'liquidity', trades: 'buys', mcap: 'marketCap',
};

export default function MarketsPage() {
  const { setTradeToken, wallet } = useApp();
  const [subFilter, setSubFilter] = useState<SubFilter>('new');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState<ChainId | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(FILTER_DEFAULTS);
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPageNum] = useState(0);
  const [watchedAddresses, setWatchedAddresses] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [selectedLaunchpad, setSelectedLaunchpad] = useState<string | null>(null);

  const discoveryCat = useMemo((): DiscoveryCategory => {
    return getSubFilterCategory(subFilter);
  }, [subFilter]);

  useEffect(() => {
    setLoading(true);
    setPageNum(0);
    setError('');
    if (selectedLaunchpad && chain !== 'all') {
      getLaunchpadTokens(chain, selectedLaunchpad, discoveryCat)
        .then(data => {
          if (!data.length) setError('No verified listings for this launchpad yet');
          setTokens(data); setLoading(false);
        })
        .catch(() => { setTokens([]); setLoading(false); setError('Launchpad data unavailable'); });
    } else {
      getDiscovery(discoveryCat)
        .then(data => { setTokens(enrichWithLaunchpad(data)); setLoading(false); })
        .catch(() => { setTokens([]); setLoading(false); setError('Market data unavailable'); });
    }
  }, [discoveryCat, chain, selectedLaunchpad]);

  useEffect(() => {
    if (!wallet.address) return;
    const load = async () => {
      try {
        const wl = gitlawb.db.collection<{ tokenAddress: string }>('watchlist');
        const { records } = await wl.list({ limit: 200 });
        setWatchedAddresses(new Set(records.map(r => r.data.tokenAddress)));
      } catch { /* ignore */ }
    };
    load();
  }, [wallet.address]);

  const toggleWatch = useCallback(async (t: MarketToken) => {
    if (!wallet.address) return;
    try {
      const wl = gitlawb.db.collection<{ tokenAddress: string; chainId: string; symbol: string }>('watchlist');
      const { records } = await wl.list({ limit: 200 });
      const existing = records.find(r => r.data.tokenAddress === t.address);
      if (existing) {
        await wl.remove(existing.id);
        setWatchedAddresses(prev => { const s = new Set(prev); s.delete(t.address); return s; });
      } else {
        await wl.create({ tokenAddress: t.address, chainId: t.chainId, symbol: t.symbol });
        setWatchedAddresses(prev => new Set(prev).add(t.address));
      }
    } catch { /* ignore */ }
  }, [wallet.address]);

  const handleTrade = useCallback((t: MarketToken) => {
    setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol });
  }, [setTradeToken]);

  const processed = useMemo(() => {
    const marketFilters: MarketFilters = { ...DEFAULT_FILTERS, chain };
    let filtered = filterTokens(tokens, marketFilters);
    // Apply Ave.ai sub-filter: New / Bonding / Migrated / Gainers / Losers
    filtered = applySubFilter(filtered, subFilter);
    if (filters.minMcap) filtered = filtered.filter(t => t.marketCap != null && t.marketCap >= parseFloat(filters.minMcap));
    if (filters.maxMcap) filtered = filtered.filter(t => t.marketCap != null && t.marketCap <= parseFloat(filters.maxMcap));
    if (filters.minLiquidity) filtered = filtered.filter(t => t.liquidity != null && t.liquidity >= parseFloat(filters.minLiquidity));
    if (filters.minVolume) filtered = filtered.filter(t => t.volume24h != null && t.volume24h >= parseFloat(filters.minVolume));
    if (filters.chains.length > 0) filtered = filtered.filter(t => filters.chains.includes(t.chainId));
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) || t.pairAddress.toLowerCase().includes(q)
      );
    }
    return sortTokens(filtered, SORT_MAP[sortBy], sortDir);
  }, [tokens, chain, filters, search, sortBy, sortDir, subFilter]);

  const paged = processed.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(processed.length / PER_PAGE);

  const activeFilterCount = [
    filters.chains.length > 0, !!filters.minMcap, !!filters.maxMcap,
    !!filters.minLiquidity, !!filters.minVolume,
  ].filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-deep)' }}>

      {/* ── TOOLBAR: search + refresh + filter ────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', flexWrap: 'nowrap',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            type="text"
            placeholder="Search token, pair, or contract..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPageNum(0); }}
            style={{
              width: '100%', padding: '7px 28px 7px 30px',
              fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', color: 'var(--text-bright)',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#E8547C'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 12, color: 'var(--text-muted)',
          }}>🔍</span>
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 5px', fontSize: 9, cursor: 'pointer',
              color: 'var(--text-dim)', lineHeight: 1,
            }}>✕</button>
          )}
        </div>
        {/* Refresh */}
        <button onClick={() => { setLoading(true); getDiscovery(discoveryCat).then(d => { setTokens(d); setError(''); }).catch(() => setError('Refresh failed')).finally(() => setLoading(false)); }}
          style={{
            padding: '7px 12px', background: 'transparent', flexShrink: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'border-color 0.12s, color 0.12s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8547C'; e.currentTarget.style.color = '#E8547C'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
        >
          {loading ? '⏳' : '↻'} <span className="toolbar-label">Refresh</span>
        </button>
        {/* Filter */}
        <button onClick={() => setFilterOpen(true)}
          style={{
            padding: '7px 12px', background: 'transparent', flexShrink: 0,
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'border-color 0.12s, color 0.12s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#B8A9E8'; e.currentTarget.style.color = '#B8A9E8'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
        >
          ⚙ <span className="toolbar-label">Filters</span>
          {activeFilterCount > 0 && <span style={{
            background: 'var(--yellow-bg)', color: 'var(--yellow-dim)',
            padding: '1px 5px', borderRadius: 10, fontSize: 9, fontWeight: 700,
          }}>{activeFilterCount}</span>}
        </button>
      </div>

      {/* ── MARKET OVERVIEW ────────────────────────────────── */}
      <MarketOverview tokens={tokens} loading={loading} />

      {/* ── ROW 1: CHAIN BUTTONS (ALL / BNB / SOL / BASE) ──── */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <MarketChainFilter active={chain} onChange={c => { setChain(c); setSelectedLaunchpad(null); setPageNum(0); }} />
      </div>

      {/* ── ROW 2: LAUNCHPAD LOGO BUTTONS (filtered by chain) ─ */}
      <LaunchpadLogoSelector
        chain={chain}
        selectedLaunchpad={selectedLaunchpad}
        onSelect={setSelectedLaunchpad}
      />

      {/* ── ROW 3: SUB-FILTER BAR [New] [Bonding] [Migrated] [Gainers] [Losers] ─ */}
      <SubFilterBar active={subFilter} onChange={v => { setSubFilter(v); setPageNum(0); }} />

      {/* ── TRENCHES TERMINAL (Real-Time Launchpad Feed) ───── */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <TrenchesTerminal />
      </div>

          {/* ── TOOLBAR (sort + filter) ──────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 600, flex: 1 }}>
              {loading ? 'Loading...' : error || `${processed.length} markets`}
              {selectedLaunchpad && (
                <span style={{
                  marginLeft: 6, fontSize: 10, fontWeight: 700,
                  color: 'var(--green)', background: 'var(--green-bg)',
                  padding: '2px 6px', borderRadius: 10,
                }}>
                  {selectedLaunchpad.replace(/-/g, ' ').toUpperCase()}
                </span>
              )}
            </span>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value as SortBy); setPageNum(0); }} style={{
              padding: '5px 8px', fontSize: 10, fontWeight: 600,
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)', color: 'var(--text)', cursor: 'pointer',
            }}>
              <option value="volume">Volume</option>
              <option value="price">Price</option>
              <option value="change">24H Change</option>
              <option value="liquidity">Liquidity</option>
              <option value="trades">Trades</option>
              <option value="mcap">Market Cap</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 700,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-dim)',
            }}>
              {sortDir === 'desc' ? '↓ Desc' : '↑ Asc'}
            </button>
          </div>

          {/* ── ERROR STATE ─────────────────────────────────────── */}
          {error && !loading && (
            <div style={{ padding: 24, textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>{error}</div>
              <button onClick={() => {
                setLoading(true);
                getDiscovery(discoveryCat).then(d => { setTokens(d); setError(''); }).catch(() => setError('Still unavailable'));
                setLoading(false);
              }} style={{
                padding: '8px 20px', background: '#E8547C', border: 'none',
                borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>Retry</button>
            </div>
          )}

          {/* ── DESKTOP TABLE ───────────────────────────────────── */}
          <div className="markets-desktop" style={{ flex: 1, overflow: 'auto' }}>
            <MarketTable
              tokens={paged} loading={loading} category={subFilter}
              onClickToken={handleTrade} onExplore={() => setSubFilter('new')}
              watchedAddresses={watchedAddresses} onToggleWatch={toggleWatch}
              onQuickBuy={handleTrade}
            />
          </div>

          {/* ── MOBILE CARDS ───────────────────────────────────── */}
          <div className="markets-mobile" style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            <MarketMobileList
              tokens={paged} loading={loading} category={subFilter}
              onClickToken={handleTrade} onExplore={() => setSubFilter('new')}
              watchedAddresses={watchedAddresses} onToggleWatch={toggleWatch}
              onQuickBuy={handleTrade}
            />
          </div>

          {/* ── PAGINATION ──────────────────────────────────────── */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '10px 16px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)',
            }}>
              <PagBtn disabled={page === 0} onClick={() => setPageNum(0)}>⏮</PagBtn>
              <PagBtn disabled={page === 0} onClick={() => setPageNum(p => p - 1)}>◀</PagBtn>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: '0 10px', fontWeight: 600 }}>
                {page + 1} / {totalPages}
              </span>
              <PagBtn disabled={page >= totalPages - 1} onClick={() => setPageNum(p => p + 1)}>▶</PagBtn>
              <PagBtn disabled={page >= totalPages - 1} onClick={() => setPageNum(totalPages - 1)}>⏭</PagBtn>
            </div>
          )}

          {/* ── FILTER DRAWER ───────────────────────────────────── */}
          <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}
            filters={filters} onApply={f => { setFilters(f); setPageNum(0); }} />

      {/* ── RESPONSIVE ──────────────────────────────────────── */}
      <style>{`
        .markets-desktop { display: block; }
        .markets-mobile { display: none; }
        @media (max-width: 768px) {
          .markets-desktop { display: none !important; }
          .markets-mobile { display: block !important; }
          .toolbar-label { display: none; }
        }
      `}</style>
    </div>
  );
}

function PagBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding: '5px 10px', fontSize: 11, fontWeight: 700,
      background: disabled ? 'var(--bg-elevated)' : 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-muted)' : 'var(--text-dim)',
      transition: 'background 0.12s',
    }}>{children}</button>
  );
}