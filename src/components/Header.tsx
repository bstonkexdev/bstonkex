import { useEffect, useRef, useCallback } from 'react';
import { useApp, type Page } from '../lib/context';
import { CHAINS, CONFIGURED_CHAINS } from '../lib/config';
import type { ChainId } from '../lib/config';
import { isAdminWallet } from '../lib/engine/admin-auth';
import WalletPanel from './WalletPanel';
import Notifications from './Notifications';
import ConnectionStatus from './ConnectionStatus';
import ChainIcon from './ChainIcon';

const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'landing', label: 'HOME', icon: '⌂' },
  { page: 'markets', label: 'MARKETS', icon: '◈' },
  { page: 'trade', label: 'TRADE', icon: '⇄' },
  { page: 'activity', label: 'ACTIVITY', icon: '⚡' },
  { page: 'portfolio', label: 'PORTFOLIO', icon: '⬡' },
  { page: 'watchlist', label: 'WATCHLIST', icon: '★' },
  { page: 'referrals', label: 'REFERRALS', icon: '⎘' },
  { page: 'fees', label: 'FEES', icon: '⟐' },
];

export default function Header() {
  const { page, setPage, wallet, activeChain, setActiveChain, setSearchOpen, menuOpen, setMenuOpen, walletError } = useApp();

  const activeChainConfig = CHAINS[activeChain];
  const wrongNetwork = wallet.connected && wallet.chainId && wallet.chainId !== activeChain;
  const isAdmin = wallet.connected && wallet.address && isAdminWallet(wallet.address);

  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), [setMenuOpen]);

  // Close menu on ESC
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [menuOpen, closeMenu]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    // Delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [menuOpen, closeMenu]);

  const navigate = (p: Page) => { setPage(p); closeMenu(); };

  return (
    <header className="header">
      {/* Logo */}
      <div className="header-logo" onClick={() => setPage('landing')}>
        BSTONKEX
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', marginLeft: 4, marginRight: 2 }} className="desktop-only" />

      {/* Desktop Navigation */}
      <nav className="header-nav desktop-only">
        {NAV_ITEMS.map(item => (
          <button key={item.page}
            className={`header-nav-item ${page === item.page ? 'active' : ''}`}
            onClick={() => setPage(item.page)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Search — independent from menu */}
      <button className="btn btn-sm" onClick={() => setSearchOpen(true)}
        style={{ minWidth: 0, padding: '4px 8px' }}>
        <SearchIcon /> <span className="desktop-only" style={{ marginLeft: 4 }}>Search</span>
      </button>

      {/* Chain Selector */}
      <div className="chain-pills desktop-only">
        {CONFIGURED_CHAINS.map(chain => {
          const isWalletOnChain = wallet.connected && wallet.chainId === chain.id;
          return (
            <button key={chain.id}
              className={`chain-pill ${activeChain === chain.id ? 'active' : ''}`}
              onClick={() => setActiveChain(chain.id)}
              style={{
                ...(activeChain === chain.id ? { borderColor: chain.color, color: chain.color, textShadow: `0 0 6px ${chain.color}44` } : {}),
                position: 'relative', display: 'flex', alignItems: 'center', gap: 3,
              }}>
              <ChainIcon chainId={chain.id as ChainId} size={12} />
              {chain.shortName}
              {isWalletOnChain && (
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--green)', display: 'inline-block',
                }} />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)' }} className="desktop-only" />

      {/* Network mismatch indicator in header */}
      {wrongNetwork && (
        <span className="desktop-only" style={{
          fontSize: 7, fontWeight: 800, color: 'var(--amber)',
          padding: '2px 6px', border: '1px solid var(--amber)',
          marginRight: 6, letterSpacing: '0.05em',
        }}>
          WRONG NET
        </span>
      )}

      {/* Connection status */}
      <ConnectionStatus />

      {/* Notifications bell */}
      <Notifications />

      {/* Wallet Panel */}
      <WalletPanel />

      {/* Menu Button (hamburger) — opens nav drawer, NOT search */}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button className="btn btn-sm" onClick={() => setMenuOpen(!menuOpen)}
          style={{ minWidth: 0, padding: '4px 6px' }}>
          <MenuIcon />
        </button>

        {/* Menu Drawer / Dropdown */}
        {menuOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            width: 220, zIndex: 150,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            {/* Navigation items */}
            <div style={{ padding: '6px 0' }}>
              {NAV_ITEMS.map(item => (
                <button key={item.page} onClick={() => navigate(item.page)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 14px',
                  background: page === item.page ? 'var(--bg-hover)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: page === item.page ? 'var(--text-bright)' : 'var(--text)',
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                }}>
                  <span style={{ fontSize: 12, width: 18, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />

            {/* Search shortcut in menu */}
            <button onClick={() => { setSearchOpen(true); closeMenu(); }} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: 'var(--text-dim)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            }}>
              <span style={{ fontSize: 12, width: 18, textAlign: 'center' }}>⌕</span>
              SEARCH
            </button>

            {/* Admin section — only for authorized wallet */}
            {isAdmin && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '0 10px' }} />
                <div style={{ padding: '6px 0' }}>
                  <button onClick={() => navigate('admin')} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '8px 14px',
                    background: page === 'admin' ? 'var(--bg-hover)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    color: page === 'admin' ? 'var(--cyan)' : 'var(--cyan)',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  }}>
                    <span style={{ fontSize: 12, width: 18, textAlign: 'center' }}>⚙</span>
                    ADMIN
                    <span style={{
                      marginLeft: 'auto', fontSize: 7,
                      padding: '1px 4px', background: 'rgba(0,204,255,0.15)',
                      color: 'var(--cyan)',
                    }}>
                      DEPLOY
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Error toast */}
      {walletError && (
        <div style={{
          position: 'fixed', top: 50, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--red-bg)', border: '2px solid var(--red)',
          padding: '6px 14px', fontSize: 10, zIndex: 200, color: 'var(--red)',
          fontWeight: 700, letterSpacing: '0.05em',
        }}>
          {walletError}
        </div>
      )}
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}