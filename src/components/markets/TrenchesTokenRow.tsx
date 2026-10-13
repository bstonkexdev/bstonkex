// Cupcak8 Swap — Trenches Token Row
// Individual token row with bonding curve bar, security badges, Quick Buy.

import type { TrenchesToken } from '../../lib/engine/trenches-types';
import { formatMcap, formatAge } from '../../lib/engine/trenches-types';
import SecurityBadges from './SecurityBadges';

interface Props {
  token: TrenchesToken;
  onQuickBuy: (token: TrenchesToken) => void;
}

export default function TrenchesTokenRow({ token, onQuickBuy }: Props) {
  const progress = Math.min(100, token.bondingCurveProgress);
  const phaseColor = token.phase === 'graduated' ? '#3B82F6' : token.phase === 'migrating' ? '#EAB308' : '#22C55E';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderBottom: '1px solid var(--border, #1E293B)',
      transition: 'background 0.15s', cursor: 'pointer',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Token Icon + Symbol */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
        {token.icon ? (
          <img src={token.icon} alt="" style={{ width: 28, height: 28, borderRadius: 14, objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: 14,
            background: `linear-gradient(135deg, ${phaseColor}33, ${phaseColor}11)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: phaseColor,
          }}>
            {token.symbol.slice(0, 2)}
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #F8FAFC)' }}>{token.symbol}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim, #64748B)', fontFamily: 'var(--font-mono, monospace)' }}>
            {token.address.slice(0, 6)}...{token.address.slice(-4)}
          </div>
        </div>
      </div>

      {/* Age */}
      <div style={{ minWidth: 40, fontSize: 10, color: 'var(--text-dim, #64748B)', textAlign: 'center' }}>
        {formatAge(token.createdAt)}
      </div>

      {/* Virtual Market Cap */}
      <div style={{ minWidth: 70, textAlign: 'right' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text, #F8FAFC)' }}>
          {formatMcap(token.virtualMcapUsd)}
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-dim, #64748B)' }}>mcap</div>
      </div>

      {/* Bonding Curve Progress Bar */}
      <div style={{ flex: 1, minWidth: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim, #64748B)' }}>Curve</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: phaseColor }}>{progress.toFixed(1)}%</span>
        </div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: `linear-gradient(90deg, ${phaseColor}88, ${phaseColor})`,
            borderRadius: 3, transition: 'width 0.5s ease',
            boxShadow: progress > 80 ? `0 0 8px ${phaseColor}44` : 'none',
          }} />
        </div>
      </div>

      {/* Security Badges */}
      <div style={{ minWidth: 80 }}>
        <SecurityBadges
          chainId={token.chainId}
          address={token.address}
          compact
        />
      </div>

      {/* Quick Buy Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onQuickBuy(token); }}
        style={{
          padding: '4px 10px', borderRadius: 6, border: 'none',
          background: 'linear-gradient(135deg, #22C55E, #16A34A)',
          color: '#fff', fontSize: 10, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
          transition: 'transform 0.1s, box-shadow 0.1s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(34,197,94,0.4)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        ⚡ Buy
      </button>
    </div>
  );
}
