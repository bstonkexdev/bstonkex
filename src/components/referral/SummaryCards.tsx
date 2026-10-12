import { formatUsd } from '../../lib/config';
import type { ReferralProfile } from '../../lib/referral';

interface Props {
  profile: ReferralProfile;
}

export default function SummaryCards({ profile }: Props) {
  const tier = profile.currentTier;
  return (
    <div className="ref-card-grid">
      <div className="ref-stat-card">
        <span className="ref-stat-label">YOUR TIER</span>
        <span className="ref-stat-value" style={{ color: tier.sharePct >= 30 ? 'var(--yellow-dim)' : '#E8547C' }}>
          {tier.name} — {tier.sharePct}%
        </span>
      </div>
      <div className="ref-stat-card">
        <span className="ref-stat-label">30-DAY VOL</span>
        <span className="ref-stat-value">{formatUsd(profile.rollingVolume30d)}</span>
      </div>
      <div className="ref-stat-card">
        <span className="ref-stat-label">CLAIMABLE</span>
        <span className="ref-stat-value" style={{ color: profile.claimableRewards > 0 ? '#E8547C' : 'var(--text)' }}>
          {formatUsd(profile.claimableRewards)}
        </span>
      </div>
      <div className="ref-stat-card">
        <span className="ref-stat-label">TOTAL EARNED</span>
        <span className="ref-stat-value">{formatUsd(profile.totalEarned)}</span>
      </div>
      <div className="ref-stat-card">
        <span className="ref-stat-label">PENDING</span>
        <span className="ref-stat-value">{formatUsd(profile.pendingRewards)}</span>
      </div>
      <div className="ref-stat-card">
        <span className="ref-stat-label">REFERRALS</span>
        <span className="ref-stat-value">{profile.totalReferrals}</span>
      </div>
    </div>
  );
}