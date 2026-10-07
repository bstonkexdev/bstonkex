import { useState, useEffect } from 'react';
import { formatUsd, formatNum } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';

interface Props {
  tokens: MarketToken[];
}

export default function MarketPulse({ tokens }: Props) {
  const totalBuys = tokens.reduce((s, t) => s + (t.buys24h ?? 0), 0);
  const totalSells = tokens.reduce((s, t) => s + (t.sells24h ?? 0), 0);
  const totalBuyVol = tokens.reduce((s, t) => s + (t.volume24h ?? 0) * ((t.buys24h ?? 0) / Math.max(1, (t.buys24h ?? 0) + (t.sells24h ?? 0))), 0);
  const totalSellVol = tokens.reduce((s, t) => s + (t.volume24h ?? 0) * ((t.sells24h ?? 0) / Math.max(1, (t.buys24h ?? 0) + (t.sells24h ?? 0))), 0);
  const totalVol = totalBuyVol + totalSellVol || 1;
  const buyPct = (totalBuyVol / totalVol) * 100;
  const sellPct = 100 - buyPct;
  const totalTxns = totalBuys + totalSells || 1;

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header"><span className="led led-cyan" /> MARKET PULSE</div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Buy/Sell Pressure */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 3 }}>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>BUY {buyPct.toFixed(1)}%</span>
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>SELL {sellPct.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', height: 8, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${buyPct}%`, background: 'var(--green)', transition: 'width 0.5s' }} />
            <div style={{ width: `${sellPct}%`, background: 'var(--red)', transition: 'width 0.5s' }} />
          </div>
        </div>
        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          <div className="stat-box" style={{ padding: 4 }}>
            <span className="stat-label" style={{ fontSize: 7 }}>BUY COUNT</span>
            <span className="stat-value" style={{ fontSize: 10, color: 'var(--green)' }}>{formatNum(totalBuys)}</span>
          </div>
          <div className="stat-box" style={{ padding: 4 }}>
            <span className="stat-label" style={{ fontSize: 7 }}>SELL COUNT</span>
            <span className="stat-value" style={{ fontSize: 10, color: 'var(--red)' }}>{formatNum(totalSells)}</span>
          </div>
          <div className="stat-box" style={{ padding: 4 }}>
            <span className="stat-label" style={{ fontSize: 7 }}>BUY VOL</span>
            <span className="stat-value" style={{ fontSize: 10 }}>{formatUsd(totalBuyVol)}</span>
          </div>
          <div className="stat-box" style={{ padding: 4 }}>
            <span className="stat-label" style={{ fontSize: 7 }}>SELL VOL</span>
            <span className="stat-value" style={{ fontSize: 10 }}>{formatUsd(totalSellVol)}</span>
          </div>
        </div>
        {/* Transaction total */}
        <div style={{ fontSize: 8, color: 'var(--text-dim)', textAlign: 'center' }}>
          {formatNum(totalTxns)} TRANSACTIONS · {formatUsd(totalVol)} TOTAL VOLUME
        </div>
      </div>
    </div>
  );
}