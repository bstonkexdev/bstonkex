// Cupcak8 Swap — Mobile Market Cards
// Touch-friendly cards with brand colors, compact price/change display
import { memo, useState } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
  loading: boolean;
  category: string;
  onClickToken: (t: MarketToken) => void;
  onExplore: () => void;
  watchedAddresses: Set<string>;
  onToggleWatch: (t: MarketToken) => void;
  onQuickBuy: (t: MarketToken) => void;
}

export default memo(function MarketMobileList({
  tokens, loading, category,
  onClickToken, onExplore,
  watchedAddresses, onToggleWatch, onQuickBuy,
}: Props) {
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 20 }}>⏳</div>
        Loading markets...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{category === 'watchlist' ? '♡' : '🔍'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
          {category === 'watchlist' ? 'No Watchlist Markets' : 'No Markets Found'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          {category === 'watchlist'
            ? 'Add tokens to track them here.'
            : 'Try another chain, category, or search.'}
        </div>
        {category === 'watchlist' && (
          <button onClick={onExplore} style={{
            padding: '10px 24px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Explore Markets</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tokens.map((t, i) => (
        <MobileCard
          key={`${t.chainId}-${t.address}-${i}`}
          token={t}
          isWatched={watchedAddresses.has(t.address)}
          onClick={() => onClickToken(t)}
          onToggleWatch={() => onToggleWatch(t)}
          onQuickBuy={() => onQuickBuy(t)}
        />
      ))}
    </div>
  );
});

function MobileCard({ token: t, isWatched, onClick, onToggleWatch, onQuickBuy }: {
  token: MarketToken; isWatched: boolean;
  onClick: () => void; onToggleWatch: () => void; onQuickBuy: () => void;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const isUp = (t.priceChange24h ?? 0) >= 0;
  const changeColor = t.priceChange24h == null ? 'var(--text-muted)' : isUp ? 'var(--lime-dim)' : 'var(--red)';
  const totalTrades = (t.buys24h ?? 0) + (t.sells24h ?? 0);

  return (
    <div onClick={onClick} style={{
      padding: '12px 14px', background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      cursor: 'pointer', transition: 'border-color 0.12s, box-shadow 0.12s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8547C'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(232,84,124,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Top row: icon + name + watch + change */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {t.icon && !iconFailed ? (
          <img src={t.icon} alt={t.symbol} width={32} height={32}
            onError={() => setIconFailed(true)}
            style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--green-bg)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#E8547C', flexShrink: 0,
          }}>{t.symbol.charAt(0).toUpperCase()}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-bright)' }}>{t.symbol}</span>
            <ChainIcon chainId={t.chainId as ChainId} size={12} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(CHAINS[t.chainId as ChainId]?.shortName ?? t.chainId)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text-bright)' }}>
            {t.price != null ? formatUsd(t.price) : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: changeColor }}>
            {t.priceChange24h != null ? `${isUp ? '+' : ''}${formatPct(t.priceChange24h)}` : '—'}
          </div>
        </div>
      </div>

      {/* Bottom row: stats + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden' }}>
          <MobileStat label="Vol" value={t.volume24h != null ? formatCompact(t.volume24h) : '—'} />
          <MobileStat label="Liq" value={t.liquidity != null ? formatCompact(t.liquidity) : '—'} />
          {totalTrades > 0 && <MobileStat label="Trades" value={totalTrades.toLocaleString()} />}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onToggleWatch(); }} style={{
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer',
            fontSize: 14, color: isWatched ? 'var(--yellow)' : 'var(--text-muted)',
          }}>{isWatched ? '★' : '☆'}</button>
          <button onClick={e => { e.stopPropagation(); onQuickBuy(); }} style={{
            padding: '5px 14px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 700,
            cursor: 'pointer',
          }}>Trade</button>
        </div>
      </div>
    </div>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-dim)' }}>{value}</span>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}