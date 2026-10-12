// Cupcak8 Swap — Wallet Panel (header dropdown)
// Shows wallet status, portfolio value, chain balances, quick actions
import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, CONFIGURED_CHAINS, shortenAddress, explorerAddressUrl, formatUsd } from '../lib/config';
import type { ChainId } from '../lib/config';
import { getTotalPortfolioValue } from '../lib/engine/portfolio-engine';
import type { WalletBalance } from '../lib/engine/types';
import ChainIcon from './ChainIcon';
import DegenModePanel from './degen/DegenModePanel';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', bgPanel: 'var(--bg-surface)', bg: 'var(--bg-deep)', bgAlt: 'var(--bg-elevated)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', greenBg: 'var(--green-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)',
  mono: "var(--font-mono)",
} as const;

export default function WalletPanel() {
  const { wallet, disconnect, activeChain, switchChain, setWalletModal, setPage } = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [portfolios, setPortfolios] = useState<WalletBalance[]>([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
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

  // Load portfolio when opened
  useEffect(() => {
    if (!open || !wallet.connected || !wallet.address) return;
    setLoadingPortfolio(true);
    getTotalPortfolioValue(wallet.address)
      .then(r => { setPortfolios(r.chains); setTotalUsd(r.totalUsd); })
      .catch(() => {})
      .finally(() => setLoadingPortfolio(false));
  }, [open, wallet.connected, wallet.address]);

  if (!wallet.connected || !wallet.address) {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => setWalletModal('evm')} style={{
          fontSize: 8, padding: '4px 8px', background: D.gold, border: 'none',
          borderRadius: 3, color: '#000', fontWeight: 700, cursor: 'pointer',
        }}>
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
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
        background: 'transparent', border: `1px solid ${D.border}`,
        borderRadius: 3, cursor: 'pointer',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: wrongNetwork ? D.gold : D.green,
          animation: 'led-blink 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: D.text }}>
          {shortenAddress(wallet.address, 3)}
        </span>
        {wallet.balance && (
          <span style={{ fontSize: 9, color: D.textMuted }}>
            {parseFloat(wallet.balance).toFixed(3)} {actualChain?.nativeSymbol || ''}
          </span>
        )}
        <span style={{ fontSize: 8, color: D.textMuted }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 300, background: D.bg, border: `1px solid ${D.border}`,
          zIndex: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          borderRadius: 6, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 12px', borderBottom: `1px solid ${D.border}`,
            background: D.bgPanel,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: D.green,
                  animation: 'led-blink 2s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: D.text }}>WALLET</span>
                <span style={{
                  fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 2,
                  background: D.greenBg, color: D.green,
                }}>
                  CONNECTED
                </span>
              </div>
              <span style={{
                fontSize: 8, fontWeight: 600, padding: '1px 4px', borderRadius: 2,
                background: D.greenBg, color: D.green,
              }}>
                ● LIVE
              </span>
            </div>

            {/* Address + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: D.text, fontFamily: D.mono, letterSpacing: '-0.02em',
              }}>
                {shortenAddress(wallet.address, 6)}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={copyAddr} style={{
                  fontSize: 7, padding: '2px 6px', background: D.bgAlt, border: `1px solid ${D.border}`,
                  borderRadius: 2, cursor: 'pointer', color: copied ? D.green : D.textMuted, fontWeight: 700,
                }}>
                  {copied ? 'COPIED' : 'COPY'}
                </button>
                <a href={explorerAddressUrl(wallet.chainId || activeChain, wallet.address)}
                  target="_blank" rel="noopener"
                  style={{
                    fontSize: 7, padding: '2px 6px', background: D.bgAlt, border: `1px solid ${D.border}`,
                    borderRadius: 2, cursor: 'pointer', color: D.textMuted, fontWeight: 700,
                    textDecoration: 'none',
                  }}>
                  EXPLORER
                </a>
              </div>
            </div>
          </div>

          {/* Portfolio value */}
          <div style={{
            padding: '10px 12px', borderBottom: `1px solid ${D.border}`,
          }}>
            <div style={{ fontSize: 9, color: D.textMuted, marginBottom: 2, letterSpacing: '0.04em' }}>
              TOTAL PORTFOLIO VALUE
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: D.text, fontFamily: D.mono }}>
              {loadingPortfolio ? '...' : formatUsd(totalUsd)}
            </div>
          </div>

          {/* Chain balances */}
          <div style={{
            padding: '8px 12px', borderBottom: `1px solid ${D.border}`,
            maxHeight: 160, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 9, color: D.textMuted, marginBottom: 6, letterSpacing: '0.04em' }}>
              CHAIN BALANCES
            </div>
            {CONFIGURED_CHAINS.map(c => {
              const p = portfolios.find(pp => pp.chainId === c.id);
              const bal = p ? parseFloat(p.nativeBalance) : 0;
              const usd = p ? p.nativeBalanceUsd : 0;
              const tokens = p ? p.tokens.length : 0;
              const isActive = wallet.chainId === c.id;

              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 0', cursor: 'pointer',
                }} onClick={() => { switchChain(c.id); setOpen(false); }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChainIcon chainId={c.id as ChainId} size={14} />
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: isActive ? D.gold : D.text,
                    }}>
                      {c.shortName}
                    </span>
                    <span style={{ fontSize: 8, color: D.textMuted }}>
                      {tokens} tokens
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, fontFamily: D.mono, color: D.text }}>
                      {bal > 0 ? bal.toFixed(4) : '0'} {c.nativeSymbol}
                    </div>
                    <div style={{ fontSize: 8, color: D.textMuted, fontFamily: D.mono }}>
                      {usd > 0 ? formatUsd(usd) : '$0.00'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${D.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button onClick={() => { setPage('trade'); setOpen(false); }} style={{
                padding: '6px', fontSize: 9, fontWeight: 700, background: D.gold,
                border: 'none', borderRadius: 3, color: '#000', cursor: 'pointer',
              }}>
                TRADE
              </button>
              <button onClick={() => { setPage('portfolio'); setOpen(false); }} style={{
                padding: '6px', fontSize: 9, fontWeight: 700, background: D.bgAlt,
                border: `1px solid ${D.border}`, borderRadius: 3, color: D.text, cursor: 'pointer',
              }}>
                PORTFOLIO
              </button>
            </div>
          </div>

          {/* Degen Mode */}
          <div style={{ padding: '0 12px 8px' }}>
            <DegenModePanel walletAddress={wallet.address} activeChain={activeChain} />
          </div>

          {/* Disconnect */}
          <div style={{ padding: '0 12px 10px' }}>
            <button onClick={() => { disconnect(); setOpen(false); }} style={{
              width: '100%', padding: '6px', fontSize: 9, fontWeight: 700,
              background: 'transparent', border: `1px solid ${D.red}`,
              borderRadius: 3, color: D.red, cursor: 'pointer',
            }}>
              DISCONNECT
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes led-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
