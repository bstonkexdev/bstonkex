interface Props {
  ratio: number | null;
}

export default function BuySellBar({ ratio }: Props) {
  if (ratio == null) return <span style={{ fontSize: 7, color: 'var(--text-dim)' }}>N/A</span>;
  const greenPct = Math.min(100, Math.max(0, (ratio / (ratio + 1)) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: 48 }}>
      <div style={{
        flex: 1, height: 3,
        background: 'var(--border)',
        display: 'flex', overflow: 'hidden',
      }}>
        <div style={{ width: `${greenPct}%`, background: 'var(--green)' }} />
        <div style={{ flex: 1, background: 'var(--red)' }} />
      </div>
      <span style={{ fontSize: 7, color: 'var(--text-dim)', minWidth: 22, textAlign: 'right' }}>
        {ratio.toFixed(1)}
      </span>
    </div>
  );
}