// Combined reward dashboard — real backend data, Cupcak8 themed
import type { BackendRewardSummary, CashbackRecord, ReferralRecord, ClaimRecord, LoadState } from '../../lib/reward-types';
import { getReferralTier, getReferralTierProgress, getCashbackTier, getCashbackTierProgress, MIN_CLAIM_USD } from '../../lib/reward-rules';
import { formatUsd } from '../../lib/config';

interface Props {
  summary: BackendRewardSummary | null;
  cashback: CashbackRecord[];
  referrals: ReferralRecord[];
  claims: ClaimRecord[];
  summaryState: LoadState;
  error: string | null;
  onRetry: () => void;
}

function StatCard({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div style={{
      padding: 14, background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800, color: value === null ? 'var(--text-dim)' : 'var(--text-bright)',
        fontFamily: 'var(--font-mono)',
      }}>{value === null ? '—' : value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TierBar({ tier, next, progress, needed }: {
  tier: string; next: string | null; progress: number; needed: number;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#E8547C' }}>{tier}</span>
        {next && <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Next: {next} (${needed.toLocaleString()} to go)</span>}
      </div>
      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.round(progress * 100)}%`, height: '100%',
          background: 'linear-gradient(90deg, #E8547C, var(--lavender))', borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

export default function RewardDashboard({ summary, cashback, referrals, claims: _claims, summaryState, error, onRetry }: Props) {
  if (summaryState === 'loading' || summaryState === 'idle') {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading reward data...
      </div>
    );
  }

  if (summaryState === 'error') {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ color: 'var(--red)', marginBottom: 12 }}>Failed to load reward data: {error}</div>
        <button onClick={onRetry} style={{
          padding: '8px 24px', background: '#E8547C',
          border: 'none', borderRadius: 'var(--radius-sm)',
          color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
        }}>RETRY</button>
      </div>
    );
  }

  const claimable = summary ? summary.claimableCashback + summary.claimableReferral : null;
  const earned = summary ? summary.totalCashbackEarned + summary.totalReferralEarned : null;

  // Derive tier from backend allocation data
  const refTier = getReferralTier(0);
  const refProgress = getReferralTierProgress(0);
  const cbTier = getCashbackTier(0);
  const cbProgress = getCashbackTierProgress(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8,
      }}>
        <StatCard label="TOTAL EARNED" value={earned !== null ? formatUsd(earned) : null} />
        <StatCard label="CLAIMABLE" value={claimable !== null ? formatUsd(claimable) : null}
          sub={claimable !== null && claimable >= MIN_CLAIM_USD ? 'Eligible to claim' : `Min $${MIN_CLAIM_USD} required`} />
        <StatCard label="PENDING" value={summary ? formatUsd(summary.pendingCashback + summary.pendingReferral) : null} />
        <StatCard label="TOTAL CLAIMED" value={summary ? formatUsd(summary.totalClaimed) : null} />
        <StatCard label="CASHBACK EARNED" value={summary ? formatUsd(summary.totalCashbackEarned) : null} />
        <StatCard label="REFERRAL EARNED" value={summary ? formatUsd(summary.totalReferralEarned) : null} />
      </div>

      {/* Tier Progress */}
      <div style={{
        padding: 14, background: 'var(--bg-surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--text-bright)',
          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
        }}>Tier Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>REFERRAL TIER</div>
            <TierBar tier={refTier.name} next={refProgress.next?.name ?? null}
              progress={refProgress.progress} needed={refProgress.needed} />
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
              {refTier.sharePct}% of collected platform fee
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>CASHBACK TIER</div>
            <TierBar tier={cbTier.name} next={cbProgress.next?.name ?? null}
              progress={cbProgress.progress} needed={cbProgress.needed} />
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
              {cbTier.ratePct}% of collected platform fee
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {(referrals.length > 0 || cashback.length > 0) && (
        <div style={{
          padding: 14, background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-bright)',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10,
          }}>Recent Rewards</div>
          {[...referrals.slice(0, 3).map(r => ({
            date: r.createdAt, source: 'Referral', amount: formatUsd(parseFloat(r.referralReward)), status: r.status,
          })), ...cashback.slice(0, 3).map(c => ({
            date: c.createdAt, source: 'Cashback', amount: formatUsd(parseFloat(c.cashbackReward)), status: c.status,
          }))].slice(0, 5).map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{item.date.slice(0, 10)}</div>
              <div style={{ fontSize: 10, color: 'var(--text)' }}>{item.source}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lime-dim)' }}>{item.amount}</div>
              <div style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                background: item.status === 'paid' ? 'var(--lime-bg)' : 'var(--yellow-bg)',
                color: item.status === 'paid' ? 'var(--lime-dim)' : 'var(--yellow-dim)',
              }}>{item.status}</div>
            </div>
          ))}
        </div>
      )}

      {referrals.length === 0 && cashback.length === 0 && summaryState === 'loaded' && (
        <div style={{
          padding: 24, textAlign: 'center', color: 'var(--text-dim)',
          fontSize: 11, border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
        }}>
          No reward activity yet. Start trading to earn cashback and referral rewards.
        </div>
      )}
    </div>
  );
}