// BSTONKEX — DISCOVER → ANALYZE → EXECUTE → TRACK workflow flow
import { useApp } from '../../lib/context';

const STEPS = [
  {
    icon: '◎',
    label: 'DISCOVER',
    desc: 'Multi-chain token discovery across BNB, Solana, Base, Robinhood. Real-time DexScreener data.',
    color: 'var(--cyan)',
  },
  {
    icon: '◈',
    label: 'ANALYZE',
    desc: 'Safety scores, liquidity depth, holder concentration, price charts, and market metrics.',
    color: 'var(--text-bright)',
  },
  {
    icon: '⇄',
    label: 'EXECUTE',
    desc: 'Non-custodial swaps via Jupiter, 1inch, PancakeSwap. Multi-chain routing with real gas estimates.',
    color: 'var(--green)',
  },
  {
    icon: '⬡',
    label: 'TRACK',
    desc: 'Portfolio snapshots, PnL tracking, transaction history, alerts, and watchlists.',
    color: 'var(--amber)',
  },
];

export default function WorkflowFlow() {
  const { setPage } = useApp();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 0,
      border: '1px solid var(--border)',
      background: 'var(--bg-panel)',
    }}>
      {STEPS.map((step, i) => (
        <div
          key={step.label}
          style={{
            padding: '16px 14px',
            borderRight: i < STEPS.length - 1 ? '1px solid var(--border)' : 'none',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => {
            if (step.label === 'DISCOVER') setPage('markets');
            else if (step.label === 'EXECUTE') setPage('trade');
            else if (step.label === 'TRACK') setPage('portfolio');
            else setPage('markets');
          }}
        >
          {/* Step number */}
          <div style={{
            fontSize: 7, fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.1em', marginBottom: 6,
          }}>
            {String(i + 1).padStart(2, '0')}
          </div>

          {/* Icon + Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: step.color }}>{step.icon}</span>
            <span style={{
              fontSize: 11, fontWeight: 900, color: step.color,
              letterSpacing: '0.1em',
            }}>
              {step.label}
            </span>
          </div>

          {/* Description */}
          <div style={{ fontSize: 8, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            {step.desc}
          </div>

          {/* Arrow connector (desktop) */}
          {i < STEPS.length - 1 && (
            <div style={{
              position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: 'var(--text-muted)', zIndex: 1,
              display: 'none',
            }} className="desktop-only">
              →
            </div>
          )}
        </div>
      ))}
    </div>
  );
}