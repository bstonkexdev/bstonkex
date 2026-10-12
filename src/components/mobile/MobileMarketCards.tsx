// Cupcak8 Swap — Mobile Market Cards
// Card-based market list with chain icon, symbol, price, 24h change badge
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
  loading: boolean;
  onSelect: (t: MarketToken) => void;
}

export default function MobileMarketCards({ tokens, loading, onSelect }: Props) {
  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        Loading markets...
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
        No markets available
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 12px' }}>
      {tokens.map((t, i) => {
        const chain = CHAINS[t.chainId];
        const isUp = (t.priceChange24h ?? 0) >= 0;
        return (
          <div key={`${t.chainId}-${t.address}-${i}`}
            onClick={() => onSelect(t)}
            style={{
              padding: '12px 14px', marginBottom: 6,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-elevated)';
              e.currentTarget.style.borderColor = 'var(--border-bright)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ChainIcon chainId={t.chainId as ChainId} size={20} />
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-bright)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {t.symbol}
                  <span style={{
                    fontSize: 9, color: 'var(--text-dim)',
                    background: 'var(--bg-elevated)',
                    padding: '1px 6px', borderRadius: 4,
                  }}>{chain?.shortName}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{t.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-bright)',
                  fontFamily: 'var(--font-mono)',
                }}>{formatUsd(t.price)}</div>
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 6, marginTop: 4,
                  background: isUp ? 'var(--green-bg)' : 'var(--red-bg)',
                  color: isUp ? 'var(--green)' : 'var(--red)',
                }}>
                  {isUp ? '+' : ''}{formatPct(t.priceChange24h)}
                </span>
              </div>
            </div>
            {/* Volume bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 8, paddingTop: 8,
              borderTop: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vol</span>
              <span style={{
                fontSize: 10, color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}>{formatCompact(t.volume24h)}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Liq</span>
              <span style={{
                fontSize: 10, color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
              }}>{formatCompact(t.liquidity)}</span>
            </div>
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