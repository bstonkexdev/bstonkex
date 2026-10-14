// Cupcak8 Swap — Ave.ai-style Bottom Quick-Buy / Quick-Sell Execution Bar
// Full-width green BUY / red SELL with 1-click swap drawer integration
import type { ChainId } from '../../lib/config';

interface Props {
  chainId: ChainId;
  symbol: string;
  /** Platform fee in BPS */
  feeBps: number;
  onBuy: () => void;
  onSell: () => void;
  /** Whether to show the fee label */
  showFee?: boolean;
  disabled?: boolean;
}

export default function AveQuickBar({ symbol, feeBps, onBuy, onSell, showFee = true, disabled }: Props) {
  const feePct = (feeBps / 100).toFixed(1);

  const btnBase: React.CSSProperties = {
    flex: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '12px 0',
    border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 800, fontFamily: 'var(--font)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
    letterSpacing: '-0.01em',
  };

  return (
    <div style={{
      display: 'flex', gap: 8, padding: '10px 12px',
      background: 'var(--bg-elevated, #0F172A)',
      borderTop: '1px solid var(--border, #1E293B)',
    }}>
      {/* Left quick action icons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center', flexShrink: 0 }}>
        <button style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)',
        }} title="Open in DApp">🌐</button>
        <button style={{
          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-dim)',
        }} title="Perps / Leverage">⚡</button>
      </div>

      {/* BUY button */}
      <button
        onClick={disabled ? undefined : onBuy}
        style={{
          ...btnBase,
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
        }}
        onMouseOver={e => { if (!disabled) e.currentTarget.style.transform = 'scale(1.02)'; }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={{ fontSize: 15, fontWeight: 900 }}>Buy</span>
        {showFee && <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 600 }}>(Fee {feePct}%)</span>}
      </button>

      {/* SELL button */}
      <button
        onClick={disabled ? undefined : onSell}
        style={{
          ...btnBase,
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(239,68,68,0.25)',
        }}
        onMouseOver={e => { if (!disabled) e.currentTarget.style.transform = 'scale(1.02)'; }}
        onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span style={{ fontSize: 15, fontWeight: 900 }}>Sell</span>
        {showFee && <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 600 }}>(Fee {feePct}%)</span>}
      </button>
    </div>
  );
}