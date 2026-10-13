// Cupcak8 Swap — Trenches Quick Buy Modal
// 1-click buy with dual-router display, priority fee, and anti-MEV controls.

import type { TrenchesToken } from '../../lib/engine/trenches-types';
import { formatMcap } from '../../lib/engine/trenches-types';
import { getSwapRoute, describeRoute, getRouteBadgeColor, getAntiMevConfig, PRIORITY_FEE_PRESETS } from '../../lib/engine/dual-router';

interface Props {
  token: TrenchesToken;
  amount: string;
  slippage: number;
  priorityLevel: 'low' | 'medium' | 'high' | 'max';
  onAmountChange: (v: string) => void;
  onSlippageChange: (v: number) => void;
  onPriorityChange: (v: 'low' | 'medium' | 'high' | 'max') => void;
  onClose: () => void;
}

export default function TrenchesQuickBuy({
  token, amount, slippage, priorityLevel,
  onAmountChange, onSlippageChange, onPriorityChange, onClose,
}: Props) {
  const amountNum = parseFloat(amount) || 0;
  const route = getSwapRoute(token, 'buy', amountNum, slippage, priorityLevel);
  const antiMev = getAntiMevConfig(route);
  const progress = Math.min(100, token.bondingCurveProgress);
  const phaseColor = token.phase === 'graduated' ? '#3B82F6' : token.phase === 'migrating' ? '#EAB308' : '#22C55E';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 380, maxWidth: '90vw', borderRadius: 16,
        background: 'var(--bg-elevated, #0F172A)',
        border: '1px solid var(--border, #1E293B)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border, #1E293B)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #F8FAFC)' }}>
              Buy {token.symbol}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim, #64748B)', fontFamily: 'monospace' }}>
              {token.address.slice(0, 8)}...{token.address.slice(-6)}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-dim, #64748B)',
            fontSize: 20, cursor: 'pointer',
          }}>×</button>
        </div>

        {/* Token Info */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
          padding: '12px 20px', borderBottom: '1px solid var(--border, #1E293B)',
        }}>
          <div>
            <div style={{ fontSize: 8, color: 'var(--text-dim, #64748B)', textTransform: 'uppercase' }}>Price</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #F8FAFC)', fontFamily: 'monospace' }}>
              ${token.spotPriceUsd.toExponential(2)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'var(--text-dim, #64748B)', textTransform: 'uppercase' }}>MCap</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #F8FAFC)' }}>
              {formatMcap(token.virtualMcapUsd)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'var(--text-dim, #64748B)', textTransform: 'uppercase' }}>Curve</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: phaseColor }}>
              {progress.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Amount Input */}
        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim, #64748B)', marginBottom: 6, fontWeight: 600 }}>
            Amount ({token.chainId === 'solana' ? 'SOL' : token.chainId === 'bsc' ? 'BNB' : 'ETH'})
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              value={amount}
              onChange={e => onAmountChange(e.target.value)}
              placeholder="0.1"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border, #1E293B)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text, #F8FAFC)', fontSize: 16, fontWeight: 700,
                outline: 'none', fontFamily: 'monospace',
              }}
            />
            {['0.1', '0.5', '1', '5'].map(v => (
              <button
                key={v}
                onClick={() => onAmountChange(v)}
                style={{
                  padding: '0 10px', borderRadius: 8,
                  border: '1px solid var(--border, #1E293B)',
                  background: amount === v ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: amount === v ? '#22C55E' : 'var(--text-dim, #64748B)',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Slippage + Priority Fee */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          padding: '0 20px 12px',
        }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-dim, #64748B)', marginBottom: 4, fontWeight: 600 }}>
              Slippage: {slippage}%
            </div>
            <input
              type="range" min={0.1} max={10} step={0.1}
              value={slippage}
              onChange={e => onSlippageChange(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#22C55E' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-dim, #64748B)', marginBottom: 4, fontWeight: 600 }}>
              Priority Fee
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['low', 'medium', 'high', 'max'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => onPriorityChange(level)}
                  style={{
                    flex: 1, padding: '3px 0', borderRadius: 4,
                    border: 'none', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                    background: priorityLevel === level ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    color: priorityLevel === level ? '#3B82F6' : 'var(--text-dim, #64748B)',
                  }}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Route Display */}
        <div style={{
          margin: '0 20px 12px', padding: '10px 12px', borderRadius: 8,
          background: `${getRouteBadgeColor(route)}08`,
          border: `1px solid ${getRouteBadgeColor(route)}22`,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: getRouteBadgeColor(route), marginBottom: 3 }}>
            {describeRoute(route)}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 8, color: 'var(--text-dim, #64748B)' }}>
            <span>Impact: {route.priceImpactPct.toFixed(2)}%</span>
            <span>Est. out: {route.estimatedOutput.toExponential(2)}</span>
            {antiMev.enabled && <span>🛡️ Anti-MEV</span>}
          </div>
        </div>

        {/* Execute Button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button
            style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #22C55E, #16A34A)',
              color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: amountNum > 0 ? 'pointer' : 'not-allowed',
              opacity: amountNum > 0 ? 1 : 0.5,
              transition: 'transform 0.1s, box-shadow 0.1s',
            }}
            disabled={amountNum <= 0}
            onMouseEnter={e => {
              if (amountNum > 0) {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(34,197,94,0.4)';
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ⚡ Quick Buy {token.symbol}
          </button>
        </div>
      </div>
    </div>
  );
}
