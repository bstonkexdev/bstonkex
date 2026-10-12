// Cupcak8 — Multichain Showcase
// Displays supported networks with chain logos
import { CONFIGURED_CHAINS } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

export default function ChainShowcase() {
  return (
    <section style={{
      padding: '48px 24px', background: 'var(--bg-surface)',
      borderBottom: '2px solid var(--border)',
    }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-pixel)', fontSize: 14, color: '#3D2B1F',
          marginBottom: 8, letterSpacing: '0.04em',
        }}>Multichain Trading</h2>
        <p style={{
          fontSize: 14, color: 'var(--text-dim)', marginBottom: 32, maxWidth: 480, margin: '0 auto 32px',
        }}>Trade across multiple blockchains from a single unified interface.</p>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          {CONFIGURED_CHAINS.map(chain => (
            <div key={chain.id} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              padding: '20px 28px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              minWidth: 140, transition: 'border-color 0.15s, transform 0.15s',
              cursor: 'default',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8547C'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <ChainIcon chainId={chain.id as ChainId} size={32} />
              <span style={{
                fontWeight: 700, fontSize: 13, color: 'var(--text-bright)',
              }}>{chain.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}