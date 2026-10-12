// Cupcak8 — Terminal Preview Section
// Feature showcase grid highlighting platform capabilities
export default function TerminalPreview() {
  const features = [
    { icon: '🔍', title: 'Token Discovery', desc: 'Find trending tokens, new launches, and gainers across all supported chains.' },
    { icon: '📊', title: 'Live Charts', desc: 'Real-time candlestick charts with volume data and price tracking.' },
    { icon: '⇄', title: 'Buy & Sell', desc: 'Execute trades directly from the terminal with instant quotes.' },
    { icon: '⬡', title: 'Portfolio', desc: 'Track your holdings, positions, and transaction history in one place.' },
    { icon: '◉', title: 'Activity Feed', desc: 'Monitor market events, large trades, and whale activity live.' },
    { icon: '♡', title: 'Watchlist', desc: 'Save and monitor your favorite tokens across chains.' },
  ];
  return (
    <section style={{
      padding: '48px 24px', background: 'var(--bg-deep)',
      borderBottom: '2px solid var(--border)',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
          marginBottom: 8, letterSpacing: '0.04em',
        }}>Everything You Need</h2>
        <p style={{
          fontSize: 14, color: 'var(--text-dim)', maxWidth: 480, margin: '0 auto 32px',
        }}>A complete trading terminal built for speed and clarity.</p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16, textAlign: 'left',
        }}>
          {features.map(f => (
            <div key={f.title} style={{
              padding: '20px', background: 'var(--bg-surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#B8A9E8'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <span style={{ fontSize: 24, display: 'block', marginBottom: 10 }}>{f.icon}</span>
              <div style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6,
              }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}