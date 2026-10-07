// BSTONKEX — Mini sparkline (real data only, no fakes)
// Currently a placeholder that shows available price change data as a visual indicator.
// A real sparkline requires historical OHLCV data per token, which is not available
// from the DexScreener discovery endpoint. This shows a compact bar instead.

import type { MarketToken } from '../../lib/market-discovery';

interface Props {
  token: MarketToken;
}

export default function MiniSparkline({ token }: Props) {
  // Use available price change data to create a mini visualization
  const changes = [
    token.priceChange5m,
    token.priceChange1h,
    token.priceChange6h,
    token.priceChange24h,
  ];

  // If no data at all, show placeholder
  const hasData = changes.some(c => c != null);
  if (!hasData) {
    return (
      <div style={{
        width: 48, height: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, color: 'var(--text-muted)',
      }}>
        NO DATA
      </div>
    );
  }

  // Normalize values to bar heights
  const maxAbs = Math.max(...changes.filter(c => c != null).map(c => Math.abs(c!)), 0.01);

  return (
    <div style={{
      width: 48, height: 16,
      display: 'flex', alignItems: 'flex-end', gap: 1,
    }}>
      {changes.map((c, i) => {
        if (c == null) return <div key={i} style={{ flex: 1, height: 1, background: 'var(--border)' }} />;
        const normalized = (Math.abs(c) / maxAbs) * 14;
        const color = c >= 0 ? 'var(--green)' : 'var(--red)';
        return (
          <div key={i} style={{
            flex: 1,
            height: Math.max(1, normalized),
            background: `${color}60`,
            borderRadius: 1,
          }} />
        );
      })}
    </div>
  );
}