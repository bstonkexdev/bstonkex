// Cupcak8 Swap — Active Pair Header Bar
// Token name, price, volume, liquidity, contract address with Cupcak8 theme
import { useState } from 'react';
import { CHAINS, formatUsd, formatPct, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props { token: MarketToken | null; }

export default function ActivePairHeader({ token: t }: Props) {
  const [copied, setCopied] = useState(false);

  if (!t) {
    return (
      <div className="pair-header" style={{ justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
        Select a trading pair to begin
      </div>
    );
  }

  const chain = CHAINS[t.chainId];
  const isUp = (t.priceChange24h ?? 0) >= 0;

  const handleCopy = () => {
    if (t.address) {
      navigator.clipboard.writeText(t.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="pair-header">
      {/* Token identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {t.icon ? (
          <img src={t.icon} alt={t.symbol} width={24} height={24}
            style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)' }}
            onError={e => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'var(--green-bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#E8547C',
          }}>{t.symbol.charAt(0)}</div>
        )}
        <ChainIcon chainId={t.chainId as ChainId} size={18} />
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-bright)' }}>{t.symbol}</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>/ USD</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: isUp ? 'var(--lime-bg)' : 'var(--red-bg)',
          color: isUp ? 'var(--lime-dim)' : 'var(--red)',
        }}>
          {chain?.shortName ?? t.chainId}
        </span>
      </div>

      {/* Price */}
      <span className="pair-price" style={{ color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
        {formatUsd(t.price)}
      </span>

      {/* 24H change */}
      <div className="pair-stat">
        <span className="pair-stat-label">24H</span>
        <span className="pair-stat-value" style={{ color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
          {isUp ? '+' : ''}{formatPct(t.priceChange24h)}
        </span>
      </div>

      {/* High / Low */}
      <div className="pair-stat show-mobile">
        <span className="pair-stat-label">High</span>
        <span className="pair-stat-value">{formatUsd((t as any).high24h ?? null)}</span>
      </div>
      <div className="pair-stat show-mobile">
        <span className="pair-stat-label">Low</span>
        <span className="pair-stat-value">{formatUsd((t as any).low24h ?? null)}</span>
      </div>

      {/* Volume */}
      <div className="pair-stat">
        <span className="pair-stat-label">24H Vol</span>
        <span className="pair-stat-value">{formatCompact(t.volume24h)}</span>
      </div>

      {/* Liquidity */}
      <div className="pair-stat">
        <span className="pair-stat-label">Liquidity</span>
        <span className="pair-stat-value">{formatCompact(t.liquidity)}</span>
      </div>

      {/* FDV */}
      <div className="pair-stat">
        <span className="pair-stat-label">FDV</span>
        <span className="pair-stat-value">{formatCompact(t.marketCap)}</span>
      </div>

      {/* Contract + Explorer links */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={handleCopy} style={{
          padding: '4px 10px', fontSize: 10, fontWeight: 600,
          background: copied ? 'var(--lime-bg)' : 'var(--bg-elevated)',
          border: `1px solid ${copied ? 'var(--lime-dim)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          color: copied ? 'var(--lime-dim)' : 'var(--text-dim)',
          transition: 'all 0.15s',
        }}>
          {copied ? '✓ Copied' : `📋 ${shortenAddress(t.address)}`}
        </button>
        {t.url && (
          <a href={t.url} target="_blank" rel="noopener" style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 600,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)',
            textDecoration: 'none', transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            Explorer ↗
          </a>
        )}
      </div>
    </div>
  );
}

function formatCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}