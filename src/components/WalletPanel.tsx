import { useState, useRef, useEffect } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, shortenAddress, explorerAddressUrl, formatUsd } from '../lib/config';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';

export default function WalletPanel() {
  const { wallet, disconnect, activeChain, switchChain, setWalletModal } = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!wallet.connected || !wallet.address) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-sm btn-cyan" onClick={() => setWalletModal('evm')}
          style={{ fontSize: 8, padding: '4px 8px' }}>
          CONNECT WALLET
        </button>
      </div>
    );
  }

  const chain = CHAINS[activeChain];
  const wrongNetwork = wallet.chainId && wallet.chainId !== activeChain;
  const actualChain = wallet.chainId ? CHAINS[wallet.chainId] : null;

  const copyAddr = () => {
    navigator.clipboard.writeText(wallet.address || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button className="btn btn-sm" onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px' }}>
        <span className={`led-sm ${wrongNetwork ? 'led-amber' : 'led-green'} led-blink`} />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-bright)' }}>
          {shortenAddress(wallet.address, 3)}
        </span>
        {wallet.balance && (
          <span className="text-xs text-dim desktop-only" style={{ fontSize: 9 }}>
            {parseFloat(wallet.balance).toFixed(3)} {actualChain?.nativeSymbol || ''}
          </span>
        )}
        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 280, background: 'var(--bg-panel)', border: '1px solid var(--border)',
          zIndex: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div className="panel-header">
            <span className={`led-sm ${wrongNetwork ? 'led-amber' : 'led-green'} led-blink`} />
            CONNECTED WALLET
          </div>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Address */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '-0.02em' }}>
                {shortenAddress(wallet.address, 6)}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={copyAddr} style={{ fontSize: 7, padding: '2px 5px' }}>
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <a href={explorerAddressUrl(wallet.chainId || activeChain, wallet.address)}
                  target="_blank" rel="noopener"
                  className="btn btn-sm" style={{ fontSize: 7, padding: '2px 5px', textDecoration: 'none' }}>
                  EXPLORER
                </a>
              </div>
            </div>

            {/* Network */}
            <div className="info-row">
              <span className="info-label">NETWORK</span>
              <span className="info-value" style={{ color: actualChain?.color || 'var(--text)' }}>
                {actualChain?.name || 'UNKNOWN'}
              </span>
            </div>

            {/* Balance */}
            <div className="info-row">
              <span className="info-label">BALANCE</span>
              <span className="info-value">
                {wallet.balance ? `${parseFloat(wallet.balance).toFixed(6)} ${actualChain?.nativeSymbol || ''}` : 'LOADING...'}
              </span>
            </div>

            {/* Wrong network warning */}
            {wrongNetwork && (
              <div style={{
                padding: 6, fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
                border: '1px solid var(--amber)', background: 'rgba(255,170,0,0.06)', color: 'var(--amber)',
              }}>
                WRONG NETWORK — {actualChain?.name || 'UNKNOWN'}
                <button className="btn btn-sm" style={{ marginLeft: 8, fontSize: 7, padding: '2px 5px' }}
                  onClick={() => { switchChain(activeChain); setOpen(false); }}>
                  SWITCH TO <ChainIcon chainId={activeChain} size={10} /> {chain.shortName}
                </button>
              </div>
            )}

            {/* Network switch buttons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {Object.values(CHAINS).filter(c => c.configured).map(c => (
                <button key={c.id}
                  className={`btn btn-sm ${wallet.chainId === c.id ? 'active' : ''}`}
                  style={{
                    fontSize: 7, padding: '2px 5px',
                    borderColor: wallet.chainId === c.id ? c.color : undefined,
                    color: wallet.chainId === c.id ? c.color : undefined,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                  onClick={() => { switchChain(c.id); setOpen(false); }}>
                  <ChainIcon chainId={c.id as ChainId} size={10} />
                  {c.shortName}
                </button>
              ))}
            </div>

            {/* Disconnect */}
            <button className="btn btn-sm btn-full" onClick={() => { disconnect(); setOpen(false); }}
              style={{ fontSize: 8, marginTop: 4 }}>
              DISCONNECT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}