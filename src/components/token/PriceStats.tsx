// Cupcak8 Swap — Compact two-column price + market statistics (real data, honest N/A)
import { formatUsd, formatPct, formatNum, formatPrice } from '../../lib/config';
import { NA } from '../../lib/token-page-data';

export type DataStatus = 'LIVE' | 'DELAYED' | 'DATA DELAYED' | 'DATA UNAVAILABLE';

interface Props {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  txns24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  high24h: number | null;
  low24h: number | null;
  dataStatus: DataStatus;
  priceSource?: 'bonding_curve' | 'dex_pair' | 'none';
  marketState?: string;
  virtualLiquidity?: number | null;
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="ps-row">
      <span className="ps-label">{label}</span>
      <span className="ps-value" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

function PriceSourceBadge({ source, marketState }: { source: Props['priceSource']; marketState?: string }) {
  if (source === 'dex_pair' && !marketState) return null;
  const labels: Record<string, string> = {
    bonding_curve: 'BONDING CURVE',
    dex_pair: marketState === 'launched' ? 'LIVE DEX' : 'DEX',
    none: 'UNAVAILABLE',
  };
  const colors: Record<string, string> = {
    bonding_curve: 'var(--cyan, #0088FF)',
    dex_pair: 'var(--green)',
    none: 'var(--text-muted)',
  };
  const s = source ?? 'none';
  return (
    <span className="thb-chip" style={{ color: colors[s], borderColor: colors[s], fontSize: 7 }}>
      {labels[s]}
    </span>
  );
}

export default function PriceStats({
  price, change24h, marketCap, volume24h, txns24h, buys24h, sells24h, high24h, low24h, dataStatus,
  priceSource, marketState, virtualLiquidity,
}: Props) {
  const up = change24h != null && change24h >= 0;
  const statusColor =
    dataStatus === 'LIVE' ? 'var(--green)' :
    dataStatus === 'DATA UNAVAILABLE' ? 'var(--red)' : 'var(--amber, #FFD700)';
  const showPrice = price != null && isFinite(price);

  return (
    <div className="price-stats">
      {/* Left: price + change */}
      <div className="price-stats-left">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="ps-price">
            {showPrice ? formatUsd(price) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Price unavailable</span>}
          </span>
          <span className="ps-change" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
            {change24h != null && isFinite(change24h) ? formatPct(change24h) : NA}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span className="thb-chip" style={{ color: statusColor, borderColor: statusColor }}>
            {dataStatus}
          </span>
          <PriceSourceBadge source={priceSource} marketState={marketState} />
          {price != null && price > 0 && price < 0.01 && (
            <span className="thb-chip">{formatPrice(price)}</span>
          )}
          {virtualLiquidity != null && (
            <span className="thb-chip" style={{ color: 'var(--text-muted)' }}>
              V-LIQ {formatUsd(virtualLiquidity)}
            </span>
          )}
        </div>
      </div>

      {/* Right: market statistics */}
      <div className="price-stats-grid">
        <StatRow label="MARKET CAP" value={marketCap != null ? formatUsd(marketCap) : NA} />
        <StatRow label="VOLUME 24H" value={volume24h != null ? formatUsd(volume24h) : NA} />
        <StatRow label="TXNS 24H" value={txns24h != null ? formatNum(txns24h) : NA} />
        <StatRow label="BUYS / SELLS"
          value={buys24h != null || sells24h != null ? `${formatNum(buys24h)} / ${formatNum(sells24h)}` : NA} />
        <StatRow label="24H HIGH" value={high24h != null ? formatUsd(high24h) : NA} />
        <StatRow label="24H LOW" value={low24h != null ? formatUsd(low24h) : NA} />
      </div>
    </div>
  );
}
