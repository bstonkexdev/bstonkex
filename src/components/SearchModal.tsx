import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../lib/context';
import { CHAINS, formatUsd, formatPct, shortenAddress, explorerTxUrl, explorerAddressUrl } from '../lib/config';
import type { ChainId } from '../lib/config';
import ChainIcon from './ChainIcon';
import { searchTokens, type SearchResult } from '../lib/market';
import { detectInputType, unifiedSearch, searchCommands, addRecentSearch, getRecentSearches, clearRecentSearches, type Command, type SearchCategory } from '../lib/engine/search-engine';
import { gitlawb } from '../lib/gitlawb';

type GroupedResults = {
  tokens: SearchResult[];
  commands: Command[];
  detected: { type: SearchCategory; chainId?: ChainId };
};

export default function SearchModal() {
  const { searchOpen, setSearchOpen, setTradeToken, setPage, wallet, activeChain } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResults>({ tokens: [], commands: [], detected: { type: 'command' } });
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number>(0);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery(''); setSelectedIdx(0);
      setRecentSearches(getRecentSearches());
    }
  }, [searchOpen]);

  // Global keyboard shortcut: / and Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSearchOpen(!searchOpen);
        return;
      }
      if (e.key === '/' && !isInput && !searchOpen) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults({ tokens: [], commands: [], detected: { type: 'command' } });
      return;
    }
    setLoading(true);
    try {
      const res = await unifiedSearch(q);
      setResults(res);
    } catch {
      setResults({ tokens: [], commands: [], detected: { type: 'token' } });
    }
    setLoading(false);
    setSelectedIdx(0);
  }, []);

  const onInput = (val: string) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => doSearch(val), 250);
  };

  // Build flat result list for keyboard navigation
  const flatItems: { type: 'recent' | 'command' | 'token' | 'action'; data: any; label: string }[] = [];

  if (!query && recentSearches.length > 0) {
    flatItems.push(...recentSearches.slice(0, 5).map(r => ({ type: 'recent' as const, data: r, label: r })));
  }
  if (results.commands.length > 0) {
    flatItems.push(...results.commands.slice(0, 8).map(c => ({ type: 'command' as const, data: c, label: c.label })));
  }
  if (results.tokens.length > 0) {
    flatItems.push(...results.tokens.slice(0, 15).map(r => ({ type: 'token' as const, data: r, label: `${r.symbol} ${r.name}` })));
  }

  const selectItem = (item: typeof flatItems[0]) => {
    if (item.type === 'recent') {
      onInput(item.data);
      setQuery(item.data);
      doSearch(item.data);
      return;
    }
    if (item.type === 'command') {
      const cmd = item.data as Command;
      executeCommand(cmd);
      return;
    }
    if (item.type === 'token') {
      const r = item.data as SearchResult;
      addRecentSearch(r.symbol);
      setTradeToken({ chainId: r.chainId, address: r.address, name: r.name, symbol: r.symbol });
      setSearchOpen(false);
    }
  };

  const executeCommand = (cmd: Command) => {
    const action = cmd.action;
    if (action.startsWith('search:')) return; // stay in search mode
    if (action.startsWith('username:')) { setSearchOpen(false); setPage('referrals'); return; }
    if (action === 'connect') { setSearchOpen(false); wallet.connected ? null : setPage('portfolio'); return; }
    if (action === 'copy-referral') { /* handled inline */ setSearchOpen(false); return; }
    // Navigation commands
    const validPages = ['landing', 'markets', 'trade', 'activity', 'portfolio', 'watchlist', 'referrals', 'fees'];
    if (validPages.includes(action)) { setSearchOpen(false); setPage(action as any); return; }
    setSearchOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setSearchOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, flatItems.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && flatItems[selectedIdx]) { selectItem(flatItems[selectedIdx]); }
  };

  if (!searchOpen) return null;

  const detectedType = results.detected.type;

  return (
    <div className="modal-overlay" onClick={() => setSearchOpen(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="panel-header" style={{ flexShrink: 0 }}>
          <span className="led" />
          {detectedType === 'command' ? 'COMMAND PALETTE' : `SEARCH · ${detectedType.toUpperCase()}`}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>CTRL+K</span>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 9, marginLeft: 6 }}
            onClick={() => setSearchOpen(false)}>[ESC]</button>
        </div>

        {/* Input */}
        <div style={{ padding: 8, flexShrink: 0 }}>
          <input ref={inputRef} className="input" placeholder="Search tokens, pairs, wallets, commands..."
            value={query} onChange={e => onInput(e.target.value)} onKeyDown={onKeyDown}
            style={{ fontSize: 13, letterSpacing: '-0.01em' }} />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
              SCANNING BLOCKCHAINS...
            </div>
          )}

          {/* Recent searches */}
          {!query && recentSearches.length > 0 && (
            <ResultGroup label="RECENT" action={<button style={clearBtnStyle} onClick={() => { clearRecentSearches(); setRecentSearches([]); }}>CLEAR</button>}>
              {recentSearches.slice(0, 5).map((r, i) => {
                const idx = flatItems.findIndex(f => f.type === 'recent' && f.data === r);
                return (
                  <ResultRow key={`recent-${r}`} selected={idx === selectedIdx}
                    onMouseEnter={() => setSelectedIdx(idx)} onClick={() => selectItem(flatItems[idx])}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 16 }}>⌕</span>
                    <span style={{ fontSize: 10, color: 'var(--text)' }}>{r}</span>
                  </ResultRow>
                );
              })}
            </ResultGroup>
          )}

          {/* Commands */}
          {results.commands.length > 0 && (
            <ResultGroup label={query ? 'COMMANDS' : 'NAVIGATION'}>
              {results.commands.slice(0, 8).map((cmd) => {
                const idx = flatItems.findIndex(f => f.type === 'command' && f.data.id === cmd.id);
                const catIcon = cmd.category === 'navigation' ? '▸' : cmd.category === 'search' ? '⌕' : cmd.category === 'user' ? '⬡' : '⚙';
                return (
                  <ResultRow key={cmd.id} selected={idx === selectedIdx}
                    onMouseEnter={() => setSelectedIdx(idx)} onClick={() => selectItem(flatItems[idx])}>
                    <span style={{ color: 'var(--cyan)', fontSize: 10, width: 16 }}>{catIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-bright)' }}>{cmd.label}</div>
                      <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{cmd.description}</div>
                    </div>
                    <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>{cmd.action}</span>
                  </ResultRow>
                );
              })}
            </ResultGroup>
          )}

          {/* Tokens */}
          {results.tokens.length > 0 && (
            <ResultGroup label="TOKENS & MARKETS">
              {results.tokens.slice(0, 12).map((r) => {
                const idx = flatItems.findIndex(f => f.type === 'token' && f.data.address === r.address && f.data.chainId === r.chainId);
                const chain = CHAINS[r.chainId];
                const isUp = (r.priceChange24h ?? 0) >= 0;
                const trad = (r.liquidity ?? 0) > 1000 ? { label: 'TRADE', color: 'var(--green)' } : { label: 'VIEW', color: 'var(--amber)' };
                return (
                  <ResultRow key={`${r.chainId}-${r.address}`} selected={idx === selectedIdx}
                    onMouseEnter={() => setSelectedIdx(idx)} onClick={() => selectItem(flatItems[idx])}>
                    {/* Chain badge */}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <ChainIcon chainId={r.chainId as ChainId} size={12} />
                      <span style={{
                        fontSize: 7, fontWeight: 800, padding: '0 3px', minWidth: 24, textAlign: 'center',
                        border: `1px solid ${chain?.color || 'var(--border)'}`, color: chain?.color || 'var(--text-dim)',
                      }}>{chain?.shortName || '???'}</span>
                    </span>
                    {/* Token info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-bright)' }}>{r.symbol}</span>
                        <span style={{ fontSize: 8, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 7, color: 'var(--text-muted)' }}>
                        <span>{shortenAddress(r.address, 5)}</span>
                        {r.pairAddress && <span>· {r.dexId || 'DEX'}</span>}
                      </div>
                    </div>
                    {/* Price */}
                    <div style={{ textAlign: 'right', minWidth: 60 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-bright)' }}>{formatUsd(r.price)}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)' }}>{formatPct(r.priceChange24h)}</div>
                    </div>
                    {/* Volume */}
                    <div style={{ textAlign: 'right', minWidth: 50, display: 'none' }} className="desktop-only">
                      <div style={{ fontSize: 7, color: 'var(--text-dim)' }}>VOL</div>
                      <div style={{ fontSize: 9, fontWeight: 700 }}>{formatUsd(r.volume24h)}</div>
                    </div>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button style={actionBtnStyle(trad.color)} onClick={ev => { ev.stopPropagation(); addRecentSearch(r.symbol); setTradeToken({ chainId: r.chainId, address: r.address, name: r.name, symbol: r.symbol }); setSearchOpen(false); }}>
                        {trad.label}
                      </button>
                      <button style={actionBtnStyle('var(--text-dim)')} onClick={ev => { ev.stopPropagation(); navigator.clipboard.writeText(r.address); }}>
                        COPY
                      </button>
                    </div>
                  </ResultRow>
                );
              })}
            </ResultGroup>
          )}

          {/* Empty state */}
          {!loading && query.length >= 2 && results.tokens.length === 0 && results.commands.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>NO RESULTS</div>
              <div>Try:</div>
              <div style={{ marginTop: 4, lineHeight: 1.8 }}>
                Token symbol · Token name · Contract address<br />
                Wallet address · Transaction hash · /command
              </div>
            </div>
          )}

          {/* Initial hint */}
          {!query && recentSearches.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)' }}>
              <div style={{ marginBottom: 8 }}>Type to search tokens, pairs, wallets, or commands</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['NVDA', 'SOL', '/trade', '/portfolio', '/referrals'].map(hint => (
                  <button key={hint} style={hintBtnStyle} onClick={() => { setQuery(hint); doSearch(hint); }}>{hint}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer hints */}
        {(results.tokens.length > 0 || results.commands.length > 0) && (
          <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border)', fontSize: 7, color: 'var(--text-dim)', display: 'flex', gap: 10, flexShrink: 0 }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
            <span>CTRL+K Toggle</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function ResultGroup({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 7, fontWeight: 800, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{label}</span>
        <div style={{ flex: 1 }} />
        {action}
      </div>
      <div style={{ borderTop: '1px solid var(--border)' }}>{children}</div>
    </div>
  );
}

function ResultRow({ selected, onMouseEnter, onClick, children }: {
  selected: boolean; onMouseEnter: () => void; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
      borderBottom: '1px solid rgba(22,40,72,0.3)',
      background: selected ? 'var(--bg-hover)' : 'transparent',
      cursor: 'pointer', transition: 'background 0.08s',
    }}
      onMouseEnter={onMouseEnter} onClick={onClick}>
      {children}
    </div>
  );
}

const clearBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
  fontFamily: 'var(--font)', fontSize: 7, padding: '1px 4px',
};

const hintBtnStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)',
  fontSize: 8, padding: '3px 8px',
};

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    background: 'none', border: `1px solid ${color}`, color,
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 7,
    padding: '1px 5px', fontWeight: 700,
  };
}