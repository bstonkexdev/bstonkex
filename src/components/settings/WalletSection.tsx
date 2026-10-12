// Cupcak8 Swap — Wallet & Connections Settings Section
import { useApp } from '../../lib/context';
import { CHAINS, CONFIGURED_CHAINS, shortenAddress, type ChainId } from '../../lib/config';
import ChainIcon from '../ChainIcon';

export default function WalletSection() {
  const { wallet, connect, disconnect, switchChain, activeChain, walletError, setWalletModal } = useApp();

  return (
    <div className="ref-card">
      <div className="ref-card-header">WALLET & CONNECTIONS</div>

      {/* Connected wallet */}
      {wallet.connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Address</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
              {shortenAddress(wallet.address || '', 6)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Provider</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#E8547C', textTransform: 'uppercase' }}>
              {wallet.provider || 'Unknown'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Balance</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)' }}>
              {wallet.balance != null ? `${wallet.balance.toFixed(4)} ${CHAINS[activeChain]?.nativeSymbol || ''}` : '—'}
            </span>
          </div>
          <button
            onClick={disconnect}
            style={{
              padding: '10px', background: 'var(--red-bg)', border: '1px solid var(--red)',
              borderRadius: 'var(--radius-sm)', color: 'var(--red)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', marginTop: 4,
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>No wallet connected</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setWalletModal('evm')} style={{
              padding: '10px 24px', background: '#E8547C', border: 'none',
              borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
            }}>Connect EVM</button>
            <button onClick={() => setWalletModal('solana')} style={{
              padding: '10px 24px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-dim)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Connect Solana</button>
          </div>
        </div>
      )}

      {walletError && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: 'var(--red-bg)',
          border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
          fontSize: 11, color: 'var(--red)',
        }}>{walletError}</div>
      )}

      {/* Network Selection */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.06em' }}>
          NETWORK
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {CONFIGURED_CHAINS.map(chain => {
            const isActive = activeChain === chain.id;
            return (
              <button
                key={chain.id}
                onClick={() => switchChain(chain.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px',
                  background: isActive ? 'rgba(232,84,124,0.06)' : 'var(--bg-elevated)',
                  border: `1px solid ${isActive ? '#E8547C' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  transition: 'border-color 0.12s',
                }}
              >
                <ChainIcon chainId={chain.id} size={16} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#E8547C' : 'var(--text-bright)' }}>
                    {chain.shortName}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{chain.name}</div>
                </div>
                {isActive && (
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#E8547C', fontWeight: 700 }}>ACTIVE</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}