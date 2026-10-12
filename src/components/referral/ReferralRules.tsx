import { PLATFORM_FEE_PCT, REFERRAL_TIERS, MIN_CLAIM_AMOUNT, REFERRAL_ROLLING_DAYS } from '../../lib/config';
import type { ReferralTier } from '../../lib/config';

interface Props {
  currentTier: ReferralTier;
}

export default function ReferralRules({ currentTier }: Props) {
  return (
    <div className="ref-card">
      <div className="ref-card-header">RULES &amp; HELP</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7 }}>
        <div>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>Permanent binding.</span>{' '}
          Your referral link is permanent. Once a trader is referred by you, that relationship cannot be changed.
          Self-referrals are not allowed.
        </div>
        <div>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>Rolling {REFERRAL_ROLLING_DAYS}-day volume.</span>{' '}
          Your tier is based on combined qualified trading volume from your referred traders
          over the last {REFERRAL_ROLLING_DAYS} days. Volume that falls outside this window no longer counts toward your tier.
        </div>
        <div>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>Fee-based rewards.</span>{' '}
          You earn {currentTier.sharePct}% of the Cupcak8 Swap platform fee ({(PLATFORM_FEE_PCT * 100).toFixed(2)}%)
          on trades made by your referred traders. You do not earn from the trade principal — only from the eligible platform fee.
        </div>
        <div>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>Minimum claim: ${MIN_CLAIM_AMOUNT}.</span>{' '}
          Accumulated claimable rewards must reach the ${MIN_CLAIM_AMOUNT} minimum before you can claim.
          Pending rewards below this threshold continue to accumulate.
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>Tier rates:</span>
        </div>
        {REFERRAL_TIERS.map((t, i) => (
          <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontWeight: 700, color: currentTier.name === t.name ? '#E8547C' : 'var(--text)' }}>{t.name}</span>
            <span>${t.minVolume.toLocaleString()}{t.maxVolume ? ` — $${t.maxVolume.toLocaleString()}` : '+'}</span>
            <span style={{ fontWeight: 700, color: 'var(--lime-dim)' }}>{t.sharePct}%</span>
          </div>
        ))}
        <div style={{ marginTop: 4 }}>
          <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>What does NOT count:</span>{' '}
          Failed transactions, ordinary transfers, and non-fee-generating activity are excluded from qualified volume.
          Only verified, eligible trading activity with a paid Cupcak8 Swap platform fee contributes.
        </div>
      </div>
    </div>
  );
}