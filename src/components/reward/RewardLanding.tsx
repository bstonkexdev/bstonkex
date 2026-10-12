// Cupcak8 Swap Rewards Center — real backend data via AuthGate + RewardDashboard
// Cupcak8 pink themed with mascot
import { useRewards } from '../../lib/useRewards';
import AuthGate from './AuthGate';
import RewardDashboard from './RewardDashboard';
import ClaimPanel from './ClaimPanel';
import MascotLogo from '../MascotLogo';

interface Props {
  onOpenReferral: () => void;
  onOpenCashback: () => void;
}

export default function RewardLanding({ onOpenReferral, onOpenCashback }: Props) {
  const rewards = useRewards();

  return (
    <div className="ref-page">
      <div className="ref-section">
        {/* Header with mascot */}
        <div className="ref-header">
          <MascotLogo size={36} color="#E8547C" />
          <div className="ref-title" style={{ marginTop: 8 }}>REFERRAL & CASHBACK</div>
          <div className="ref-subtitle">Invite friends, trade together, and earn rewards</div>
        </div>

        {/* Auth Gate or Dashboard */}
        {rewards.authState === 'unauthenticated' ? (
          <AuthGate onAuthSuccess={rewards.onAuthSuccess} />
        ) : (
          <>
            {/* Real Backend Dashboard */}
            <RewardDashboard
              summary={rewards.summary}
              cashback={rewards.cashback}
              referrals={rewards.referrals}
              claims={rewards.claims}
              summaryState={rewards.summaryState}
              error={rewards.error}
              onRetry={rewards.loadAll}
            />

            {/* Claim Panel */}
            <div style={{ marginTop: 16 }}>
              <ClaimPanel
                summary={rewards.summary}
                claims={rewards.claims}
                onClaimSubmitted={() => { rewards.loadSummary(); rewards.loadClaims(); }}
              />
            </div>

            {/* Logout */}
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                onClick={rewards.logout}
                style={{
                  padding: '6px 16px', background: 'none', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer',
                }}
              >
                Disconnect Wallet
              </button>
            </div>
          </>
        )}

        {/* Entry Cards — always visible */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
          margin: '24px 0',
        }}>
          <button
            onClick={onOpenReferral}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 10, padding: '28px 16px',
              background: 'linear-gradient(135deg, rgba(232,84,124,0.06) 0%, rgba(184,169,232,0.06) 100%)',
              border: '1px solid rgba(232,84,124,0.15)',
              borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center',
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#E8547C'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(232,84,124,0.15)'}
          >
            <div style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 0 6px rgba(232,84,124,0.3))' }}>
              <span style={{ fontFamily: 'var(--font-pixel, var(--font))' }}>{'>'}o{'>'}  o{'<'}{'<'}</span>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: '#E8547C',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              fontFamily: 'var(--font-pixel, var(--font))',
            }}>REFERRAL</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>Earn from your community.</div>
            <div style={{
              marginTop: 6, padding: '6px 18px',
              background: 'rgba(232,84,124,0.08)', border: '1px solid #E8547C',
              borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 800, color: '#E8547C',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>OPEN REFERRAL</div>
          </button>

          <button
            onClick={onOpenCashback}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 10, padding: '28px 16px',
              background: 'linear-gradient(135deg, rgba(184,169,232,0.06) 0%, rgba(232,84,124,0.06) 100%)',
              border: '1px solid rgba(184,169,232,0.15)',
              borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center',
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--lavender)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(184,169,232,0.15)'}
          >
            <div style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 0 6px rgba(184,169,232,0.3))' }}>
              <span style={{ fontFamily: 'var(--font-pixel, var(--font))' }}>[C$]</span>
            </div>
            <div style={{
              fontSize: 14, fontWeight: 900, color: 'var(--lavender)',
              letterSpacing: '0.15em', textTransform: 'uppercase',
              fontFamily: 'var(--font-pixel, var(--font))',
            }}>CASHBACK</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>Earn from your own trading.</div>
            <div style={{
              marginTop: 6, padding: '6px 18px',
              background: 'rgba(184,169,232,0.08)', border: '1px solid var(--lavender)',
              borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 800, color: 'var(--lavender)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>OPEN CASHBACK</div>
          </button>
        </div>

        {/* HOW IT WORKS */}
        <div style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          background: 'var(--bg-surface)', overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 800, color: 'var(--text-bright)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>How It Works</div>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 800, color: '#E8547C',
                letterSpacing: '0.06em', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontFamily: 'var(--font-pixel, var(--font))' }}>{'>'}o{'>'}</span>
                Referral Rewards
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7 }}>
                Share your referral link and earn a percentage of eligible platform fees generated
                by qualified traders you refer. Tier: Starter 10%, Builder 20%, Pro 30%, Elite 35%
                — based on rolling 30-day referred volume.
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--lavender)',
                letterSpacing: '0.06em', marginBottom: 6,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontFamily: 'var(--font-pixel, var(--font))' }}>[C$]</span>
                Cashback Rewards
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7 }}>
                Earn cashback from your own qualified trading volume each UTC calendar month.
                Tier: Novice 5%, Advanced 7.5%, Pro 10%, Elite 12.5%, Legend 15%.
                Volume resets monthly; lifetime earnings persist.
              </div>
            </div>
          </div>
        </div>

        {/* Disclosure */}
        <div style={{
          marginTop: 16, padding: '12px 14px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)',
          fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, textAlign: 'center',
        }}>
          Referral and cashback rewards are calculated from eligible collected Cupcak8 Swap platform
          fees, not directly from trade principal. Combined allocation capped at 50% of collected fee.
          Minimum claim: $10. Eligibility rules apply.
        </div>
      </div>
    </div>
  );
}