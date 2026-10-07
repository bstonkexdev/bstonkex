import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../lib/context';
import { getDiscovery, type MarketToken, type DiscoveryCategory } from '../lib/market-discovery';
import { getTrendingTokens, type TokenData } from '../lib/market';
import { CHAINS, formatUsd, formatPct } from '../lib/config';
import { gitlawb } from '../lib/gitlawb';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';

type SidebarTab = 'watch' | 'trending' | 'new' | 'gainers' | 'losers' | 'volume';

export default function MarketSidebar() {
  const { setTradeToken, wallet } = useApp();
  const [tab, setTab] = useState<SidebarTab>('trending');
  const [discoveryTokens, setDiscoveryTokens] = useState<MarketToken[]>([]);
  const [fallbackTokens, setFallbackTokens] = useState<TokenData[]>([]);
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch discovery data
  useEffect(() => {
    const cat: DiscoveryCategory = tab === 'watch' ? 'trending' : tab as DiscoveryCategory;
    setLoading(true);
    getDiscovery(cat).then(data => {
      setDiscoveryTokens(data);
      setLoading(false);
    }).catch(() => {
      // Fallback to legacy trending
      getTrendingTokens().then(data => {
        setFallbackTokens(data);
        setLoading(false);
      }).catch(() => setLoading(false));
    });
  }, [tab]);

  // Load watchlist symbols
  useEffect(() => {
    if (!wallet.address) return;
    const load = async () => {
      try {
        const wl = gitlawb.db.collection<{ symbol: string }>('watchlist');
        const { records } = await wl.list({ limit: 100 });
        setWatchedSymbols(new Set(records.map(r => r.data.symbol)));
      } catch { /* ignore */ }
    };
    load();
  }, [wallet.address]);

  // Build display list
  const displayList = useMemo(() => {
    if (tab === 'watch') {
      // Filter discovery tokens by watched symbols
      if (discoveryTokens.length > 0) {
        return discoveryTokens.filter(t => watchedSymbols.has(t.symbol));
      }
      return fallbackTokens.filter(t => watchedSymbols.has(t.symbol));
    }
    if (discoveryTokens.length > 0) return discoveryTokens;
    // Fallback: sort legacy tokens by tab
    const list = [...fallbackTokens];
    switch (tab) {
      case 'volume': return list.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
      case 'gainers': return list.sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0));
      case 'losers': return list.sort((a, b) => (a.priceChange24h || 0) - (b.priceChange24h || 0));
      default: return list;
    }
  }, [discoveryTokens, fallbackTokens, tab, watchedSymbols]);

  const openToken = (chainId: ChainId, address: string, name: string, symbol: string) => {
    setTradeToken({ chainId, address, name, symbol });
  };

  const TABS: { id: SidebarTab; label: string }[] = [
    { id: 'watch', label: '★' },
    { id: 'trending', label: 'Hot' },
    { id: 'new', label: 'New' },
    { id: 'volume', label: 'Vol' },
    { id: 'gainers', label: '▲' },
    { id: 'losers', label: '▼' },
  ];

  return (
    <div className="trade-sidebar market-sidebar" style={{ minWidth: 0, overflow: 'hidden' }}>
      <div className="sidebar-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`sidebar-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', fontSize: 7, fontWeight: 700,
        letterSpacing: '0.12em', color: 'var(--text-dim)',
        borderBottom: '1px solid var(--border)',
        textTransform: 'uppercase',
      }}>
        <span style={{ minWidth: 44 }}>TOKEN</span>
        <span style={{ flex: 1, textAlign: 'right' }}>PRICE</span>
        <span style={{ minWidth: 48, textAlign: 'right' }}>24H</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div className="text-center text-dim p-4 loading" style={{ fontSize: 9, padding: 20 }}>
            SCANNING...
          </div>
        )}

        {tab === 'watch' && !wallet.address && (
          <div className="text-center text-dim" style={{ padding: 20, fontSize: 9 }}>
            CONNECT WALLET<br />TO VIEW WATCHLIST
          </div>
        )}

        {tab === 'watch' && wallet.address && displayList.length === 0 && !loading && (
          <div className="text-center text-dim" style={{ padding: 20, fontSize: 9 }}>
            NO WATCHLISTED TOKENS
          </div>
        )}

        {!loading && displayList.map((t, i) => {
          const chain = CHAINS[t.chainId as ChainId];
          if (!chain) return null;
          const change = 'priceChange24h' in t ? t.priceChange24h : null;
          const isUp = change != null && change >= 0;
          const isDiscovery = 'tradability' in t;
          return (
            <div key={`${t.chainId}-${t.address}-${i}`}
              className="sidebar-token-row"
              onClick={() => openToken(t.chainId, t.address, t.name, t.symbol)}>
              <ChainIcon chainId={t.chainId as ChainId} size={12} />
              <span style={{ fontSize: 7, color: chain.color, fontWeight: 700 }}>
                {chain.shortName}
              </span>
              <span className="token-sym">{t.symbol}</span>
              <span className="token-price">{formatUsd(t.price)}</span>
              <span className="token-change" style={{ color: isUp ? 'var(--green)' : 'var(--red)' }}>
                {formatPct(change)}
              </span>
              {isDiscovery && (
                <span style={{
                  fontSize: 6, fontWeight: 800, padding: '0 2px',
                  border: `1px solid ${(t as MarketToken).tradability === 'tradable' ? 'var(--green-dim, #0a0)' : 'var(--border)'}`,
                  color: (t as MarketToken).tradability === 'tradable' ? 'var(--green)' : 'var(--text-muted)',
                }}>
                  {(t as MarketToken).tradability === 'tradable' ? 'T' : 'D'}
                </span>
              )}
            </div>
          );
        })}

        {!loading && displayList.length === 0 && tab !== 'watch' && (
          <div className="text-center text-dim" style={{ padding: 20, fontSize: 9 }}>
            NO DATA AVAILABLE
          </div>
        )}
      </div>
    </div>
  );
}