// Cupcak8 Swap — Trading Performance Dashboard
import { useState, useEffect } from 'react';
import { formatUsd, formatPct } from '../../lib/config';
import { getTradingPerformance, getFeeAnalytics, type TradingPerformance as PerfType, type FeeAnalytics } from '../../lib/engine/portfolio-analytics';
import { getProfile, type ReferralProfile } from '../../lib/referral';

export default function TradingPerformance({ wallet }: { wallet: string | null }) {
  const [perf, setPerf] = useState<PerfType | null>(null);
  const [fees, setFees] = useState<FeeAnalytics | null>(null);
  const [refSummary, setRefSummary] = useState<ReferralProfile | null>(null);

  useEffect(() => {
    if (!wallet) return;
    getTradingPerformance(wallet).then(setPerf).catch(() => {});
    getFeeAnalytics(wallet).then(setFees).catch(() => {});
    getProfile(wallet).then(setRefSummary).catch(() => {});
  }, [wallet]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Trading Stats */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 14, background: 'var(--bg-surface)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-bright)',
          letterSpacing: '0.04em', marginBottom: 10,
        }}>Trading Performance</div>
        {perf && perf.totalTrades > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <PerfCard label="Total Trades" value={String(perf.totalTrades)} />
            <PerfCard label="Buys" value={String(perf.buyCount)} color="var(--lime-dim)" />
            <PerfCard label="Sells" value={String(perf.sellCount)} color="var(--red)" />
            <PerfCard label="Win Rate" value={perf.winRate != null ? formatPct(perf.winRate) : 'N/A'} />
            <PerfCard label="Avg Trade" value={formatUsd(perf.avgTradeValue)} />
            <PerfCard label="Volume" value={formatUsd(perf.totalVolume)} />
            <PerfCard label="Realized P&L"
              value={formatUsd(perf.realizedPnl)}
              color={perf.realizedPnl >= 0 ? 'var(--lime-dim)' : 'var(--red)'}
            />
            {perf.bestTrade && (
              <PerfCard label="Best Trade"
                value={`${perf.bestTrade.token} ${formatUsd(perf.bestTrade.pnl)}`}
                color="var(--lime-dim)"
              />
            )}
            {perf.worstTrade && (
              <PerfCard label="Worst Trade"
                value={`${perf.worstTrade.token} ${formatUsd(perf.worstTrade.pnl)}`}
                color="var(--red)"
              />
            )}
          </div>
        ) : (
          <div style={{
            padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-dim)',
          }}>
            No trading data yet — execute trades to see performance metrics.
          </div>
        )}
      </div>

      {/* Fee Analytics */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 14, background: 'var(--bg-surface)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-bright)',
          letterSpacing: '0.04em', marginBottom: 10,
        }}>Fees Paid</div>
        {fees && fees.totalFees > 0 ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PerfCard label="Cupcak8 Swap Fees" value={formatUsd(fees.cupcak8Fees)} />
            <PerfCard label="DEX Fees" value={fees.dexFees > 0 ? formatUsd(fees.dexFees) : '—'} />
            <PerfCard label="Network Fees" value={fees.networkFees > 0 ? formatUsd(fees.networkFees) : '—'} />
            <PerfCard label="Total Fees" value={formatUsd(fees.totalFees)} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 10 }}>No fee data available.</div>
        )}
      </div>

      {/* Referral Earnings */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 14, background: 'var(--bg-surface)',
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-bright)',
          letterSpacing: '0.04em', marginBottom: 10,
        }}>Referral Earnings</div>
        {refSummary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <PerfCard label="Tier" value={refSummary.currentTier.name} color="var(--cyan)" />
            <PerfCard label="30D Volume" value={formatUsd(refSummary.rollingVolume30d)} />
            <PerfCard label="Earnings" value={formatUsd(refSummary.claimableRewards)} color="var(--lime-dim)" />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 10 }}>
            Connect wallet to view referral stats.
          </div>
        )}
      </div>
    </div>
  );
}

function PerfCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
      padding: '8px 10px', background: 'var(--bg-elevated)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: 'var(--text-muted)',
        marginBottom: 3, letterSpacing: '0.04em',
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)',
        color: color || 'var(--text-bright)',
      }}>{value}</div>
    </div>
  );
}