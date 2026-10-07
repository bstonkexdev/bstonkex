import { useState, useEffect } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, CONFIGURED_CHAINS, formatUsd, shortenAddress, explorerTxUrl, PLATFORM_FEE_PCT } from '../lib/config';
import type { ChainId } from '../lib/config';
import { getFeeHistory, getFeeAnalytics, type FeeRecord, type FeeAnalytics } from '../lib/engine/fee-engine';
import ChainValidationPanel from './ChainValidationPanel';
import ChainIcon from './ChainIcon';
import ReadinessDashboard from './ReadinessDashboard';

export default function FeeDashboard() {
  const { wallet, connect } = useApp();
  const [history, setHistory] = useState<FeeRecord[]>([]);
  const [analytics, setAnalytics] = useState<FeeAnalytics | null>(null);
  const [chainFilter, setChainFilter] = useState<ChainId | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getFeeHistory(), getFeeAnalytics()])
      .then(([h, a]) => { setHistory(h); setAnalytics(a); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = chainFilter === 'all' ? history : history.filter(r => r.chainId === chainFilter);

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-bright)', letterSpacing: '0.1em' }}>FEE DASHBOARD</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>PLATFORM FEE: {(PLATFORM_FEE_PCT * 100).toFixed(2)}%</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {/* Fee explanation */}
        <div className="panel" style={{ marginBottom: 10 }}>
          <div className="panel-header"><span className="led" /> BSTONKEX PLATFORM FEE</div>
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--cyan)', marginBottom: 6 }}>
              {(PLATFORM_FEE_PCT * 100).toFixed(2)}%
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7 }}>
              BSTONKEX charges {(PLATFORM_FEE_PCT * 100).toFixed(2)}% on each trade. This is separate from DEX fees, network fees, and price impact.
              A portion is allocated to referral rewards; the remainder supports BSTONKEX infrastructure.
            </div>
          </div>
        </div>

        {/* Analytics */}
        {analytics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
            <div className="stat-box"><span className="stat-label">TODAY</span><span className="stat-value">{formatUsd(analytics.todayFees)}</span></div>
            <div className="stat-box"><span className="stat-label">7 DAYS</span><span className="stat-value">{formatUsd(analytics.weekFees)}</span></div>
            <div className="stat-box"><span className="stat-label">30 DAYS</span><span className="stat-value">{formatUsd(analytics.monthFees)}</span></div>
            <div className="stat-box"><span className="stat-label">ALL TIME</span><span className="stat-value">{formatUsd(analytics.allTimeFees)}</span></div>
            <div className="stat-box"><span className="stat-label">VOLUME</span><span className="stat-value">{formatUsd(analytics.allTimeVolume)}</span></div>
            <div className="stat-box"><span className="stat-label">TRADES</span><span className="stat-value">{analytics.tradeCount}</span></div>
            <div className="stat-box"><span className="stat-label">AVG FEE</span><span className="stat-value">{formatUsd(analytics.avgFee)}</span></div>
          </div>
        )}

        {/* Chain filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button className={`btn btn-sm ${chainFilter === 'all' ? 'btn-cyan' : ''}`}
            style={{ fontSize: 7, padding: '2px 5px' }} onClick={() => setChainFilter('all')}>ALL</button>
          {CONFIGURED_CHAINS.map(c => (
            <button key={c.id} className={`btn btn-sm ${chainFilter === c.id ? 'btn-cyan' : ''}`}
              style={{ fontSize: 7, padding: '2px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }} onClick={() => setChainFilter(c.id)}><ChainIcon chainId={c.id} size={10} />{c.shortName}</button>
          ))}
        </div>

        {/* Fee history */}
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-header"><span className="led" /> MY FEES ({filtered.length})</div>
          {loading && <div style={{ padding: 12, fontSize: 9, color: 'var(--text-dim)', textAlign: 'center' }}>LOADING...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
              NO TRADING FEES RECORDED<br />
              <span style={{ fontSize: 7 }}>Fees are recorded after confirmed trades</span>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>DATE</th><th>TRADE</th><th>CHAIN</th><th className="right">VALUE</th><th className="right">BSTONKEX</th><th className="right">DEX</th><th className="right">NETWORK</th><th>TX</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 100).map((r, i) => {
                    const chain = CHAINS[r.chainId as ChainId];
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: 9 }}>{new Date(r.date).toLocaleDateString()}</td>
                        <td style={{ fontSize: 9 }}>{shortenAddress(r.tradeId, 4)}</td>
                        <td style={{ fontSize: 8, color: chain?.color || 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 3 }}><ChainIcon chainId={(r.chainId || 'bsc') as ChainId} size={10} />{chain?.shortName || r.chainId || '—'}</td>
                        <td className="right" style={{ fontSize: 9 }}>{formatUsd(r.tradeValueUsd)}</td>
                        <td className="right" style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)' }}>{formatUsd(r.platformFeeUsd)}</td>
                        <td className="right" style={{ fontSize: 9 }}>{formatUsd(r.dexFeeUsd)}</td>
                        <td className="right" style={{ fontSize: 9 }}>{formatUsd(r.networkFeeUsd)}</td>
                        <td>
                          {r.txHash ? (
                            <a href={explorerTxUrl(r.chainId as ChainId, r.txHash)} target="_blank" rel="noopener"
                              style={{ fontSize: 7, color: 'var(--cyan)' }}>↗</a>
                          ) : <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Chain Validation */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <ChainValidationPanel />
      </div>

      {/* Production Readiness Audit */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <ReadinessDashboard />
      </div>
    </div>
  );
}