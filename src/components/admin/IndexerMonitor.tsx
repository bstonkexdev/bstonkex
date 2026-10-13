// Cupcak8 Swap Admin — Indexer Monitor Panel (Ivory theme)
import { useState, useEffect, useCallback } from 'react';
import type { ChainHealth, IndexerHealthStatus } from '../../lib/engine/indexer/indexer-health';
import { getFlags, setMarketDataSource, type MarketDataSource } from '../../lib/engine/indexer/feature-flags';

export function IndexerMonitor() {
  const [health, setHealth] = useState<IndexerHealthStatus | null>(null);
  const [source, setSource] = useState<MarketDataSource>(getFlags().marketDataSource);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/health/indexer');
      if (res.ok) setHealth(await res.json());
    } catch { /* indexer not available */ }
  }, []);

  useEffect(() => { loadHealth(); const t = setInterval(loadHealth, 10000); return () => clearInterval(t); }, [loadHealth]);

  const handleSourceChange = (s: MarketDataSource) => { setSource(s); setMarketDataSource(s); };

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span>INDEXER STATUS</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 7, color: 'var(--text-dim)' }}>SOURCE:</span>
          {(['dexscreener', 'indexer', 'hybrid'] as MarketDataSource[]).map(s => (
            <button key={s} onClick={() => handleSourceChange(s)}
              className={`btn btn-sm ${source === s ? 'btn-accent' : 'btn-outline'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {!health ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="title">INDEXER OFFLINE</div>
          <div className="desc">Configure and enable indexer to begin blockchain indexing.</div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8, padding: '6px 0', fontSize: 8, color: statusColor(health.overallStatus), fontFamily: 'var(--font-pixel)' }}>
            OVERALL: {health.overallStatus} | UPTIME: {formatUptime(health.uptime)} | SOURCE: {health.marketDataSource.toUpperCase()}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CHAIN</th><th>RPC</th><th style={{ textAlign: 'right' }}>CHAIN BLK</th>
                  <th style={{ textAlign: 'right' }}>INDEXED</th><th style={{ textAlign: 'right' }}>LAG</th>
                  <th style={{ textAlign: 'right' }}>EVT/MIN</th><th style={{ textAlign: 'right' }}>ERRORS</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {health.chains.map(ch => (
                  <tr key={ch.chain}>
                    <td style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{ch.chain.toUpperCase()}</td>
                    <td style={{ color: ch.rpcStatus === 'UP' ? 'var(--green)' : 'var(--red)' }}>
                      {ch.rpcStatus} {ch.rpcLatencyMs > 0 ? `(${ch.rpcLatencyMs}ms)` : ''}
                    </td>
                    <td className="td-price" style={{ textAlign: 'right' }}>{ch.latestChainBlock.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{ch.latestIndexedBlock.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: ch.lag > 10 ? 'var(--red)' : ch.lag > 3 ? 'var(--amber)' : 'var(--green)', fontWeight: 700 }}>{ch.lag}</td>
                    <td style={{ textAlign: 'right' }}>{ch.eventsPerMinute}</td>
                    <td style={{ textAlign: 'right', color: ch.errors > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{ch.errors}</td>
                    <td><span className={`status status-${ch.status === 'LIVE' ? 'live' : ch.status === 'CATCHING_UP' ? 'indexing' : ch.status === 'ERROR' ? 'error' : 'offline'}`}>{ch.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function statusColor(status: string): string {
  if (status === 'LIVE' || status === 'UP') return 'var(--green)';
  if (status === 'CATCHING_UP' || status === 'DEGRADED') return 'var(--amber)';
  if (status === 'ERROR' || status === 'DOWN') return 'var(--red)';
  if (status === 'OFF' || status === 'STOPPED') return 'var(--text-muted)';
  return 'var(--text-dim)';
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}