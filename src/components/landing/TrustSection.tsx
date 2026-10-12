// Cupcak8 — Trust & Usability Section
// Platform benefits without unsupported claims
export default function TrustSection() {
  const items = [
    { icon: '🔗', title: 'Multichain Access', desc: 'Trade across BSC, Solana, Base, and Robinhood Chain from one interface.' },
    { icon: '📊', title: 'Clear Information', desc: 'Live prices, charts, volume, and liquidity data to support your decisions.' },
    { icon: '💰', title: 'Transparent Fees', desc: 'View trading fees and slippage settings before you confirm any swap.' },
    { icon: '⬡', title: 'Portfolio Visibility', desc: 'Track your holdings, positions, and transaction history in one place.' },
    { icon: '🧭', title: 'Simple Navigation', desc: 'Markets, trade, portfolio, rewards, and launchpad — all reachable from the header.' },
    { icon: '🔒', title: 'Non-Custodial', desc: 'You control your wallet. Cupcak8 Swap never holds your funds or private keys.' },
  ];
  return (
    <section style={{
      padding: '48px 24px', background: 'var(--bg-elevated)',
      borderBottom: '2px solid var(--border)',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
          marginBottom: 8, letterSpacing: '0.04em',
        }}>Why Cupcak8 Swap?</h2>
        <p style={{
          fontSize: 14, color: 'var(--text-dim)', maxWidth: 480, margin: '0 auto 32px',
        }}>Built for traders who want power without complexity.</p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16, textAlign: 'left',
        }}>
          {items.map(item => (
            <div key={item.title} style={{
              display: 'flex', gap: 12, padding: '16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}