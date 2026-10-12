// Cupcak8 Swap — Portfolio Overview (chain breakdown + allocation + chart)
import { useState, useEffect } from 'react';
import { CHAINS, formatUsd } from '../../lib/config';
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
  viewChain: ChainId | 'all';
  chainValues: { chainId: string; value: number; label: string }[];
}

export default function PortfolioOverview({ wallet, allPortfolios, totalUsd, pnlSummary, onSetActiveChain, viewChain, chainValues }: Props) {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [chartRange, setChartRange] = useState<'1D' | '7D' | '30D' | 'ALL'>('ALL');

  useEffect(() => {
    if (!wallet.address) return;
    getSnapshots(wallet.address, 200).then(setSnapshots).catch(() => {});
  }, [wallet.address]);

  const tokenAlloc = getTokenAllocation(allPortfolios);
  const chainAlloc = getChainAllocation(allPortfolios);
  const chartData = snapshotsToChartData(snapshots);

  const now = Date.now();
  const rangeMs = chartRange === '1D' ? 86400000 : chartRange === '7D' ? 604800000 : chartRange === '30D' ? 2592000000 : Infinity;
  const filteredChart = chartData.filter(d => d.time > now - rangeMs);

  const visiblePortfolios = viewChain === 'all'
    ? allPortfolios
    : allPortfolios.filter(c => c.chainId === viewChain);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* P&L Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <PnlCard label="Unrealized P&L" value={pnlSummary?.totalUnrealized ?? null} />
        <PnlCard label="Realized P&L" value={pnlSummary?.totalRealized ?? null} />
        <PnlCard label="Total P&L" value={pnlSummary?.totalPnl ?? null} />
        <PnlCard label="Cost Basis" value={pnlSummary?.totalCostBasis ?? null} neutral />
      </div>

      {/* Portfolio Chart */}
      {filteredChart.length > 2 ? (
        <div style={{
          padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg-surface)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
              Portfolio Value
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['1D', '7D', '30D', 'ALL'] as const).map(r => (
                <button key={r} onClick={() => setChartRange(r)} style={{
                  padding: '3px 8px', fontSize: 9, fontWeight: 700,
                  background: chartRange === r ? 'var(--yellow-bg)' : 'var(--bg-elevated)',
                  border: `1px solid ${chartRange === r ? 'var(--yellow)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  color: chartRange === r ? 'var(--yellow-dim)' : 'var(--text-muted)',
                  transition: 'all 0.12s',
                }}>{r}</button>
              ))}
            </div>
          </div>
          <MiniChart data={filteredChart.map(d => d.value)} />
        </div>
      ) : (
        <div style={{
          padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-surface)',
        }}>
          Historical data unavailable — portfolio history will appear as data is collected.
        </div>
      )}

      {/* Chain Breakdown */}
      {chainAlloc.length > 0 && (
        <div style={{
          padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg-surface)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Chain Breakdown
          </span>
          {chainAlloc.map(c => {
            const chain = CHAINS[c.label as ChainId];
            return (
              <div key={c.label}
                onClick={() => onSetActiveChain(c.label as ChainId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  cursor: 'pointer', transition: 'opacity 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <ChainIcon chainId={(c.label as ChainId) || 'bsc'} size={14} />
                <span style={{ fontSize: 11, fontWeight: 700, color: chain?.color || 'var(--text)', minWidth: 40 }}>
                  {chain?.shortName || c.label}
                </span>
                <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, c.pct)}%`, height: '100%',
                    background: chain?.color || 'var(--yellow)', borderRadius: 3,
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 50, textAlign: 'right' }}>
                  {formatUsd(c.valueUsd)}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                  {c.pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Token Allocation */}
      {tokenAlloc.length > 0 && (
        <div style={{
          padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg-surface)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Token Allocation
          </span>
          {tokenAlloc.slice(0, 10).map((t, i) => (
            <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{ fontSize: 11, fontWeight: 700, minWidth: 40, color: 'var(--text)' }}>{t.label}</span>
              <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, t.pct)}%`, height: '100%',
                  background: `hsl(${(i * 47) % 360}, 55%, 50%)`, borderRadius: 3,
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 50, textAlign: 'right' }}>
                {formatUsd(t.valueUsd)}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                {t.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PnlCard({ label, value, neutral }: { label: string; value: number | null; neutral?: boolean }) {
  const isUp = (value ?? 0) >= 0;
  const color = neutral ? 'var(--text-bright)' : isUp ? 'var(--lime-dim)' : 'var(--red)';
  return (
    <div style={{
      padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      background: 'var(--bg-surface)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color }}>
        {value != null ? formatUsd(value) : '—'}
      </div>
    </div>
  );
}

function MiniChart({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const h = 56;
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? '#4ADE80' : '#EF5350';
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = h - ((v - min) / range) * (h - 4);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={h} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pfChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} 100,${h}`} fill="url(#pfChartGrad)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}