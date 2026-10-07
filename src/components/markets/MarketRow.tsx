import { CHAINS, formatUsd, formatPct, formatNum, shortenAddress } from '../../lib/config';
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
  const isUp24h = t.priceChange24h != null && t.priceChange24h >= 0;
  const isUp1m = t.priceChange5m != null && t.priceChange5m >= 0;

  return (
    <tr className="market-row" onClick={onClick}>
      {/* Watch */}
      <td className="col-watch">
        <button className="watch-btn" onClick={e => { e.stopPropagation(); onToggleWatch(); }}>
          {isWatched ? '★' : '☆'}
        </button>
      </td>

      {/* PAIR / AGE */}
      <td className="col-pair">
        <div className="pair-cell">
          <span className="pair-led" data-fresh={t.dataFreshness} />
          {t.icon && (
            <img src={t.icon} alt="" className="pair-icon" onError={e => (e.currentTarget.style.display = 'none')} />
          )}
          <div className="pair-info">
            <div className="pair-symbol">
              {t.symbol}
              <ChainIcon chainId={t.chainId as ChainId} size={10} style={{ marginLeft: 2, marginRight: 1 }} />
              <span className="pair-chain" style={{ color: chain?.color }}>{chain?.shortName}</span>
            </div>
            <div className="pair-name">{t.name}</div>
          </div>
          <span className="pair-age">{formatAge(t.ageMs)}</span>
        </div>
      </td>

      {/* PRICE */}
      <td className="col-right col-price">{formatUsd(t.price)}</td>

      {/* MC */}
      <td className="col-right">{formatUsd(t.marketCap)}</td>

      {/* LIQ / INIT */}
      <td className="col-right col-hide-sm">{formatUsd(t.liquidity)}</td>

      {/* RISK */}
      <td className="col-center col-hide-sm">
        <RiskBadge liquidity={t.liquidity} dataFreshness={t.dataFreshness} />
      </td>

      {/* SMART */}
      <td className="col-center col-hide-md">
        <span className="smart-badge">
          {t.buySellRatio24h != null && t.buySellRatio24h > 1.5 ? '●' : '—'}
        </span>
      </td>

      {/* 24H VOL */}
      <td className="col-right">{formatUsd(t.volume24h)}</td>

      {/* 24H ACT */}
      <td className="col-right col-hide-sm">
        <div className="activity-cell">
          <span className="act-buy">{formatNum(t.buys24h)}</span>
          <span className="act-sep">/</span>
          <span className="act-sell">{formatNum(t.sells24h)}</span>
        </div>
      </td>

      {/* HOLDERS */}
      <td className="col-right col-hide-md">
        {t.txns24h != null ? formatNum(t.txns24h) : '—'}
      </td>

      {/* 1M% */}
      <td className="col-right col-hide-sm" style={{ color: pctColor(t.priceChange5m), fontWeight: 700 }}>
        {formatPct(t.priceChange5m)}
      </td>

      {/* 24H% */}
      <td className="col-right" style={{ color: pctColor(t.priceChange24h), fontWeight: 700 }}>
        {formatPct(t.priceChange24h)}
      </td>

      {/* TOP10 */}
      <td className="col-center col-hide-md">
        <span className="top10-badge">
          {t.marketCap != null && t.marketCap > 1000000 ? '▲' : '—'}
        </span>
      </td>

      {/* SEC */}
      <td className="col-center col-hide-lg">
        <SecBadge freshness={t.dataFreshness} liquidity={t.liquidity} />
      </td>

      {/* QUICK BUY */}
      <td className="col-action">
        <button className="quick-buy-btn" onClick={e => { e.stopPropagation(); onQuickBuy(); }}>
          BUY
        </button>
      </td>
    </tr>
  );
}

function RiskBadge({ liquidity, dataFreshness }: { liquidity: number | null; dataFreshness: string }) {
  if (liquidity == null || liquidity < 1000) return <span className="risk-badge risk-high">HIGH</span>;
  if (liquidity < 10000) return <span className="risk-badge risk-med">MED</span>;
  return <span className="risk-badge risk-low">LOW</span>;
}

function SecBadge({ freshness, liquidity }: { freshness: string; liquidity: number | null }) {
  const good = freshness === 'live' && liquidity != null && liquidity > 10000;
  const warn = freshness === 'recent' || (liquidity != null && liquidity > 1000);
  return (
    <span className={`sec-badge ${good ? 'sec-good' : warn ? 'sec-warn' : 'sec-danger'}`}>
      {good ? '✓' : warn ? '!' : '✕'}
    </span>
  );
}

export function pctColor(v: number | null): string {
  if (v == null) return 'var(--text-dim)';
  return v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-dim)';
}