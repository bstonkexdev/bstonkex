// Cupcak8 Swap Reward Overview — Cupcak8 pink themed
import { formatUsd } from '../../lib/config';
import type { UnifiedRewardSummary } from '../../lib/rewards';

interface Props {
  summary: UnifiedRewardSummary;
}

export default function RewardOverview({ summary }: Props) {
  const { referralProfile, cashbackPolicy } = summary;
  const tier = referralProfile?.currentTier;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Combined Claimable */}
      <div className="ref-card" style={{
        background: summary.combinedClaimable > 0
          ? 'linear-gradient(135deg, rgba(232,84,124,0.06), rgba(184,169,232,0.06))'
          : undefined,
      }}>
        <div className="ref-card-header">COMBINED CLAIMABLE</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: summary.combinedClaimable > 0 ? '#E8547C' : 'var(--text-bright)' }}>
          {formatUsd(summary.combinedClaimable)}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
          Minimum claim: $10. Ledger-settled — no wallet transfer.
        </div>
      </div>

      {/* Reward Sources */}
      <div className="ref-card-grid">
        <div className="ref-card">
          <div className="ref-card-header">REFERRAL REWARDS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#E8547C' }}>
            {formatUsd(summary.referralRewards)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
            Share of platform fees from referred traders
          </div>
        </div>

        <div className="ref-card">
          <div className="ref-card-header">CASHBACK EARNED</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: cashbackPolicy.enabled ? 'var(--lavender)' : 'var(--text-dim)' }}>
            {cashbackPolicy.enabled ? formatUsd(summary.cashbackEarned) : 'DISABLED'}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
            {cashbackPolicy.enabled
              ? `${(cashbackPolicy.rateBps / 100).toFixed(1)}% of platform fees returned`
              : 'Cashback not yet configured by admin'}
          </div>
        </div>

        <div className="ref-card">
          <div className="ref-card-header">PENDING</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-bright)' }}>
            {formatUsd(summary.pendingRewards)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>
            Below claim threshold, accumulating
          </div>
        </div>
      </div>

      {/* Referral Tier */}
      {tier && (
        <div className="ref-card">
          <div className="ref-card-header">REFERRAL TIER</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: '#E8547C' }}>{tier.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tier.sharePct}% of platform fees</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
            30-day qualified volume: {formatUsd(summary.rollingVolume30d)}
          </div>
          {summary.referralProfile?.nextTier && (
            <div style={{ fontSize: 9, color: 'var(--lavender)', marginTop: 2 }}>
              Next: {summary.referralProfile.nextTier.name} at {formatUsd(summary.referralProfile.nextTier.minVolume)} — {formatUsd(summary.referralProfile.amountToNextTier)} to go
            </div>
          )}
        </div>
      )}

      {/* Cashback Status */}
      <div className="ref-card">
        <div className="ref-card-header">CASHBACK STATUS</div>
        {cashbackPolicy.enabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: 'var(--text-dim)' }}>Rate</span>
              <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{(cashbackPolicy.rateBps / 100).toFixed(2)}% of platform fee</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: 'var(--text-dim)' }}>Eligible Fee</span>
              <span style={{ color: 'var(--text-bright)' }}>{cashbackPolicy.eligibleFeeField}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: 'var(--text-dim)' }}>Claim Minimum</span>
              <span style={{ color: 'var(--text-bright)' }}>${cashbackPolicy.claimMinimum}</span>
            </div>
            {cashbackPolicy.exclusions.length > 0 && (
              <div style={{ fontSize: 9, color: 'var(--yellow-dim)', marginTop: 2 }}>
                Excluded: {cashbackPolicy.exclusions.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Cashback is not active. An administrator must configure and enable the cashback policy.
            No cashback rewards are being accrued.
          </div>
        )}
      </div>
    </div>
  );
}