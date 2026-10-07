import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { getDiscovery, type MarketToken } from '../../lib/market-discovery';
import MarketCard from '../MarketCard';

export default function TrendingMarkets() {
  const { setPage } = useApp();
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDiscovery('trending').then(t => { setTokens(t.slice(0, 8)); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header">
        <span className="led led-green" />
        TRENDING MARKETS
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" style={{ fontSize: 7, padding: '1px 4px' }}
          onClick={() => setPage('markets')}>VIEW ALL</button>
      </div>
      {loading && (
        <div style={{ padding: 20, display: 'flex', gap: 8, overflowX: 'auto' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ minWidth: 140, height: 100 }} />
          ))}
        </div>
      )}
      {!loading && tokens.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>MARKET DATA UNAVAILABLE</div>
      )}
      {!loading && tokens.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: 8, overflowX: 'auto' }}>
          {tokens.map(t => (
            <div key={`${t.chainId}-${t.address}`} style={{ minWidth: 150, flex: '0 0 auto' }}>
              <MarketCard token={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}