import { useApp } from '../lib/context';
import { CHAINS } from '../lib/config';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';

export default function NetworkMismatch() {
  const { wallet, activeChain, switchChain } = useApp();

  if (!wallet.connected || !wallet.chainId || wallet.chainId === activeChain) return null;

  const targetChain = CHAINS[activeChain];
  const currentChain = CHAINS[wallet.chainId];

  return (
    <div style={{
      position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
      zIndex: 180, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--amber-bg, rgba(255,170,0,0.08))', border: '2px solid var(--amber)',
      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--amber)',
      boxShadow: '0 0 20px rgba(255,170,0,0.15)',
    }}>
      <span className="led-sm led-amber led-blink" />
      <ChainIcon chainId={wallet.chainId as ChainId} size={12} /> WRONG NETWORK — Connected to {currentChain?.name || 'unknown'}
      <button className="btn btn-sm" style={{ fontSize: 8, padding: '3px 8px', borderColor: 'var(--amber)', color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
        onClick={() => switchChain(activeChain)}>
        SWITCH TO <ChainIcon chainId={activeChain} size={10} /> {targetChain.shortName}
      </button>
    </div>
  );
}