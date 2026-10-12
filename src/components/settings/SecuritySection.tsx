// Cupcak8 Swap — Privacy & Security Settings Section
import { useApp } from '../../lib/context';
import { shortenAddress } from '../../lib/config';

export default function SecuritySection() {
  const { wallet } = useApp();

  return (
    <div className="ref-card">
      <div className="ref-card-header">PRIVACY & SECURITY</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Session Info */}
        <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '0.06em' }}>
            SESSION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Wallet</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: wallet.connected ? 'var(--lime-dim)' : 'var(--text-dim)' }}>
                {wallet.connected ? shortenAddress(wallet.address || '', 4) : 'Not connected'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Provider</span>
              <span style={{ fontSize: 11, color: 'var(--text-bright)' }}>
                {wallet.provider ? wallet.provider.toUpperCase() : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Security Practices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--lime-dim)', flexShrink: 0 }}>✓</span>
            <span>Cupcak8 Swap never stores or transmits your private keys or seed phrases.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--lime-dim)', flexShrink: 0 }}>✓</span>
            <span>All wallet signatures are performed locally in your browser.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--lime-dim)', flexShrink: 0 }}>✓</span>
            <span>Token safety checks run before every trade to detect honeypots and high-risk contracts.</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--lime-dim)', flexShrink: 0 }}>✓</span>
            <span>Price impact warnings display when slippage exceeds safe thresholds.</span>
          </div>
        </div>

        <div style={{
          padding: '8px 10px', background: 'var(--yellow-bg)',
          border: '1px solid var(--yellow)', borderRadius: 'var(--radius-sm)',
          fontSize: 9, color: 'var(--yellow-dim)', lineHeight: 1.6,
        }}>
          Never share your seed phrase or private keys with anyone. Cupcak8 Swap will never ask for them.
        </div>
      </div>
    </div>
  );
}