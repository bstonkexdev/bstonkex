import { useState, useEffect } from 'react';
import { CHAINS, CONFIGURED_CHAINS, formatUsd, formatPct, shortenAddress, explorerAddressUrl } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { WalletBalance } from '../../lib/engine/types';
import { getTokenAllocation, getChainAllocation } from '../../lib/engine/portfolio-analytics';
import { getSnapshots, snapshotsToChartData, type PortfolioSnapshot } from '../../lib/engine/portfolio-snapshots';
import type { WalletState } from '../../lib/wallet';
import ChainIcon from '../ChainIcon';

interface Props {
  wallet: WalletState;
  allPortfolios: WalletBalance[];
  totalUsd: number;
  pnlSummary: { totalRealized: number; totalUnrealized: number; totalPnl: number; totalCostBasis: number; totalCurrentValue: number } | null;
  onSetActiveChain: (c: ChainId) => void;
}

export default function PortfolioOverview({ wallet, allPortfolios, totalUsd, pnlSummary, onSetActiveChain }: Props) {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [chartRange, setChartRange] = useState<'1D' | '7D' | '30D' | 'ALL'>('ALL');
  const [showChart, setShowChart] = useState(false);

  useEffect(() => {
    if (!wallet.address) return;
    getSnapshots(wallet.address, 200).then(s => { setSnapshots(s); setShowChart(true); });
  }, [wallet.address]);

  const tokenAlloc = getTokenAllocation(allPortfolios);
  const chainAlloc = getChainAllocation(allPortfolios);
  const chartData = snapshotsToChartData(snapshots);

  const now = Date.now();
  const rangeMs = chartRange === '1D' ? 86400000 : chartRange === '7D' ? 604800000 : chartRange === '30D' ? 2592000000 : Infinity;
  const filteredChart = chartData.filter(d => d.time > now - rangeMs);

  const totalChange24h = pnlSummary?.totalUnrealized ?? 0;
  const totalChange24hPct = pnlSummary?.totalCostBasis ? (totalChange24h / pnlSummary.totalCostBasis) * 100 : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Wallet info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9 }}>
        <span className="led-sm led-green led-blink" />
        <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{shortenAddress(wallet.address || '', 6)}</span>
        <button className="copy-btn" style={{ fontSize: 7 }} onClick={() => navigator.clipboard.writeText(wallet.address || '')}>COPY</button>
        <a href={explorerAddressUrl('bsc', wallet.address || '')} target="_blank" rel="noopener" style={{ fontSize: 7, color: 'var(--cyan)' }}>EXPLORER ↗</a>
        <span style={{ color: 'var(--text-dim)', marginLeft: 4 }}>{wallet.provider?.toUpperCase()} WALLET</span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <div className="stat-box">
          <span className="stat-label">TOTAL VALUE</span>
          <span className="stat-value" style={{ fontSize: 18 }}>{formatUsd(totalUsd)}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">UNREALIZED P&L</span>
          <span className="stat-value" style={{ color: (pnlSummary?.totalUnrealized ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {pnlSummary ? formatUsd(pnlSummary.totalUnrealized) : '—'}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">REALIZED P&L</span>
          <span className="stat-value" style={{ color: (pnlSummary?.totalRealized ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {pnlSummary ? formatUsd(pnlSummary.totalRealized) : '—'}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">TOTAL P&L</span>
          <span className="stat-value" style={{ color: (pnlSummary?.totalPnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {pnlSummary ? formatUsd(pnlSummary.totalPnl) : '—'}
          </span>
        </div>
      </div>

      {/* Portfolio chart area */}
      {showChart && filteredChart.length > 2 && (
        <div className="panel" style={{ padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>PORTFOLIO VALUE</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['1D', '7D', '30D', 'ALL'] as const).map(r => (
                <button key={r} className={`btn btn-sm ${chartRange === r ? 'btn-cyan' : ''}`}
                  style={{ fontSize: 7, padding: '1px 4px' }} onClick={() => setChartRange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <MiniChart data={filteredChart.map(d => d.value)} />
        </div>
      )}

      {showChart && filteredChart.length <= 2 && (
        <div className="panel" style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
          PORTFOLIO HISTORY WILL APPEAR AS DATA IS COLLECTED
        </div>
      )}

      {/* Chain allocation */}
      {chainAlloc.length > 0 && (
        <div className="panel" style={{ padding: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            CHAIN ALLOCATION
          </span>
          {chainAlloc.map((c, i) => {
            const chain = CHAINS[c.label as ChainId];
            return (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', cursor: 'pointer' }}
                onClick={() => onSetActiveChain(c.label as ChainId)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <ChainIcon chainId={(c.label as ChainId) || 'bsc'} size={12} />
                  <span className="badge" style={{ borderColor: chain?.color, color: chain?.color, fontSize: 7, minWidth: 36, textAlign: 'center' }}>
                    {chain?.shortName || c.label}
                  </span>
                </span>
                <div style={{ flex: 1, height: 6, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, c.pct)}%`, height: '100%', background: chain?.color || 'var(--cyan)' }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{formatUsd(c.valueUsd)}</span>
                <span style={{ fontSize: 8, color: 'var(--text-dim)', minWidth: 36, textAlign: 'right' }}>{c.pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Token allocation */}
      {tokenAlloc.length > 0 && (
        <div className="panel" style={{ padding: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
            TOKEN ALLOCATION
          </span>
          {tokenAlloc.slice(0, 10).map((t, i) => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
              <span style={{ fontSize: 9, fontWeight: 700, minWidth: 40, color: 'var(--text-bright)' }}>{t.label}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, t.pct)}%`, height: '100%', background: `hsl(${(i * 47) % 360}, 60%, 50%)` }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{formatUsd(t.valueUsd)}</span>
              <span style={{ fontSize: 8, color: 'var(--text-dim)', minWidth: 36, textAlign: 'right' }}>{t.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sparkline-style mini chart using CSS. */
function MiniChart({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 48;
  const w = '100%';
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? 'var(--green)' : 'var(--red)';
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = h - ((v - min) / range) * (h - 4);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon points={`0,${h} ${points} 100,${h}`} fill="url(#chartGrad)" />
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}