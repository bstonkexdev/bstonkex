// Cupcak8 Swap — Desktop Market Table
// Warm cream rows, pink hover, mint green positive / coral red negative
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

export default memo(function MarketTable({
  tokens, loading, category,
  onClickToken, onExplore,
  watchedAddresses, onToggleWatch, onQuickBuy,
}: Props) {
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        <div style={{ marginBottom: 8, fontSize: 20 }}>⏳</div>
        Loading markets...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>{category === 'watchlist' ? '♡' : '🔍'}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>
          {category === 'watchlist' ? 'No Watchlist Markets' : 'No Markets Found'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          {category === 'watchlist'
            ? 'Add tokens from any market to track them here.'
            : 'Try another chain, category, or search term.'}
        </div>
        {category === 'watchlist' && (
          <button onClick={onExplore} style={{
            padding: '8px 20px', background: '#E8547C', border: 'none',
            borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Explore Markets</button>
        )}
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--bg-elevated)' }}>
          <Th style={{ width: 32 }}></Th>
          <Th align="left">Token</Th>
          <Th>Chain</Th>
          <Th align="right">Price</Th>
          <Th align="right">24H</Th>
          <Th align="right">Volume</Th>
          <Th align="right">Liquidity</Th>
          <Th align="right">MCap</Th>
          <Th align="right">Trades</Th>
          <Th style={{ width: 50 }}></Th>
        </tr>
      </thead>
      <tbody>
        {tokens.map((t, i) => (
          <TokenRow
            key={`${t.chainId}-${t.address}-${i}`}
            token={t} index={i}
            isWatched={watchedAddresses.has(t.address)}
            onClick={() => onClickToken(t)}
            onToggleWatch={() => onToggleWatch(t)}
            onQuickBuy={() => onQuickBuy(t)}
          />
        ))}
      </tbody>
    </table>
  );
});

function TokenRow({ token: t, index, isWatched, onClick, onToggleWatch, onQuickBuy }: {
  token: MarketToken; index: number; isWatched: boolean;
  onClick: () => void; onToggleWatch: () => void; onQuickBuy: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isUp = (t.priceChange24h ?? 0) >= 0;
  const changeColor = t.priceChange24h == null ? 'var(--text-muted)' : isUp ? 'var(--lime-dim)' : 'var(--red)';
  const totalTrades = (t.buys24h ?? 0) + (t.sells24h ?? 0);

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.1s',
      }}
    >
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <button onClick={e => { e.stopPropagation(); onToggleWatch(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: isWatched ? 'var(--yellow)' : 'var(--text-muted)', padding: 0 }}>
          {isWatched ? '★' : '☆'}
        </button>
      </td>
      <td style={{ padding: '8px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TokenIcon src={t.icon} symbol={t.symbol} chainId={t.chainId as ChainId} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-bright)', lineHeight: 1.2 }}>{t.symbol}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <ChainIcon chainId={t.chainId as ChainId} size={12} />
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{(CHAINS[t.chainId as ChainId]?.shortName ?? t.chainId)}</span>
        </div>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-bright)' }}>
        {t.price != null ? formatUsd(t.price) : '—'}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: changeColor }}>
        {t.priceChange24h != null ? (
          <span>{isUp ? '+' : ''}{formatPct(t.priceChange24h)}</span>
        ) : '—'}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {t.volume24h != null ? formatCompact(t.volume24h) : '—'}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {t.liquidity != null ? formatCompact(t.liquidity) : '—'}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {t.marketCap != null ? formatCompact(t.marketCap) : '—'}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {totalTrades > 0 ? totalTrades.toLocaleString() : '—'}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <button onClick={e => { e.stopPropagation(); onQuickBuy(); }} style={{
          padding: '5px 12px', background: '#E8547C', border: 'none',
          borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 10, fontWeight: 700,
          cursor: 'pointer', transition: 'background 0.12s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
          onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
        >Trade</button>
      </td>
    </tr>
  );
}

function TokenIcon({ src, symbol, chainId }: { src: string | null; symbol: string; chainId: ChainId }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img src={src} alt={symbol} width={28} height={28}
        onError={() => setFailed(true)}
        style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: 'var(--green-bg)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800, color: '#E8547C', flexShrink: 0,
    }}>
      {symbol.charAt(0).toUpperCase()}
    </div>
  );
}

function Th({ children, align, style }: { children?: React.ReactNode; align?: string; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: '10px 8px', fontSize: 10, fontWeight: 700,
      color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.06em', textAlign: (align as any) ?? 'left',
      borderBottom: '1px solid var(--border)', ...style,
    }}>{children}</th>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}