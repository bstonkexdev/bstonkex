// Cupcak8 Swap Cashback Tab — Cupcak8 pink themed
import { formatUsd } from '../../lib/config';
import type { CashbackPolicy } from '../../lib/engine/cashback-engine';

interface Props {
  policy: CashbackPolicy;
  cashbackEarned: number;
  cashbackClaimable: number;
  cashbackPending: number;
  cashbackClaimed: number;
  onClaim: () => void;
}

export default function CashbackTab({
  policy, cashbackEarned, cashbackClaimable, cashbackPending, cashbackClaimed, onClaim,
}: Props) {
  if (!policy.enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="ref-card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 16, color: 'var(--text-dim)', marginBottom: 8 }}>CASHBACK</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-dim)', marginBottom: 8 }}>
            NOT ACTIVE
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
            Cashback is disabled. An authorized administrator must configure and enable the
            cashback policy before rewards can accrue. No cashback is being earned on your trades.
          </div>
        </div>

        <div className="ref-card">
          <div className="ref-card-header">HOW CASHBACK WORKS</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>When enabled, cashback returns a percentage of the Cupcak8 Swap platform fee back to you on eligible trades.</div>
            <div>Cashback is calculated from the platform fee (0.40% of trade value), not from the trade principal.</div>
            <div>Cashback and referral rewards are separate — they do not double-allocate from the same fee.</div>
            <div>Cashback requires a minimum claim amount before settlement.</div>
            <div style={{ color: 'var(--yellow-dim)' }}>Settlement is ledger-only. No funds are transferred to your wallet.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats */}
      <div className="ref-card-grid">
        <div className="ref-card">
          <div className="ref-card-header">TOTAL CASHBACK</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#E8547C' }}>
            {formatUsd(cashbackEarned)}
          </div>
        </div>
        <div className="ref-card">
          <div className="ref-card-header">CLAIMABLE</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: cashbackClaimable > 0 ? 'var(--lime-dim)' : 'var(--text-bright)' }}>
            {formatUsd(cashbackClaimable)}
          </div>
        </div>
        <div className="ref-card">
          <div className="ref-card-header">PENDING</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-bright)' }}>
            {formatUsd(cashbackPending)}
          </div>
        </div>
        <div className="ref-card">
          <div className="ref-card-header">CLAIMED</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-bright)' }}>
            {formatUsd(cashbackClaimed)}
          </div>
        </div>
      </div>

      {/* Policy Details */}
      <div className="ref-card">
        <div className="ref-card-header">ACTIVE POLICY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Cashback Rate</span>
            <span style={{ color: '#E8547C', fontWeight: 700 }}>{(policy.rateBps / 100).toFixed(2)}% of platform fee</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Eligible Fee</span>
            <span style={{ color: 'var(--text-bright)' }}>{policy.eligibleFeeField}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Claim Minimum</span>
            <span style={{ color: 'var(--text-bright)' }}>${policy.claimMinimum}</span>
          </div>
          {policy.exclusions.length > 0 && (
            <div style={{ color: 'var(--yellow-dim)', marginTop: 2 }}>
              Excluded: {policy.exclusions.join(', ')}
            </div>
          )}
          <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
            Last updated: {policy.lastUpdated ? new Date(policy.lastUpdated).toLocaleString() : 'N/A'}
          </div>
        </div>
      </div>

      {/* Claim */}
      {cashbackClaimable >= policy.claimMinimum && (
        <div className="ref-card">
          <div className="ref-card-header">CLAIM CASHBACK</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
            Claimable: {formatUsd(cashbackClaimable)}. Ledger-settled — no wallet transfer.
          </div>
          <button className="btn btn-full btn-pink" onClick={onClaim}>
            Claim {formatUsd(cashbackClaimable)}
          </button>
        </div>
      )}

      {/* Info */}
      <div className="ref-card">
        <div className="ref-card-header">HOW CASHBACK WORKS</div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          You earn {(policy.rateBps / 100).toFixed(2)}% of the Cupcak8 Swap platform fee (0.40% of trade value)
          back as cashback on eligible trades. Cashback is separate from referral rewards and does not
          reduce your referral earnings. Settlement is ledger-only.
        </div>
      </div>
    </div>
  );
}