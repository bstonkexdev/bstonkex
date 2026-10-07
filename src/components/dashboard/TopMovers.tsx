import { useState, useEffect } from 'react';
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { getDiscovery, type MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

export default function TopMovers() {
  const { setTradeToken } = useApp();
  const [gainers, setGainers] = useState<MarketToken[]>([]);
  const [losers, setLosers] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDiscovery('gainers'), getDiscovery('losers')])
      .then(([g, l]) => { setGainers(g.slice(0, 8)); setLosers(l.slice(0, 8)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const renderRow = (t: MarketToken, i: number) => {
    const chain = CHAINS[t.chainId];
    const isUp = (t.priceChange24h ?? 0) >= 0;
    return (
      <div key={`${t.chainId}-${t.address}-${i}`} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
        borderBottom: '1px solid rgba(22,40,72,0.3)', cursor: 'pointer', fontSize: 9,
      }}
        onClick={() => setTradeToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol })}>
        <span style={{ fontWeight: 800, color: 'var(--text-bright)', minWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.symbol}</span>
        <ChainIcon chainId={t.chainId as ChainId} size={10} />
        <span style={{ fontSize: 7, color: chain?.color, fontWeight: 700, minWidth: 24 }}>{chain?.shortName}</span>
        <span style={{ color: 'var(--text-dim)', minWidth: 50, textAlign: 'right' }}>{formatUsd(t.price)}</span>
        <span style={{ fontWeight: 700, minWidth: 50, textAlign: 'right', color: isUp ? 'var(--green)' : 'var(--red)' }}>{formatPct(t.priceChange24h)}</span>
        <span style={{ color: 'var(--text-dim)', minWidth: 50, textAlign: 'right', fontSize: 8 }}>{formatUsd(t.volume24h)}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {/* Gainers */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-header"><span className="led led-green" /> TOP GAINERS</div>
        {loading && <div style={{ padding: 12 }}><div className="skeleton-card" style={{ height: 120 }} /></div>}
        {!loading && gainers.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>NO DATA</div>}
        {gainers.map(renderRow)}
      </div>
      {/* Losers */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="panel-header"><span className="led led-red" /> TOP LOSERS</div>
        {loading && <div style={{ padding: 12 }}><div className="skeleton-card" style={{ height: 120 }} /></div>}
        {!loading && losers.length === 0 && <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>NO DATA</div>}
        {losers.map(renderRow)}
      </div>
    </div>
  );
}