// Cupcak8 Swap — Individual Market Row (standalone, used by MarketTable inline)
import { CHAINS, formatUsd, formatPct, formatNum } from '../../lib/config';
import { formatAge } from '../../lib/market-discovery';
import type { MarketToken } from '../../lib/market-discovery';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

interface Props {
  token: MarketToken;
  rank: number;
  onClick: () => void;
  isWatched: boolean;
  onToggleWatch: () => void;
  onQuickBuy: () => void;
}

function MarketStateBadge({ state }: { state: MarketToken['marketState'] }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    bonding_curve: { label: 'CURVE', color: 'var(--cyan, #0088FF)', bg: 'var(--green-bg)' },
    migrating:     { label: 'MIGRATING', color: 'var(--amber, #FFD700)', bg: 'var(--yellow-bg)' },
    launched:      { label: 'LIVE', color: 'var(--green)', bg: 'var(--green-bg)' },
    inactive:      { label: 'INACTIVE', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
    unknown:       { label: 'NEW', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  };
  const s = map[state] ?? map.unknown;
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
      border: `1px solid ${s.color}`, color: s.color, background: s.bg,
      marginLeft: 3, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function PriceSourceBadge({ source }: { source: MarketToken['priceSource'] }) {
  if (source === 'dex_pair') return null;
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, padding: '1px 3px', borderRadius: 2,
      border: '1px solid var(--text-muted)', color: 'var(--text-muted)',
      marginLeft: 2, whiteSpace: 'nowrap',
    }}>
      {source === 'bonding_curve' ? 'BC' : 'N/A'}
    </span>
  );
}

export default function MarketRow({ token: t, onClick, isWatched, onToggleWatch, onQuickBuy }: Props) {
  const chain = CHAINS[t.chainId];
  const showPrice = t.price != null && isFinite(t.price);

  return (
    <tr onClick={onClick} style={{
      cursor: 'pointer', borderBottom: '1px solid var(--border)',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <button onClick={e => { e.stopPropagation(); onToggleWatch(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: isWatched ? 'var(--yellow)' : 'var(--text-muted)', padding: 0 }}>
          {isWatched ? '★' : '☆'}
        </button>
      </td>
      <td style={{ padding: '8px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {t.icon && <img src={t.icon} alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} />}
          <div>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-bright)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3 }}>
              {t.symbol} <ChainIcon chainId={t.chainId as ChainId} size={10} />
              <span style={{ fontSize: 9, color: chain?.color }}>{chain?.shortName}</span>
              <MarketStateBadge state={t.marketState} />
              <PriceSourceBadge source={t.priceSource} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.name}</div>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatAge(t.ageMs)}</span>
        </div>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-bright)' }}>
        {showPrice ? formatUsd(t.price) : <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>Price unavailable</span>}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {formatUsd(t.marketCap)}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {formatUsd(t.liquidity) || (t.virtualLiquidity != null ? <span style={{ fontSize: 8 }}>V:{formatUsd(t.virtualLiquidity)}</span> : null)}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {formatUsd(t.volume24h)}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: pctColor(t.priceChange24h) }}>
        {formatPct(t.priceChange24h)}
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <button onClick={e => { e.stopPropagation(); onQuickBuy(); }} style={{
          padding: '5px 12px', background: '#E8547C', border: 'none',
          borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer',
        }}>Trade</button>
      </td>
    </tr>
  );
}

export function pctColor(v: number | null): string {
  if (v == null) return 'var(--text-dim)';
  return v > 0 ? 'var(--lime-dim)' : v < 0 ? 'var(--red)' : 'var(--text-dim)';
}