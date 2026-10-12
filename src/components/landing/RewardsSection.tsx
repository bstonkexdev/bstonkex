// Cupcak8 — Rewards & Referral Section
import { useApp } from '../../lib/context';

export default function RewardsSection() {
  const { setPage } = useApp();
  return (
    <section style={{
      padding: '48px 24px', background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF5EB 100%)',
      borderBottom: '2px solid var(--border)',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
        <span style={{
          fontFamily: 'var(--font-pixel)', fontSize: 10, color: '#FFD966',
          background: 'rgba(255,217,102,0.12)', padding: '4px 12px', borderRadius: 20,
          display: 'inline-block', marginBottom: 16,
        }}>★ EARN REWARDS</span>
        <h2 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
          marginBottom: 12, letterSpacing: '0.04em',
        }}>Trade Together. Earn Rewards.</h2>
        <p style={{
          fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 24, maxWidth: 480, margin: '0 auto 24px',
        }}>
          Invite friends, earn cashback on trading fees, and climb reward tiers as you trade across chains.
        </p>
        <button onClick={() => setPage('reward')} style={{
          padding: '12px 28px', background: '#FFD966', border: 'none',
          borderRadius: 'var(--radius)', color: '#3D2B1F', fontSize: 13, fontWeight: 800,
          cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
          fontFamily: 'var(--font-mono)', transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#F5C842'}
          onMouseLeave={e => e.currentTarget.style.background = '#FFD966'}
        >View Rewards</button>
      </div>
    </section>
  );
}