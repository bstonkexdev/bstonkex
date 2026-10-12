// Cupcak8 Swap — Horizontally scrollable metadata badges.
// Only verified fields are passed in; the component never invents values.

export interface MetaBadge {
  label: string;
  value: string;
  tone?: 'green' | 'amber' | 'red' | 'cyan' | 'dim';
  title?: string;
}

const TONE: Record<string, string> = {
  green: 'var(--green)',
  amber: 'var(--amber, #FFD700)',
  red: 'var(--red)',
  cyan: 'var(--cyan, #0088FF)',
  dim: 'var(--text-dim)',
};

export default function MetaBadges({ badges }: { badges: MetaBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="meta-badges" role="list" aria-label="Token metadata">
      {badges.map((b, i) => (
        <span
          key={`${b.label}-${i}`}
          role="listitem"
          className="meta-badge"
          title={b.title || `${b.label}: ${b.value}`}
          style={b.tone ? { color: TONE[b.tone], borderColor: TONE[b.tone] } : undefined}
        >
          <span className="meta-badge-label">{b.label}</span>
          <span className="meta-badge-value">{b.value}</span>
        </span>
      ))}
    </div>
  );
}
