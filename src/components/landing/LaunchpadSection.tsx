// Cupcak8 — Launchpad Section
import { useApp } from '../../lib/context';


export default function LaunchpadSection() {
  const { setPage } = useApp();
  return (
    <section style={{
      padding: '48px 24px', background: 'var(--bg-surface)',
      borderBottom: '2px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center',
        gap: 40, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <div style={{ flex: '1 1 360px' }}>
          <h2 style={{
            fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
            marginBottom: 12, letterSpacing: '0.04em',
          }}>Discover What's Launching Next.</h2>
          <p style={{
            fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 20,
          }}>
            Explore new tokens, review their available information, and access supported launch features from one place.
          </p>
          <button onClick={() => setPage('launchpad')} style={{
            padding: '12px 28px', background: '#B8A9E8', border: 'none',
            borderRadius: 'var(--radius)', color: '#fff', fontSize: 13, fontWeight: 800,
            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
            fontFamily: 'var(--font-mono)', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#9B88D4'}
            onMouseLeave={e => e.currentTarget.style.background = '#B8A9E8'}
          >Explore Launchpad</button>
        </div>
      </div>
    </section>
  );
}