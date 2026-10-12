// Cupcak8 Swap — Market Overview Stats Bar
// Vanilla cream bar with pixel font labels, pink accent values
import { memo } from 'react';
import type { MarketToken } from '../../lib/market-discovery';

interface Props {
  tokens: MarketToken[];
  loading: boolean;
}

export default memo(function MarketOverview({ tokens, loading }: Props) {
  const total = tokens.length;
  const vol24h = tokens.reduce((s, t) => s + (t.volume24h ?? 0), 0);
  const active = tokens.filter(t => t.dataFreshness === 'live').length;
  const newCount = tokens.filter(t => t.ageMs < 24 * 60 * 60 * 1000).length;
  const totalLiq = tokens.reduce((s, t) => s + (t.liquidity ?? 0), 0);
  const gainers = tokens.filter(t => (t.priceChange24h ?? 0) > 0).length;
  const losers = tokens.filter(t => (t.priceChange24h ?? 0) < 0).length;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '10px 16px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)', overflowX: 'auto', flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.08em', flexShrink: 0, fontFamily: 'var(--font-mono)',
      }}>
        OVERVIEW
      </span>
      <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
        <Stat label="Markets" value={loading ? '...' : String(total)} />
        <Stat label="24H Volume" value={loading ? '...' : formatCompact(vol24h)} accent />
        <Stat label="Live" value={loading ? '...' : String(active)} />
        <Stat label="New 24H" value={loading ? '...' : String(newCount)} />
        <Stat label="Liquidity" value={loading ? '...' : formatCompact(totalLiq)} />
        <Stat label="↑ Gainers" value={loading ? '...' : String(gainers)} positive />
        <Stat label="↓ Losers" value={loading ? '...' : String(losers)} negative />
      </div>
    </div>
  );
});

function Stat({ label, value, accent, positive, negative }: {
  label: string; value: string; accent?: boolean; positive?: boolean; negative?: boolean;
}) {
  const color = accent ? '#E8547C' : positive ? 'var(--lime-dim)' : negative ? 'var(--red)' : 'var(--text-bright)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}