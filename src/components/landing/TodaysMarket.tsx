// BSTONKEX — Compact tabbed market section
import { useState } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

type Tab = 'trending' | 'gainers' | 'losers' | 'new';

interface Props {
  trending: MarketToken[];
  gainers: MarketToken[];
  losers: MarketToken[];
  newMarkets: MarketToken[];
  loading: boolean;
  onClickToken: (t: { chainId: any; address: string; name: string; symbol: string }) => void;
  onViewAll: () => void;
}

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'trending', label: 'TRENDING', color: 'var(--cyan)' },
  { id: 'gainers', label: 'GAINERS', color: 'var(--green)' },
  { id: 'losers', label: 'LOSERS', color: 'var(--red)' },
  { id: 'new', label: 'NEW', color: 'var(--amber)' },
];

export default function TodaysMarket({ trending, gainers, losers, newMarkets, loading, onClickToken, onViewAll }: Props) {
  const [tab, setTab] = useState<Tab>('trending');

  const data: Record<Tab, MarketToken[]> = { trending, gainers, losers, new: newMarkets };
  const items = data[tab];

  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'var(--bg-panel)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 900, color: 'var(--text-bright)',
          letterSpacing: '0.12em',
        }}>
          TODAY'S MARKET
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onViewAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 8, fontWeight: 700, color: 'var(--cyan)',
            letterSpacing: '0.05em',
            fontFamily: 'var(--font)',
          }}
        >
          VIEW ALL MARKETS →
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '6px 8px',
            background: tab === t.id ? 'var(--bg-hover)' : 'transparent',
            border: 'none', borderBottom: tab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
            cursor: 'pointer',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
            color: tab === t.id ? t.color : 'var(--text-dim)',
            fontFamily: 'var(--font)',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '70px 45px 1fr 70px 70px',
        gap: 4, padding: '5px 12px',
        fontSize: 7, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: '0.06em',
        borderBottom: '1px solid var(--border)',
      }}>
        <span>TOKEN</span>
        <span>CHAIN</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>24H</span>
        <span style={{ textAlign: 'right' }}>VOLUME</span>
      </div>

      {/* Rows */}
      {loading && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
          LOADING MARKET DATA...
        </div>
      )}
      {!loading && items.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
          NO DATA AVAILABLE
        </div>
      )}
      {!loading && items.slice(0, 8).map((t, i) => {
        const chain = CHAINS[t.chainId];
        const isUp = (t.priceChange24h ?? 0) >= 0;
        return (
          <div
            key={`${t.chainId}-${t.address}-${i}`}
            onClick={() => onClickToken({ chainId: t.chainId, address: t.address, name: t.name, symbol: t.symbol })}
            style={{
              display: 'grid', gridTemplateColumns: '70px 45px 1fr 70px 70px',
              gap: 4, padding: '5px 12px', cursor: 'pointer',
              borderBottom: '1px solid rgba(22,40,72,0.2)',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontWeight: 800, color: 'var(--text-bright)', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.symbol}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><ChainIcon chainId={t.chainId as ChainId} size={10} /><span style={{ fontSize: 7, color: chain?.color, fontWeight: 700 }}>{chain?.shortName}</span></span>
            <span style={{ textAlign: 'right', color: 'var(--text)', fontSize: 9 }}>{formatUsd(t.price)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)', fontSize: 9 }}>
              {formatPct(t.priceChange24h)}
            </span>
            <span style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: 8 }}>{formatCompact(t.volume24h)}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}