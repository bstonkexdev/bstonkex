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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Trading Stats */}
      <div className="panel" style={{ padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>
          TRADING PERFORMANCE
        </div>
        {perf && perf.totalTrades > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
            <div className="stat-box"><span className="stat-label">TOTAL TRADES</span><span className="stat-value">{perf.totalTrades}</span></div>
            <div className="stat-box"><span className="stat-label">BUYS</span><span className="stat-value" style={{ color: 'var(--green)' }}>{perf.buyCount}</span></div>
            <div className="stat-box"><span className="stat-label">SELLS</span><span className="stat-value" style={{ color: 'var(--red)' }}>{perf.sellCount}</span></div>
            <div className="stat-box"><span className="stat-label">WIN RATE</span><span className="stat-value">{perf.winRate != null ? formatPct(perf.winRate) : 'N/A'}</span></div>
            <div className="stat-box"><span className="stat-label">AVG TRADE</span><span className="stat-value">{formatUsd(perf.avgTradeValue)}</span></div>
            <div className="stat-box"><span className="stat-label">VOLUME</span><span className="stat-value">{formatUsd(perf.totalVolume)}</span></div>
            <div className="stat-box"><span className="stat-label">REALIZED P&L</span><span className="stat-value" style={{ color: perf.realizedPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatUsd(perf.realizedPnl)}</span></div>
            {perf.bestTrade && (
              <div className="stat-box"><span className="stat-label">BEST TRADE</span><span className="stat-value" style={{ color: 'var(--green)' }}>{perf.bestTrade.token} {formatUsd(perf.bestTrade.pnl)}</span></div>
            )}
            {perf.worstTrade && (
              <div className="stat-box"><span className="stat-label">WORST TRADE</span><span className="stat-value" style={{ color: 'var(--red)' }}>{perf.worstTrade.token} {formatUsd(perf.worstTrade.pnl)}</span></div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>
            NO TRADING DATA — Execute trades to see performance metrics
          </div>
        )}
      </div>

      {/* Fee Analytics */}
      <div className="panel" style={{ padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>FEES PAID</div>
        {fees && fees.totalFees > 0 ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="stat-box"><span className="stat-label">BSTONKEX FEES</span><span className="stat-value">{formatUsd(fees.bstonkexFees)}</span></div>
            <div className="stat-box"><span className="stat-label">DEX FEES</span><span className="stat-value">{fees.dexFees > 0 ? formatUsd(fees.dexFees) : 'NOT AVAILABLE'}</span></div>
            <div className="stat-box"><span className="stat-label">NETWORK FEES</span><span className="stat-value">{fees.networkFees > 0 ? formatUsd(fees.networkFees) : 'NOT AVAILABLE'}</span></div>
            <div className="stat-box"><span className="stat-label">TOTAL</span><span className="stat-value">{formatUsd(fees.totalFees)}</span></div>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 8 }}>NO FEE DATA</div>
        )}
      </div>

      {/* Referral Earnings */}
      <div className="panel" style={{ padding: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>REFERRAL EARNINGS</div>
        {refSummary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
            <div className="stat-box"><span className="stat-label">TIER</span><span className="stat-value" style={{ color: 'var(--cyan)' }}>{refSummary.tier}</span></div>
            <div className="stat-box"><span className="stat-label">30D VOLUME</span><span className="stat-value">{formatUsd(refSummary.rolling30dVolume)}</span></div>
            <div className="stat-box"><span className="stat-label">EARNINGS</span><span className="stat-value" style={{ color: 'var(--green)' }}>{formatUsd(refSummary.claimable)}</span></div>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--text-dim)', padding: 8 }}>Connect wallet to see referral stats</div>
        )}
      </div>
    </div>
  );
}