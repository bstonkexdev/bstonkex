import type { MarketToken } from '../../lib/market-discovery';
import MarketRow from './MarketRow';
import { LoadingState, EmptyState } from './EmptyStates';

interface Props {
  tokens: MarketToken[];
  loading: boolean;
  category: string;
  page: number;
  perPage: number;
  onClickToken: (t: MarketToken) => void;
  onExplore: () => void;
  watchedAddresses: Set<string>;
  onToggleWatch: (t: MarketToken) => void;
  onQuickBuy: (t: MarketToken) => void;
}

export default function MarketTable({
  tokens, loading, category, page, perPage,
  onClickToken, onExplore,
  watchedAddresses, onToggleWatch, onQuickBuy,
}: Props) {
  if (loading) return <LoadingState />;

  if (tokens.length === 0) {
    return (
      <EmptyState
        title={category === 'watchlist' ? 'YOUR WATCHLIST IS EMPTY' : 'NO MARKETS FOUND'}
        subtitle={category === 'watchlist' ? 'Add tokens from any market to track them here.' : undefined}
        action={category === 'watchlist' ? { label: 'EXPLORE MARKETS', onClick: onExplore } : undefined}
      />
    );
  }

  return (
    <div className="markets-table-wrap">
      <table className="markets-table">
        <thead>
          <tr>
            <th className="col-watch"></th>
            <th className="col-pair">PAIR / AGE</th>
            <th className="col-right">PRICE</th>
            <th className="col-right">MC</th>
            <th className="col-right col-hide-sm">LIQ / INIT</th>
            <th className="col-center col-hide-sm">RISK</th>
            <th className="col-center col-hide-md">SMART</th>
            <th className="col-right">24H VOL</th>
            <th className="col-right col-hide-sm">24H ACT</th>
            <th className="col-right col-hide-md">HOLDERS</th>
            <th className="col-right col-hide-sm">1M%</th>
            <th className="col-right">24H%</th>
            <th className="col-center col-hide-md">TOP10</th>
            <th className="col-center col-hide-lg">SEC</th>
            <th className="col-action"></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => (
            <MarketRow
              key={`${t.chainId}-${t.address}-${i}`}
              token={t}
              rank={page * perPage + i + 1}
              onClick={() => onClickToken(t)}
              isWatched={watchedAddresses.has(t.address)}
              onToggleWatch={() => onToggleWatch(t)}
              onQuickBuy={() => onQuickBuy(t)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}