import { CHAINS, formatUsd, formatPct, formatNum } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import { formatAge } from '../../lib/market-discovery';
import type { MarketToken } from '../../lib/market-discovery';
import { LoadingState, EmptyState } from './EmptyStates';
import { pctColor } from './MarketRow';
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

export default function MarketMobileList({
  tokens, loading, category, onClickToken, onExplore,
  watchedAddresses, onToggleWatch, onQuickBuy,
}: Props) {
  if (loading) return <LoadingState />;

  if (tokens.length === 0) {
    return (
      <EmptyState
        title={category === 'watchlist' ? 'YOUR WATCHLIST IS EMPTY' : 'NO MARKETS FOUND'}
        subtitle={category === 'watchlist' ? 'Add tokens from any market to track them.' : undefined}
        action={category === 'watchlist' ? { label: 'EXPLORE MARKETS', onClick: onExplore } : undefined}
      />
    );
  }

  return (
    <div className="market-mobile-cards">
      {tokens.map((t, i) => {
        const chain = CHAINS[t.chainId];
        const isWatched = watchedAddresses.has(t.address);
        return (
          <div
            key={`${t.chainId}-${t.address}-m-${i}`}
            className="market-mobile-card"
            onClick={() => onClickToken(t)}
          >
            {/* Row 1: Star + Token + Quick Buy */}
            <div className="mcard-row1">
              <div className="mcard-token">
                <button className="watch-btn" onClick={e => { e.stopPropagation(); onToggleWatch(t); }}>
                  {isWatched ? '★' : '☆'}
                </button>
                {t.icon && (
                  <img src={t.icon} alt="" className="mcard-icon" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
                <div className="mcard-identity">
                  <span className="mcard-symbol">{t.symbol}</span>
                  <ChainIcon chainId={t.chainId as ChainId} size={12} />
                  <span className="mcard-chain" style={{ color: chain?.color }}>{chain?.shortName}</span>
                  <span className="mcard-name">{t.name}</span>
                </div>
              </div>
              <button className="quick-buy-btn" onClick={e => { e.stopPropagation(); onQuickBuy(t); }}>
                BUY
              </button>
            </div>

            {/* Row 2: Price / Change */}
            <div className="mcard-row2">
              <span className="mcard-price">{formatUsd(t.price)}</span>
              <span className="mcard-change" style={{ color: pctColor(t.priceChange24h) }}>
                {formatPct(t.priceChange24h)}
              </span>
              <span className="mcard-1m" style={{ color: pctColor(t.priceChange5m) }}>
                1M {formatPct(t.priceChange5m)}
              </span>
            </div>

            {/* Row 3: Stats */}
            <div className="mcard-row3">
              <span className="mcard-stat">MC <span>{formatUsd(t.marketCap)}</span></span>
              <span className="mcard-stat">VOL <span>{formatUsd(t.volume24h)}</span></span>
              <span className="mcard-stat">LIQ <span>{formatUsd(t.liquidity)}</span></span>
            </div>

            {/* Row 4: Activity / Age */}
            <div className="mcard-row4">
              <span className="mcard-stat">
                ACT <span style={{ color: 'var(--green)' }}>{formatNum(t.buys24h)}</span>
                /<span style={{ color: 'var(--red)' }}>{formatNum(t.sells24h)}</span>
              </span>
              <span className="mcard-stat">AGE <span>{formatAge(t.ageMs)}</span></span>
              <RiskMini liquidity={t.liquidity} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskMini({ liquidity }: { liquidity: number | null }) {
  if (liquidity == null || liquidity < 1000) return <span className="risk-badge risk-high">HIGH RISK</span>;
  if (liquidity < 10000) return <span className="risk-badge risk-med">MED RISK</span>;
  return <span className="risk-badge risk-low">LOW RISK</span>;
}