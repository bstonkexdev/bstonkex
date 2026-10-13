// Cupcak8 Swap — Launchpad Content (embedded in unified Market page)
// Real token discovery with Cupcak8 sweet-meets-strong theme
import { useState, useMemo, useCallback, useEffect } from 'react';
import { CONFIGURED_CHAINS, type ChainId } from '../../lib/config';
import { LAUNCHPAD_REGISTRY, type Launchpad } from '../../lib/launchpads';
import { getDiscovery, type MarketToken, type DiscoveryCategory } from '../../lib/market-discovery';
import { useApp } from '../../lib/context';
import LaunchpadTable from '../launchpad/LaunchpadTable';
import LaunchpadTrenchesFeed from './LaunchpadTrenchesFeed';
import ChainIcon from '../ChainIcon';

type Category = 'all' | 'trending' | 'new' | 'gainers' | 'losers' | 'volume';

const CATEGORIES: { id: Category; label: string; icon?: string }[] = [
  { id: 'all', label: 'All Tokens' },
  { id: 'trending', label: 'Trending', icon: '🔥' },
  { id: 'new', label: 'New', icon: '✦' },
  { id: 'gainers', label: 'Gainers', icon: '↑' },
  { id: 'losers', label: 'Losers', icon: '↓' },
  { id: 'volume', label: 'Volume', icon: '◈' },
];

export default function LaunchpadContent() {
  const { setTradeToken } = useApp();
  const [category, setCategory] = useState<Category>('trending');
  const [selectedChain, setSelectedChain] = useState<ChainId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const cat: DiscoveryCategory = category === 'all' ? 'volume'
        : category === 'trending' ? 'trending'
        : category === 'new' ? 'new'
        : category === 'gainers' ? 'gainers'
        : category === 'losers' ? 'losers'
        : category === 'volume' ? 'volume'
        : 'volume';
      const data = await getDiscovery(cat);
      setTokens(data);
    } catch { /* keep previous */ }
    setLoading(false);
    setLastRefresh(Date.now());
  }, [category]);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  const allLaunchpads = useMemo(() => {
    const result: Launchpad[] = [];
    for (const chain of Object.values(LAUNCHPAD_REGISTRY)) {
      if (selectedChain !== 'all' && chain.chainId !== selectedChain) continue;
      result.push(...chain.launchpads);
    }
    return result;
  }, [selectedChain]);

  const filteredTokens = useMemo(() => {
    let result = tokens;
    if (selectedChain !== 'all') {
      result = result.filter(t => t.chainId === selectedChain);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tokens, selectedChain, search]);

  const sortedTokens = useMemo(() => {
    const sorted = [...filteredTokens];
    switch (category) {
      case 'gainers':
        sorted.sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0));
        break;
      case 'losers':
        sorted.sort((a, b) => (a.priceChange24h ?? 0) - (b.priceChange24h ?? 0));
        break;
      case 'new':
        sorted.sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0));
        break;
      case 'volume':
        sorted.sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
        break;
      case 'trending':
      default:
        sorted.sort((a, b) => {
          const scoreA = (a.volume24h ?? 0) * 0.4 + (a.liquidity ?? 0) * 0.3 + Math.abs(a.priceChange24h ?? 0) * 1000 * 0.3;
          const scoreB = (b.volume24h ?? 0) * 0.4 + (b.liquidity ?? 0) * 0.3 + Math.abs(b.priceChange24h ?? 0) * 1000 * 0.3;
          return scoreB - scoreA;
        });
    }
    return sorted;
  }, [filteredTokens, category]);

  const verifiedCount = allLaunchpads.filter(lp => lp.verified).length;
  const activeCount = allLaunchpads.filter(lp => lp.enabled).length;

  return (
    <>
      {/* Real-Time Launchpad Trenches Feed */}
      <LaunchpadTrenchesFeed />

      {/* Stats + Search + Filters */}
      <section style={{
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }}>
        {/* Stats bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--lime-dim)',
            background: 'var(--lime-bg)', padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          }}>
            {verifiedCount} Verified
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#E8547C',
            background: 'rgba(232,84,124,0.08)', padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          }}>
            {activeCount} Active
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-dim)',
            background: 'var(--bg-elevated)', padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          }}>
            {sortedTokens.length} Tokens
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            padding: '3px 8px',
          }}>
            Updated {new Date(lastRefresh).toLocaleTimeString()}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={fetchTokens} style={{
            padding: '5px 12px', fontSize: 10, fontWeight: 700,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', cursor: 'pointer',
            transition: 'border-color 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by token name, symbol, or address..."
            style={{
              width: '100%', padding: '8px 12px', fontSize: 12,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-bright)', outline: 'none',
              transition: 'border-color 0.12s', boxSizing: 'border-box',
            }}
            onFocus={e => e.currentTarget.style.borderColor = '#E8547C'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Chain filter */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => setSelectedChain('all')} style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 700,
            background: selectedChain === 'all' ? 'rgba(232,84,124,0.08)' : 'transparent',
            border: `1px solid ${selectedChain === 'all' ? '#E8547C' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: selectedChain === 'all' ? '#E8547C' : 'var(--text-dim)',
            transition: 'all 0.12s',
          }}>
            All Chains
          </button>
          {CONFIGURED_CHAINS.map(c => (
            <button key={c.id} onClick={() => setSelectedChain(c.id as ChainId)} style={{
              padding: '4px 10px', fontSize: 10, fontWeight: 700,
              background: selectedChain === c.id ? 'rgba(232,84,124,0.08)' : 'transparent',
              border: `1px solid ${selectedChain === c.id ? '#E8547C' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              color: selectedChain === c.id ? '#E8547C' : 'var(--text-dim)',
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all 0.12s',
            }}>
              <ChainIcon chainId={c.id as ChainId} size={10} />
              {c.shortName}
            </button>
          ))}
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => {
            const isActive = category === cat.id;
            return (
              <button key={cat.id} onClick={() => setCategory(cat.id)} style={{
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                background: isActive ? 'var(--yellow-bg)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--yellow)' : 'transparent'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                color: isActive ? 'var(--yellow-dim)' : 'var(--text-dim)',
                whiteSpace: 'nowrap', transition: 'all 0.12s',
              }}>
                {cat.icon && <span style={{ marginRight: 3 }}>{cat.icon}</span>}
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Launchpad registry summary */}
      <section style={{
        padding: '8px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
      }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'wrap' }}>
          {allLaunchpads.map(lp => (
            <div key={lp.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 7px', fontSize: 9, fontWeight: 700,
              border: `1px solid ${lp.verified ? 'var(--lime-dim)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: lp.verified ? 'var(--lime-bg)' : 'var(--bg-elevated)',
              color: lp.verified ? 'var(--lime-dim)' : 'var(--text-muted)',
              opacity: lp.enabled ? 1 : 0.5,
            }}>
              <ChainIcon chainId={lp.chainId} size={10} />
              {lp.shortName}
              {lp.verified && <span>✓</span>}
              {!lp.enabled && <span style={{ fontSize: 7 }}>⊘</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Token listing */}
      <section style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
        {loading && tokens.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading launchpad data...</div>
          </div>
        ) : (
          <LaunchpadTable
            tokens={sortedTokens}
            launchpads={allLaunchpads}
            loading={loading}
            onTrade={(t) => setTradeToken({
              chainId: t.chainId, address: t.address,
              name: t.name, symbol: t.symbol,
            })}
          />
        )}
      </section>
    </>
  );
}