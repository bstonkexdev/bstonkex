// Cupcak8 — How Cupcak8 Works (Settings section)
// Consolidated info from removed homepage sections
import { useState } from 'react';
import { useApp } from '../../lib/context';

export default function HowItWorksSection() {
  const { setPage } = useApp();
  const [open, setOpen] = useState(false);

  const features = [
    { icon: '🔍', title: 'Token Discovery', desc: 'Find trending tokens, new launches, and gainers across all supported chains.' },
    { icon: '📊', title: 'Live Charts', desc: 'Real-time candlestick charts with volume data and price tracking.' },
    { icon: '⇄', title: 'Buy & Sell', desc: 'Execute trades directly from the terminal with instant quotes.' },
    { icon: '⬡', title: 'Portfolio', desc: 'Track your holdings, positions, and transaction history in one place.' },
    { icon: '◉', title: 'Activity Feed', desc: 'Monitor market events, large trades, and whale activity live.' },
    { icon: '♡', title: 'Watchlist', desc: 'Save and monitor your favorite tokens across chains.' },
  ];

  const benefits = [
    { icon: '🔗', title: 'Multichain Access', desc: 'Trade across BSC, Solana, Base, and Robinhood Chain from one interface.' },
    { icon: '📊', title: 'Clear Information', desc: 'Live prices, charts, volume, and liquidity data to support your decisions.' },
    { icon: '💰', title: 'Transparent Fees', desc: 'View trading fees and slippage settings before you confirm any swap.' },
    { icon: '🔒', title: 'Non-Custodial', desc: 'You control your wallet. Cupcak8 Swap never holds your funds or private keys.' },
  ];

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '14px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)' }}>
            How Cupcak8 Works
          </span>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--text-dim)', transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▼</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Platform Features */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#E8547C',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 10,
            }}>
              Platform Features
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 8,
            }}>
              {features.map(f => (
                <div key={f.title} style={{
                  padding: '10px 12px', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{f.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-bright)' }}>{f.title}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Launchpad */}
          <div style={{
            padding: '12px 14px', marginBottom: 16,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 6 }}>
              🚀 Token Discovery & Launchpad
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 10 }}>
              Explore new tokens, review their available information, and access supported launch features from one place.
            </div>
            <button onClick={() => { setPage('launchpad'); }} style={{
              padding: '8px 16px', background: '#B8A9E8', border: 'none',
              borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            }}>Explore Launchpad</button>
          </div>

          {/* Rewards */}
          <div style={{
            padding: '12px 14px', marginBottom: 16,
            background: 'linear-gradient(135deg, rgba(255,217,102,0.08) 0%, rgba(255,248,240,0.5) 100%)',
            border: '1px solid rgba(255,217,102,0.3)', borderRadius: 'var(--radius-sm)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3D2B1F', marginBottom: 6 }}>
              ★ Rewards & Referrals
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 10 }}>
              Invite friends, earn cashback on trading fees, and climb reward tiers as you trade across chains.
            </div>
            <button onClick={() => { setPage('reward'); }} style={{
              padding: '8px 16px', background: '#FFD966', border: 'none',
              borderRadius: 'var(--radius-sm)', color: '#3D2B1F', fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            }}>View Rewards</button>
          </div>

          {/* Why Cupcak8 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#B8A9E8',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 10,
            }}>
              Why Cupcak8 Swap?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {benefits.map(item => (
                <div key={item.title} style={{
                  display: 'flex', gap: 8, padding: '8px 10px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}