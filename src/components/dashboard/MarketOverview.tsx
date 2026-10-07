import { useState, useEffect } from 'react';
import { CHAINS, CONFIGURED_CHAINS, formatUsd, formatNum } from '../../lib/config';
import { getAllChainReadiness, type ChainReadiness } from '../../lib/engine/chain-readiness';
import { getSystemHealth } from '../../lib/engine/system-health';
import type { HealthStatus } from '../../lib/engine/types';
import type { MarketToken } from '../../lib/market-discovery';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
}

export default function MarketOverview({ tokens }: Props) {
  const [readiness, setReadiness] = useState<ChainReadiness[]>([]);
  const [health, setHealth] = useState<HealthStatus[]>([]);

  useEffect(() => {
    getAllChainReadiness().then(setReadiness).catch(() => {});
    getSystemHealth().then(setHealth).catch(() => {});
    const iv = setInterval(() => {
      getAllChainReadiness().then(setReadiness).catch(() => {});
      getSystemHealth().then(setHealth).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const totalVolume = tokens.reduce((s, t) => s + (t.volume24h ?? 0), 0);
  const activeMarkets = tokens.filter(t => t.price != null).length;
  const newMarkets = tokens.filter(t => t.ageMs > 0 && t.ageMs < 86400000).length;

  const statusFor = (name: string): 'online' | 'degraded' | 'offline' => {
    const h = health.find(s => s.service.includes(name));
    return h?.status || 'offline';
  };

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
        {/* Stat cards */}
        <div className="overview-stat">
          <span className="overview-stat-label">24H VOLUME</span>
          <span className="overview-stat-value">{formatUsd(totalVolume)}</span>
        </div>
        <div className="overview-stat">
          <span className="overview-stat-label">ACTIVE MARKETS</span>
          <span className="overview-stat-value">{formatNum(activeMarkets)}</span>
        </div>
        <div className="overview-stat">
          <span className="overview-stat-label">NEW MARKETS</span>
          <span className="overview-stat-value">{newMarkets}</span>
        </div>
        <div className="overview-stat">
          <span className="overview-stat-label">TOKENS TRACKED</span>
          <span className="overview-stat-value">{tokens.length}</span>
        </div>
        {/* Chain status */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', flexWrap: 'wrap' }}>
          {CONFIGURED_CHAINS.map(c => {
            const r = readiness.find(rd => rd.chainId === c.id);
            const apiStatus = statusFor(c.dexScreenerId);
            const isOnline = r?.mode === 'trading_enabled' || apiStatus === 'online';
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: isOnline ? 'var(--green)' : apiStatus === 'degraded' ? 'var(--amber)' : 'var(--red)',
                }} />
                <ChainIcon chainId={c.id as ChainId} size={10} /><span style={{ color: c.color, fontWeight: 700 }}>{c.shortName}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 7 }}>{isOnline ? 'LIVE' : apiStatus === 'degraded' ? 'DELAYED' : 'OFF'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}