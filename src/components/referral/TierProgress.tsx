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
    <div style={{ padding: 8 }}>
      {/* Tier milestones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        {REFERRAL_TIERS.map((t, i) => {
          const isActive = i <= currentIdx;
          const isCurrent = t.name === currentTier.name;
          return (
            <div key={t.name} style={{ textAlign: 'center', flex: 1 }}>
              <div style={{
                fontSize: 8, fontWeight: 800, letterSpacing: '0.05em',
                color: isCurrent ? 'var(--amber)' : isActive ? 'var(--green)' : 'var(--text-dim)',
              }}>{t.name}</div>
              <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>{t.sharePct}%</div>
            </div>
          );
        })}
      </div>
      {/* Progress bar */}
      <div style={{ height: 8, background: 'var(--border)', position: 'relative', overflow: 'hidden', margin: '4px 0' }}>
        {/* Milestones */}
        {REFERRAL_TIERS.map((t, i) => {
          const pos = nextTier
            ? ((t.minVolume - currentTier.minVolume) / (nextTier.minVolume - currentTier.minVolume)) * 100
            : 100;
          return (
            <div key={t.name} style={{
              position: 'absolute', left: `${Math.min(100, pos)}%`, top: 0, bottom: 0,
              width: 1, background: 'var(--border-bright)', zIndex: 1,
            }} />
          );
        })}
        {/* Fill */}
        <div style={{
          width: `${Math.min(100, progressPct)}%`, height: '100%',
          background: currentTier.sharePct >= 30 ? 'var(--amber)' : 'var(--cyan)',
          transition: 'width 0.5s',
        }} />
      </div>
      {/* Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-dim)' }}>
        <span>{formatUsd(rollingVolume30d)} QUALIFIED</span>
        {nextTier ? (
          <span>{formatUsd(nextTier.minVolume - rollingVolume30d)} TO {nextTier.name}</span>
        ) : (
          <span style={{ color: 'var(--amber)' }}>MAX TIER REACHED</span>
        )}
      </div>
    </div>
  );
}