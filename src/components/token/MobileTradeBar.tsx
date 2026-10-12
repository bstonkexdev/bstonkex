// Cupcak8 Swap — Persistent mobile BUY/SELL bar (safe-area aware).
// Opens the existing execution panel — never executes a trade on tap.
import { useState } from 'react';
import { PLATFORM_FEE_BPS, formatUsd } from '../../lib/config';

interface Props {
  symbol: string;
  price: number | null;
  canTrade: boolean;
  disabledReason: string | null;
  onBuy: () => void;
  onSell: () => void;
}

export default function MobileTradeBar({ symbol, price, canTrade, disabledReason, onBuy, onSell }: Props) {
  const [feesOpen, setFeesOpen] = useState(false);
  const feePct = (PLATFORM_FEE_BPS / 100).toFixed(2); // 40 bps → "0.40"

  const btn = (side: 'buy' | 'sell'): React.CSSProperties => ({
    flex: 1, minHeight: 52, fontSize: 14, fontWeight: 900, letterSpacing: '0.08em',
    border: `2px solid ${side === 'buy' ? 'var(--green)' : 'var(--red)'}`,
    background: side === 'buy' ? 'var(--green-bg-strong)' : 'var(--red-bg-strong)',
    color: side === 'buy' ? 'var(--green)' : 'var(--red)',
    cursor: canTrade ? 'pointer' : 'not-allowed',
    opacity: canTrade ? 1 : 0.45,
    borderRadius: 4,
    fontFamily: 'var(--font)',
    transition: 'background 0.12s, border-color 0.12s',
  });

  return (
    <div className="mobile-trade-bar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-bright)', fontFamily: 'var(--font)' }}>{symbol}</span>
          <span style={{ fontSize: 10, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{price != null ? formatUsd(price) : 'N/A'}</span>
        </div>
        <button
          className="mtb-fee-chip"
          onClick={() => setFeesOpen(v => !v)}
          title="Show fee breakdown"
        >
          FEE {feePct}% ▲
        </button>
      </div>

      <button style={btn('buy')} disabled={!canTrade} onClick={onBuy}>BUY</button>
      <button style={btn('sell')} disabled={!canTrade} onClick={onSell}>SELL</button>

      {feesOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 160 }} onClick={() => setFeesOpen(false)} />
          <div style={{
            position: 'absolute', left: 8, right: 8, bottom: '100%', marginBottom: 6, zIndex: 170,
            background: 'var(--bg-panel)', border: '1px solid var(--border)', padding: 10,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-bright)', marginBottom: 6, letterSpacing: '0.06em' }}>
              CUPCAK8 SWAP FEE BREAKDOWN
            </div>
            <div className="info-row"><span className="info-label">PLATFORM FEE</span><span className="info-value">{feePct}% ({PLATFORM_FEE_BPS} BPS)</span></div>
            <div className="info-row"><span className="info-label">DEX FEE</span><span className="info-value">PER ROUTE, IN QUOTE</span></div>
            <div className="info-row"><span className="info-label">NETWORK FEE</span><span className="info-value">EST. IN QUOTE</span></div>
            <div className="info-row"><span className="info-label">SLIPPAGE</span><span className="info-value">SET IN EXECUTION PANEL</span></div>
            <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              Final fees are shown with a real quote in the execution panel and require
              explicit confirmation before anything is submitted.
            </div>
          </div>
        </>
      )}

      {!canTrade && disabledReason && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 2,
          padding: '3px 10px', fontSize: 7, fontWeight: 800, textAlign: 'center',
          color: 'var(--amber, #FFD700)', background: 'var(--yellow-bg)',
          borderTop: '1px solid var(--border)',
        }}>
          {disabledReason}
        </div>
      )}
    </div>
  );
}
