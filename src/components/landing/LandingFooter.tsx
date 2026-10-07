// BSTONKEX — Minimal landing footer
import { CONFIGURED_CHAINS } from '../../lib/config';
import { useApp } from '../../lib/context';

export default function LandingFooter() {
  const { setPage } = useApp();

  const navItems = [
    { label: 'Markets', page: 'markets' as const },
    { label: 'Trade', page: 'trade' as const },
    { label: 'Activity', page: 'activity' as const },
    { label: 'Portfolio', page: 'portfolio' as const },
    { label: 'Referrals', page: 'referrals' as const },
    { label: 'Watchlist', page: 'watchlist' as const },
  ];

  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-panel)',
      padding: '16px 16px 12px',
    }}>
      {/* Top row */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap',
        marginBottom: 16,
      }}>
        {/* Brand */}
        <div>
          <div style={{
            fontSize: 13, fontWeight: 900, color: 'var(--text-bright)',
            letterSpacing: '0.15em', marginBottom: 4,
          }}>
            BSTONKEX
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Multi-Chain Digital Asset Exchange<br />
            Non-Custodial · Real-Time · Multi-Chain
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.1em', marginBottom: 2 }}>NAVIGATION</span>
          {navItems.map(item => (
            <button
              key={item.label}
              onClick={() => setPage(item.page)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 8, color: 'var(--text-dim)', textAlign: 'left',
                fontFamily: 'var(--font)', padding: 0,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Networks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.1em', marginBottom: 2 }}>NETWORKS</span>
          {CONFIGURED_CHAINS.map(c => (
            <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: 'var(--text-dim)' }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />

      {/* Bottom row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
          © {new Date().getFullYear()} BSTONKEX — All market data from DexScreener. Not financial advice.
        </div>
        <div style={{ fontSize: 7, color: 'var(--text-muted)' }}>
          Risk Disclosure: Trading digital assets involves substantial risk of loss.
        </div>
      </div>
    </footer>
  );
}