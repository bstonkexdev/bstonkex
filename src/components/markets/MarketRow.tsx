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

export default function MarketRow({ token: t, onClick, isWatched, onToggleWatch, onQuickBuy }: Props) {
  const chain = CHAINS[t.chainId];

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
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-bright)' }}>
              {t.symbol} <ChainIcon chainId={t.chainId as ChainId} size={10} />
              <span style={{ fontSize: 9, color: chain?.color, marginLeft: 3 }}>{chain?.shortName}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.name}</div>
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatAge(t.ageMs)}</span>
        </div>
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-bright)' }}>
        {formatUsd(t.price)}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {formatUsd(t.marketCap)}
      </td>
      <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
        {formatUsd(t.liquidity)}
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