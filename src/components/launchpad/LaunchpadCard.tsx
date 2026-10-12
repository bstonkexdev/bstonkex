// Cupcak8 Swap — Launchpad Mobile Card
// Cupcak8 themed with pink action buttons and proper layout
import { memo } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  token: MarketToken;
  onTrade: () => void;
}

export default memo(function LaunchpadCard({ token: t, onTrade }: Props) {
  const chain = CHAINS[t.chainId];
  const isUp = (t.priceChange24h ?? 0) >= 0;
  const statusColor = t.tradability === 'tradable' ? 'var(--lime-dim)' :
    t.tradability === 'data_only' ? 'var(--yellow-dim)' : 'var(--text-muted)';
  const statusLabel = t.tradability === 'tradable' ? 'TRADEABLE' :
    t.tradability === 'data_only' ? 'DATA ONLY' :
    t.tradability === 'no_liquidity' ? 'NO LIQUIDITY' : 'NO ROUTE';

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 12, background: 'var(--bg-surface)', cursor: 'pointer',
      transition: 'border-color 0.12s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onClick={onTrade}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.icon ? (
            <img src={t.icon} alt={t.symbol} width={24} height={24}
              style={{ borderRadius: '50%', objectFit: 'cover', background: 'var(--bg-elevated)' }}
              onError={e => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: 'rgba(232,84,124,0.1)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#E8547C',
            }}>{t.symbol.charAt(0)}</div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)' }}>{t.symbol}</span>
              <ChainIcon chainId={t.chainId as ChainId} size={12} />
              <span style={{ fontSize: 10, color: chain?.color || 'var(--text-muted)' }}>{chain?.shortName}</span>
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t.name}</span>
          </div>
        </div>
        <span style={{
          fontSize: 8, fontWeight: 700, padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          background: statusColor === 'var(--lime-dim)' ? 'var(--lime-bg)' :
            statusColor === 'var(--yellow-dim)' ? 'var(--yellow-bg)' : 'var(--bg-elevated)',
          color: statusColor,
        }}>
          {statusLabel}
        </span>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Price</span>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
            {t.price != null ? (t.price < 0.01 ? t.price.toExponential(3) : formatUsd(t.price)) : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>24H</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: isUp ? 'var(--lime-dim)' : 'var(--red)' }}>
            {t.priceChange24h != null ? `${isUp ? '+' : ''}${formatPct(t.priceChange24h)}` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Volume</span>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
            {formatUsd(t.volume24h)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Liquidity</span>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
            {formatUsd(t.liquidity)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>MCap</span>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-bright)' }}>
            {formatUsd(t.marketCap)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Buys/Sells</span>
          <span style={{ fontSize: 10 }}>
            <span style={{ color: 'var(--lime-dim)', fontWeight: 700 }}>{t.buys24h ?? 0}</span>
            <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>{t.sells24h ?? 0}</span>
          </span>
        </div>
      </div>

      {/* Launchpad tag */}
      {t.launchpadName && (
        <div style={{ marginBottom: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 6px',
            background: 'rgba(232,84,124,0.08)', borderRadius: 'var(--radius-sm)',
            color: '#E8547C',
          }}>
            {t.launchpadName}
          </span>
        </div>
      )}

      {/* Trade button */}
      <button onClick={e => { e.stopPropagation(); onTrade(); }} style={{
        width: '100%', padding: '10px', background: '#E8547C', border: 'none',
        borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 12, fontWeight: 700,
        cursor: 'pointer', transition: 'background 0.12s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#D14068'}
        onMouseLeave={e => e.currentTarget.style.background = '#E8547C'}
      >
        Trade
      </button>
    </div>
  );
});