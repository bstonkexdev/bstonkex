// Cupcak8 Swap — Tier Progress Bar
import { REFERRAL_TIERS, formatUsd } from '../../lib/config';
import type { ReferralTier } from '../../lib/config';

interface Props {
  currentTier: ReferralTier;
  nextTier: ReferralTier | null;
  rollingVolume30d: number;
}

export default function TierProgress({ currentTier, nextTier, rollingVolume30d }: Props) {
  const currentIdx = REFERRAL_TIERS.findIndex(t => t.name === currentTier.name);
  const progressPct = nextTier
    ? Math.min(100, ((rollingVolume30d - currentTier.minVolume) / (nextTier.minVolume - currentTier.minVolume)) * 100)
    : 100;

  return (
    <div>
      {/* Tier milestones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        {REFERRAL_TIERS.map((t, i) => {
          const isActive = i <= currentIdx;
          const isCurrent = t.name === currentTier.name;
          return (
            <div key={t.name} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
                color: isCurrent ? '#E8547C' : isActive ? 'var(--lime-dim)' : 'var(--text-dim)',
              }}>{t.name}</div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{t.sharePct}%</div>
            </div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div className="ref-tier-bar">
        {REFERRAL_TIERS.map((t) => {
          const pos = nextTier
            ? ((t.minVolume - currentTier.minVolume) / (nextTier.minVolume - currentTier.minVolume)) * 100
            : 100;
          return (
            <div key={t.name} className="ref-tier-milestone" style={{ left: `${Math.min(100, pos)}%` }} />
          );
        })}
        <div className="ref-tier-fill" style={{
          width: `${Math.min(100, progressPct)}%`,
          background: 'linear-gradient(90deg, #E8547C, var(--lavender))',
        }} />
      </div>
      {/* Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)' }}>
        <span>{formatUsd(rollingVolume30d)} QUALIFIED</span>
        {nextTier ? (
          <span>{formatUsd(nextTier.minVolume - rollingVolume30d)} TO {nextTier.name}</span>
        ) : (
          <span style={{ color: 'var(--yellow-dim)' }}>MAX TIER REACHED</span>
        )}
      </div>
    </div>
  );
}