// BSTONKEX Admin Status Bar — shows connected admin wallet, auth, network info
import type { WalletState } from '../../lib/wallet';
import { CHAINS } from '../../lib/config';

export default function AdminStatusBar({ wallet }: { wallet: WalletState }) {
  const chainName = wallet.chainId ? CHAINS[wallet.chainId]?.name || wallet.chainId : 'Unknown';
  const isEvm = wallet.provider === 'evm';
  const isSolana = wallet.provider === 'solana';

  // Check if on expected network
  const expectedChain = isEvm ? 'bsc' : isSolana ? 'solana' : null;
  const wrongNetwork = wallet.chainId && expectedChain && wallet.chainId !== expectedChain;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '6px 10px', marginBottom: 10, borderRadius: 4,
      background: 'var(--bg)', border: '1px solid var(--border)',
      fontSize: 7, color: 'var(--text-muted)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--green)', fontSize: 8 }}>●</span>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>WALLET:</span>
        <span style={{ color: 'var(--text-bright)' }}>
          {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
        </span>
      </div>

      <div style={{ width: 1, height: 12, background: 'var(--border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: 'var(--green)', fontSize: 8 }}>✓</span>
        <span style={{ fontWeight: 700 }}>AUTH:</span>
        <span style={{ color: 'var(--green)' }}>AUTHORIZED</span>
      </div>

      <div style={{ width: 1, height: 12, background: 'var(--border)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 700 }}>NETWORK:</span>
        <span style={{ color: wrongNetwork ? 'var(--amber)' : 'var(--text-bright)' }}>
          {chainName.toUpperCase()}
          {wallet.provider && ` (${wallet.provider.toUpperCase()})`}
        </span>
        {wrongNetwork && (
          <span style={{
            fontSize: 6, fontWeight: 900, padding: '1px 4px', borderRadius: 2,
            background: 'rgba(255,180,0,0.12)', color: 'var(--amber)',
          }}>
            WRONG NET
          </span>
        )}
      </div>

      {wallet.balance && (
        <>
          <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontWeight: 700 }}>BAL:</span>
            <span style={{ color: 'var(--text-bright)' }}>
              {parseFloat(wallet.balance).toFixed(4)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}