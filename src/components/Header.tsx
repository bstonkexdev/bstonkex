// Cupcak8 — Trading Terminal Header
// Mobile: Mascot · Brand · MENU | Desktop: Mascot · Brand · Nav links · MENU
import { useState } from 'react';
import { useApp } from '../lib/context';
import { getAuthStatus } from '../lib/engine/admin-auth';
import { CONFIGURED_CHAINS } from '../lib/config';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';
import MascotLogo from './MascotLogo';

type Page = 'landing' | 'markets' | 'trade' | 'token' | 'portfolio' | 'watchlist' | 'referrals' | 'reward' | 'fees' | 'activity' | 'admin' | 'launchpad' | 'settings';

interface NavItem {
  id: Page;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'markets', label: 'Market' },
  { id: 'trade', label: 'Trade' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

export default function Header() {
  const { page, setPage, wallet, activeChain, setActiveChain, notifications, setWalletModal } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = notifications.filter(n => !n.read).length;
  const isAdmin = wallet.address && getAuthStatus(wallet.address).authorized;

  const DRAWER_ITEMS = [
    { id: 'landing' as const, label: 'Home', icon: '⌂' },
    { id: 'markets' as const, label: 'Market', icon: '◈' },
    { id: 'trade' as const, label: 'Trade', icon: '⇄' },
    { id: 'portfolio' as const, label: 'Assets / Portfolio', icon: '⬡' },
    { id: 'referrals' as const, label: 'Referral & Cashback', icon: '★' },
    { id: 'activity' as const, label: 'Activity', icon: '◉' },
    { id: 'watchlist' as const, label: 'Watchlist', icon: '♡' },
    { id: 'settings' as const, label: 'Info & Settings', icon: '⚙' },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: '🛡' }] : []),
  ];

  const navigateTo = (id: typeof page) => { setPage(id); setDrawerOpen(false); };

  return (
    <>
      <header className="header">
        {/* Mascot */}
        <div onClick={() => setPage('landing')} style={{ cursor: 'pointer', flexShrink: 0, lineHeight: 0 }}>
          <MascotLogo size={32} color="#E8547C" />
        </div>

        {/* Brand name */}
        <div onClick={() => setPage('landing')} className="header-logo" style={{ minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--font-pixel)', fontSize: 12, color: '#E8547C',
            letterSpacing: '0.04em', lineHeight: 1, whiteSpace: 'nowrap',
          }}>Cupcak8 Swap</span>
        </div>

        {/* Spacer — pushes MENU to the right on mobile when nav is hidden */}
        <div className="header-spacer" />

        {/* Desktop nav — hidden on mobile via .header-nav CSS */}
        <nav className="header-nav">
          {NAV_ITEMS.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                style={{
                  padding: '6px 12px', fontSize: 12, fontWeight: active ? 700 : 500,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.03em',
                  background: active ? 'rgba(232,84,124,0.1)' : 'transparent',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  color: active ? '#E8547C' : 'var(--text-dim)',
                  transition: 'color 0.15s, background 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-bright)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-dim)'; }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* MENU button */}
        <button
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, flexShrink: 0,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            color: 'var(--text-bright)', transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#E8547C'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          {/* Hamburger icon — three lines */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" />
            <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" />
          </svg>
        </button>
      </header>

      {/* Drawer Menu */}
      {drawerOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
          <div className="drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MascotLogo size={20} color="#E8547C" />
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: 9, color: '#E8547C' }}>Cupcak8 Swap</span>
              </div>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
            </div>
            <div className="drawer-nav">
              {DRAWER_ITEMS.map(item => (
                <button key={item.id}
                  className={`drawer-item ${page === item.id ? 'active' : ''}`}
                  onClick={() => navigateTo(item.id)}>
                  <span className="drawer-item-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <div className="drawer-divider" />
              <div style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700,
                color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                ACTIVE CHAIN</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 16px 12px' }}>
                {CONFIGURED_CHAINS.map(chain => (
                  <button key={chain.id}
                    className={`chain-pill ${activeChain === chain.id ? 'active' : ''}`}
                    onClick={() => setActiveChain(chain.id as ChainId)} style={{ fontSize: 10 }}>
                    <ChainIcon chainId={chain.id as ChainId} size={12} />
                    {chain.shortName}
                  </button>
                ))}
              </div>
            </div>
            <div className="drawer-footer">
              {wallet.connected ? (
                <button onClick={() => navigateTo('portfolio')}
                  style={{ width: '100%', padding: '12px 16px',
                    background: 'rgba(232,84,124,0.08)', border: '1px solid #E8547C',
                    borderRadius: 'var(--radius)', cursor: 'pointer',
                    color: '#E8547C', fontSize: 13, fontWeight: 700,
                    fontFamily: 'var(--font-mono)', textAlign: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%',
                    background: '#4ADE80', boxShadow: '0 0 6px rgba(74,222,128,0.4)' }} />
                  {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                </button>
              ) : (
                <button onClick={() => { setWalletModal('evm'); setDrawerOpen(false); }}
                  style={{ width: '100%', padding: '14px 16px',
                    background: '#E8547C', border: 'none',
                    borderRadius: 'var(--radius)', cursor: 'pointer',
                    color: '#fff', fontSize: 14, fontWeight: 800,
                    fontFamily: 'var(--font-mono)', textAlign: 'center',
                    letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}