import type { MarketToken } from '../../lib/market-discovery';

interface Props {
  freshness: MarketToken['dataFreshness'];
  liquidity: number | null;
  volume: number | null;
}

export default function MarketHealth({ freshness, liquidity, volume }: Props) {
  const liqOk = liquidity != null && liquidity > 1000;
  const volOk = volume != null && volume > 100;
  const fresh = freshness === 'live';

  const overall = fresh && liqOk && volOk ? 'good'
    : freshness === 'stale' || (!liqOk && !volOk) ? 'stale'
    : 'warning';

  const color = overall === 'good' ? 'var(--green)' : overall === 'stale' ? 'var(--red)' : 'var(--amber)';
  const label = overall === 'good' ? 'GOOD' : overall === 'stale' ? 'STALE' : 'WARN';

  return (
    <span style={{
      fontSize: 6,
      fontWeight: 700,
      padding: '1px 3px',
      border: `1px solid ${color}40`,
      color,
      letterSpacing: '0.04em',
      lineHeight: 1.3,
    }}>
      {label}
    </span>
  );
}