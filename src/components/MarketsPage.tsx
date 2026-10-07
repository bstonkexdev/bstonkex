import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../lib/context';
import {
  getDiscovery, sortTokens, filterTokens,
  type MarketToken, type DiscoveryCategory, type SortField, type SortDir,
  type MarketFilters, DEFAULT_FILTERS,
} from '../lib/market-discovery';
import { gitlawb } from '../lib/gitlawb';
import type { ChainId } from '../lib/config';

import MarketNav, { type NavTab } from './markets/MarketNav';
import CategoryTabs, { CATEGORIES } from './markets/CategoryTabs';
import ControlBar, { type Timeframe, type SortBy } from './markets/ControlBar';
import FilterDrawer, { type FilterState, DEFAULT_FILTERS as FILTER_DEFAULTS } from './markets/FilterDrawer';
import MarketTable from './markets/MarketTable';
import MarketMobileList from './markets/MarketMobileList';

const PER_PAGE = 50;

const SORT_MAP: Record<SortBy, SortField> = {
  volume: 'volume', price: 'price', change: 'change24h',
  mcap: 'marketCap', age: 'age', holders: 'volume',
};

export default function MarketsPage() {
  const { setTradeToken, wallet, setActiveChain } = useApp();

  const [navTab, setNavTab] = useState<NavTab>('market');
  const [catTab, setCatTab] = useState('hot');
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState<ChainId | 'all'>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('24h');
  const [sortBy, setSortBy] = useState<SortBy>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(FILTER_DEFAULTS);
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [watchedAddresses, setWatchedAddresses] = useState<Set<string>>(new Set());

  // Map category tab to discovery category
  const discoveryCat = useMemo((): DiscoveryCategory => {
    const found = CATEGORIES.find(c => c.id === catTab);
    return (found?.mapped ?? 'trending') as DiscoveryCategory;
  }, [catTab]);

  // Load tokens
  useEffect(() => {
    setLoading(true);
    setPage(0);
    getDiscovery(discoveryCat)
      .then(data => { setTokens(data); setLoading(false); })
      .catch(() => { setTokens([]); setLoading(false); });
  }, [discoveryCat]);

  // Load watchlist
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

  const handleQuickBuy = useCallback((t: MarketToken) => {
    setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol });
  }, [setTradeToken]);

  // Processed data
  const processed = useMemo(() => {
    const marketFilters: MarketFilters = {
      ...DEFAULT_FILTERS,
      chain,
    };
    let filtered = filterTokens(tokens, marketFilters);

    // Additional FilterState filters
    if (filters.minMcap) filtered = filtered.filter(t => t.marketCap != null && t.marketCap >= parseFloat(filters.minMcap));
    if (filters.maxMcap) filtered = filtered.filter(t => t.marketCap != null && t.marketCap <= parseFloat(filters.maxMcap));
    if (filters.minLiquidity) filtered = filtered.filter(t => t.liquidity != null && t.liquidity >= parseFloat(filters.minLiquidity));
    if (filters.minVolume) filtered = filtered.filter(t => t.volume24h != null && t.volume24h >= parseFloat(filters.minVolume));
    if (filters.minHolders) filtered = filtered.filter(t => t.txns24h != null && t.txns24h >= parseFloat(filters.minHolders));
    if (filters.chains.length > 0) filtered = filtered.filter(t => filters.chains.includes(t.chainId));
    if (filters.riskLevel && filters.riskLevel !== 'Any') {
      filtered = filtered.filter(t => {
        if (filters.riskLevel === 'Low') return t.liquidity != null && t.liquidity > 10000;
        if (filters.riskLevel === 'Medium') return t.liquidity != null && t.liquidity > 1000 && t.liquidity <= 10000;
        if (filters.riskLevel === 'High') return t.liquidity == null || t.liquidity <= 1000;
        return true;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q) ||
        t.pairAddress.toLowerCase().includes(q) ||
        t.chainId.toLowerCase().includes(q)
      );
    }

    return sortTokens(filtered, SORT_MAP[sortBy], sortDir);
  }, [tokens, chain, filters, search, sortBy, sortDir]);

  const paged = processed.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(processed.length / PER_PAGE);

  const activeFilterCount = [
    filters.chains.length > 0, !!filters.minMcap, !!filters.maxMcap,
    !!filters.minLiquidity, !!filters.minVolume, !!filters.maxAge,
    !!filters.minHolders, filters.riskLevel && filters.riskLevel !== 'Any',
    filters.securityLevel && filters.securityLevel !== 'Any',
    filters.buyPressure && filters.buyPressure !== 'Any',
    filters.smartMoney && filters.smartMoney !== 'Any',
  ].filter(Boolean).length;

  return (
    <div className="page markets-page">
      {/* Primary Nav */}
      <MarketNav active={navTab} onChange={setNavTab} />

      {/* Category Tabs */}
      <CategoryTabs active={catTab} onChange={v => { setCatTab(v); setPage(0); }} />

      {/* Control Bar */}
      <ControlBar
        search={search} onSearchChange={v => { setSearch(v); setPage(0); }}
        chain={chain} onChainChange={v => { setChain(v); setPage(0); }}
        timeframe={timeframe} onTimeframeChange={setTimeframe}
        sortBy={sortBy} onSortChange={v => { setSortBy(v); setPage(0); }}
        onFilterOpen={() => setFilterOpen(true)} filterCount={activeFilterCount}
      />

      {/* Results bar */}
      <div className="markets-results-bar">
        <span>{loading ? 'LOADING...' : `${processed.length} MARKETS`}</span>
        {totalPages > 1 && <span>· PAGE {page + 1}/{totalPages}</span>}
      </div>

      {/* Desktop Table */}
      <div className="markets-desktop">
        <MarketTable
          tokens={paged} loading={loading} category={catTab}
          page={page} perPage={PER_PAGE}
          onClickToken={t => setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol })}
          onExplore={() => setCatTab('hot')}
          watchedAddresses={watchedAddresses} onToggleWatch={toggleWatch}
          onQuickBuy={handleQuickBuy}
        />
      </div>

      {/* Mobile Cards */}
      <div className="markets-mobile">
        <MarketMobileList
          tokens={paged} loading={loading} category={catTab}
          onClickToken={t => setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol })}
          onExplore={() => setCatTab('hot')}
          watchedAddresses={watchedAddresses} onToggleWatch={toggleWatch}
          onQuickBuy={handleQuickBuy}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="markets-pagination">
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(0)} style={{ fontSize: 8 }}>⏮</button>
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ fontSize: 8 }}>◀</button>
          <span className="page-info">{page + 1}/{totalPages}</span>
          <button className="btn btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ fontSize: 8 }}>▶</button>
          <button className="btn btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} style={{ fontSize: 8 }}>⏭</button>
        </div>
      )}

      {/* Filter Drawer */}
      <FilterDrawer
        open={filterOpen} onClose={() => setFilterOpen(false)}
        filters={filters} onApply={f => { setFilters(f); setPage(0); }}
      />
    </div>
  );
}