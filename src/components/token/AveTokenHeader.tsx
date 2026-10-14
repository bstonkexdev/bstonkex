// Cupcak8 Swap — Ave.ai-style Token Header
// Top section: Avatar, Symbol + Multiplier, contract address + copy, age
// Stats grid: C.MCap, 24h Vol, 24h Makers, 24h Txs
// Quick badges: Holder ratio, Tax, DEX, Smart Money
import { useState } from 'react';
import type { ChainId } from '../../lib/config';
import { CHAINS, shortenAddress, formatUsd, formatNum } from '../../lib/config';
import { microPrice, formatPriceChange } from '../../lib/micro-price';
import { formatAge } from '../../lib/token-page-data';

interface Props {
  symbol: string;
  name: string;
  icon: string | null;
  chainId: ChainId;
  address: string;
  pairCreatedAt: number | null;
  price: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  txns24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holderCount: number | null;
  devHolders: number | null;
  taxPct: number | null;
  smartMoneyCount: number | null;
  whaleCount: number | null;
  dexScore: number | null;
  isWatched: boolean;
  onToggleWatch: () => void;
  onBack: () => void;
  onToggleFullscreen?: () => void;
  alertEnabled: boolean;
  onToggleAlert: () => void;
}

const badge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', borderRadius: 4,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 9, fontWeight: 700, color: 'var(--text-dim)',
  whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)',
};

const statCell: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 6,
  minWidth: 0,
};

const statLabel: React.CSSProperties = {
  fontSize: 8, fontWeight: 700, color: 'var(--text-muted)',
  letterSpacing: '0.08em', textTransform: 'uppercase',
};

const statValue: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: 'var(--text)',
  fontFamily: 'var(--font-mono, monospace)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};

export default function AveTokenHeader(p: Props) {
  const [copied, setCopied] = useState(false);
  const chain = CHAINS[p.chainId];
  const age = formatAge(p.pairCreatedAt);
  const change = formatPriceChange(p.priceChange24h);

  const copy = async () => {
    if (!p.address) return;
    try { await navigator.clipboard.writeText(p.address); setCopied(true); window.setTimeout(() => setCopied(false), 1200); } catch {}
  };

  const makers24h = (p.buys24h ?? 0) + (p.sells24h ?? 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ── Row 1: Identity ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Back */}
        <button onClick={p.onBack} style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text)', cursor: 'pointer', borderRadius: 6, fontSize: 16, flexShrink: 0,
        }} title="Back to markets">‹</button>

        {/* Avatar */}
        {p.icon ? (
          <img src={p.icon} alt="" width={36} height={36}
            style={{ borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0, objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--text-dim)' }}>
            {p.symbol.charAt(0)}
          </div>
        )}

        {/* Symbol + chain + name */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-bright)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
              {p.symbol}
            </span>
            <span style={{
              fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              color: '#a78bfa', letterSpacing: '0.05em',
            }}>5×</span>
            <span style={{
              fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
              border: `1px solid ${chain.color}`, color: chain.color,
            }}>{chain.shortName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {p.address ? (
              <button onClick={copy} style={{
                cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-dim)', fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4,
              }}>
                {copied ? 'COPIED ✓' : shortenAddress(p.address, 4)}
              </button>
            ) : (
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>NO CONTRACT</span>
            )}
            {age && <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{age}</span>}
          </div>
        </div>

        {/* Price + change (right side) */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-bright)', fontFamily: 'var(--font-mono, monospace)' }}>
            {microPrice(p.price)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: change.color }}>
            {change.text}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={p.onToggleAlert} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: p.alertEnabled ? 'rgba(255,215,0,0.1)' : 'var(--bg-elevated)',
            border: `1px solid ${p.alertEnabled ? 'rgba(255,215,0,0.3)' : 'var(--border)'}`,
            color: p.alertEnabled ? '#ffd700' : 'var(--text-dim)',
            cursor: 'pointer', borderRadius: 6, fontSize: 11,
          }}>{p.alertEnabled ? '🔔' : '🔕'}</button>
          <button onClick={p.onToggleWatch} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: p.isWatched ? 'rgba(255,215,0,0.1)' : 'var(--bg-elevated)',
            border: `1px solid ${p.isWatched ? 'rgba(255,215,0,0.3)' : 'var(--border)'}`,
            color: p.isWatched ? '#ffd700' : 'var(--text-dim)',
            cursor: 'pointer', borderRadius: 6, fontSize: 12,
          }}>{p.isWatched ? '★' : '☆'}</button>
        </div>
      </div>

      {/* ── Row 2: Stats Grid (4 cols) ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <div style={statCell}>
          <span style={statLabel}>C.MCap</span>
          <span style={statValue}>{p.marketCap != null ? formatUsd(p.marketCap) : '—'}</span>
        </div>
        <div style={statCell}>
          <span style={statLabel}>24h Vol</span>
          <span style={statValue}>{p.volume24h != null ? formatUsd(p.volume24h) : '—'}</span>
        </div>
        <div style={statCell}>
          <span style={statLabel}>24h Makers</span>
          <span style={statValue}>{makers24h > 0 ? formatNum(makers24h) : '—'}</span>
        </div>
        <div style={statCell}>
          <span style={statLabel}>24h Txs</span>
          <span style={statValue}>{p.txns24h != null ? formatNum(p.txns24h) : '—'}</span>
        </div>
      </div>

      {/* ── Row 3: Quick Badges ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {p.holderCount != null && (
          <span style={badge}>
            👤 {p.devHolders != null ? `${p.devHolders}/${p.holderCount}` : formatNum(p.holderCount)}
          </span>
        )}
        <span style={badge}>🧼 {p.taxPct != null ? `${p.taxPct}%` : '0%'}</span>
        {p.dexScore != null && (
          <span style={badge}>F ⚡ {p.dexScore}</span>
        )}
        {(p.smartMoneyCount != null || p.whaleCount != null) && (
          <span style={badge}>💰 {p.smartMoneyCount ?? 0}/{p.whaleCount ?? 0}</span>
        )}
        <span style={{ ...badge, color: '#10b981', borderColor: 'rgba(16,185,129,0.2)' }}>
          FEE {0.3}%
        </span>
      </div>
    </div>
  );
}