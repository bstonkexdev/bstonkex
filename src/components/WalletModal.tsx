import { useApp } from '../lib/context';
import ChainIcon from './ChainIcon';
import { CHAINS } from '../lib/config';

export default function WalletModal() {
  const { walletModal, setWalletModal, connect, activeChain } = useApp();
  const chain = CHAINS[activeChain];

  if (!walletModal) return null;

  const evmOptions = [
    { id: 'metamask' as const, name: 'MetaMask', icon: '🦊', detect: () => !!window.ethereum?.isMetaMask },
    { id: 'okx' as const, name: 'OKX Wallet', icon: '⭕', detect: () => !!window.okxwallet?.ethereum },
  ];
  const solOptions = [
    { id: 'phantom' as const, name: 'Phantom', icon: '👻', detect: () => !!window.solana?.isPhantom },
    { id: 'solflare' as const, name: 'Solflare', icon: '☀️', detect: () => false },
  ];

  const evmAvailable = evmOptions.filter(o => o.detect());
  const solAvailable = solOptions.filter(o => o.detect());

  const isSolanaMode = walletModal === 'solana';

  return (
    <div className="modal-overlay" onClick={() => setWalletModal(null)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <div className="panel-header">
          <span className="led led-cyan" />
          CONNECT WALLET
          <div style={{ flex: 1 }} />
          <button style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 9,
          }} onClick={() => setWalletModal(null)}>[ESC]</button>
        </div>
        <div style={{ padding: 12 }}>
          {/* Chain mode tabs */}
          <div className="tabs" style={{ marginBottom: 10 }}>
            <button className="tab" onClick={() => setWalletModal('evm')}
              style={!isSolanaMode ? { borderColor: 'var(--cyan)', color: 'var(--cyan)', background: 'rgba(0,204,255,0.06)', zIndex: 1 } : undefined}>
              EVM CHAINS
            </button>
            <button className="tab" onClick={() => setWalletModal('solana')}
              style={isSolanaMode ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', zIndex: 1 } : undefined}>
              SOLANA
            </button>
          </div>

          {!isSolanaMode ? (
            <>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.08em' }}>
                SELECT AN EVM WALLET FOR <ChainIcon chainId={activeChain} size={10} /> {chain.shortName}
              </div>
              {evmAvailable.length > 0 ? evmAvailable.map(o => (
                <button key={o.id}
                  className="btn btn-full"
                  style={{ justifyContent: 'flex-start', padding: '10px 12px', marginBottom: 4, fontSize: 11, fontWeight: 700 }}
                  onClick={() => { connect('evm'); setWalletModal(null); }}>
                  <span style={{ fontSize: 16, marginRight: 10 }}>{o.icon}</span>
                  {o.name}
                </button>
              )) : (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>NO EVM WALLET DETECTED</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    Install MetaMask or OKX Wallet to continue.
                  </div>
                </div>
              )}
              <div style={{ fontSize: 8, color: 'var(--text-dim)', marginTop: 8, letterSpacing: '0.05em' }}>
                BNB CHAIN · BASE · ROBINHOOD
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 8, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: '0.08em' }}>
                SELECT A SOLANA WALLET
              </div>
              {solAvailable.length > 0 ? solAvailable.map(o => (
                <button key={o.id}
                  className="btn btn-full"
                  style={{ justifyContent: 'flex-start', padding: '10px 12px', marginBottom: 4, fontSize: 11, fontWeight: 700 }}
                  onClick={() => { connect('solana'); setWalletModal(null); }}>
                  <span style={{ fontSize: 16, marginRight: 10 }}>{o.icon}</span>
                  {o.name}
                </button>
              )) : (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 }}>NO SOLANA WALLET DETECTED</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    Install Phantom to continue.
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{
            marginTop: 10, padding: '6px 0', borderTop: '1px solid var(--border)',
            fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.05em', lineHeight: 1.6,
          }}>
            BSTONKEX is non-custodial. Your keys never leave your wallet.
          </div>
        </div>
      </div>
    </div>
  );
}