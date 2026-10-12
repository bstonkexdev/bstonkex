// Cupcak8 Swap — Left Trending Panel (~280px)
// Trending tokens list + Promotional banner card
import { useApp } from '../../lib/context';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
  featured: MarketToken | null;
  onSelect: (t: MarketToken) => void;
  loading: boolean;
}

export default function LeftTrendingPanel({ tokens, featured, onSelect, loading }: Props) {
  const { setPage } = useApp();

  return (
    <div style={{
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--bg-surface)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: 'var(--text-bright)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>🔥 Trending</span>
        <span style={{
          fontSize: 9, color: 'var(--green)', fontWeight: 600,
          background: 'var(--green-bg)', padding: '2px 8px', borderRadius: 10,
        }}>LIVE</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '28px 1fr 72px 56px',
        padding: '8px 16px', fontSize: 10, fontWeight: 600,
        color: 'var(--text-dim)', borderBottom: '1px solid var(--border)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        <span>#</span>
        <span>Pair</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>24H</span>
      </div>

      {/* Token list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            Loading markets...
          </div>
        )}
        {!loading && tokens.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            No data available
          </div>
        )}
        {!loading && tokens.map((t, i) => {
          const isUp = (t.priceChange24h ?? 0) >= 0;
          const isActive = featured?.address === t.address && featured?.chainId === t.chainId;
          return (
            <div key={`${t.chainId}-${t.address}-${i}`}
              onClick={() => onSelect(t)}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 72px 56px',
                padding: '9px 16px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                transition: 'background 0.12s',
                background: isActive ? 'var(--green-bg)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isActive ? 'var(--green-bg)' : 'transparent';
              }}
            >
              <span style={{
                fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, paddingTop: 1,
              }}>{i + 1}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ChainIcon chainId={t.chainId as ChainId} size={14} />
                <span style={{
                  fontWeight: 700, fontSize: 12,
                  color: isActive ? 'var(--green)' : 'var(--text-bright)',
                }}>{t.symbol}</span>
              </span>
              <span style={{
                textAlign: 'right', fontFamily: 'var(--font-mono)',
                fontWeight: 600, fontSize: 11, color: 'var(--text)',
              }}>{formatUsd(t.price)}</span>
              <span style={{
                textAlign: 'right', fontWeight: 700, fontSize: 11,
                color: isUp ? 'var(--green)' : 'var(--red)',
              }}>{formatPct(t.priceChange24h)}</span>
            </div>
          );
        })}
      </div>

      {/* Promotional Banner */}
      <div style={{
        margin: '0 12px 12px', padding: '16px',
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.08) 0%, rgba(0, 230, 118, 0.06) 100%)',
        border: '1px solid rgba(255, 215, 0, 0.18)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{
          fontFamily: 'var(--font-pixel)', fontSize: 9,
          color: 'var(--yellow)', letterSpacing: '0.1em',
          marginBottom: 8, textShadow: '0 0 12px rgba(255, 215, 0, 0.3)',
        }}>★ REFER & EARN</div>
        <div style={{
          fontSize: 11, color: 'var(--text)', lineHeight: 1.5, marginBottom: 12,
        }}>
          Invite friends and earn up to 30% cashback on trading fees.
        </div>
        <button
          onClick={() => setPage('referrals')}
          style={{
            width: '100%', padding: '10px',
            background: 'var(--green)', border: 'none',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: '#000', fontSize: 11, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--green-dim)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--green)'}
        >START EARNING</button>
      </div>
    </div>
  );
}