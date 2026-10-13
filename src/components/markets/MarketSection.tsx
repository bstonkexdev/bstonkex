import { useState, useEffect } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import { LAUNCHPADS_BY_CHAIN, CHAINS, FILTER_TABS } from './LaunchpadLogos';
import type { TokenIndexRecord } from '../../lib/engine/discovery/types';

interface MarketToken {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  progress: number;
  mcap: number;
  holders: number;
  priceUsd: number;
  priceChange24h: number;
  createdAt: number;
  launchpad: string;
}

function formatAge(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : Math.floor(m / 60) < 24 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

function formatMcap(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
}

function formatPrice(p: number): string {
  return p === 0 ? '$0' : p < 0.000001 ? `$${p.toExponential(2)}` : p < 0.01 ? `$${p.toFixed(6)}` : `$${p.toFixed(4)}`;
}

function formatHolders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

const API_BASE = 'https://api.bstonkex.xyz';

export default function MarketSection() {
  const [selectedChain, setSelectedChain] = useState<string>('SOL');
  const [selectedLaunchpad, setSelectedLaunchpad] = useState<string>('pumpfun');
  const [activeTab, setActiveTab] = useState<string>('trending');
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingCached, setLoadingCached] = useState(true);

  // 1. Fetch cached tokens instantly on mount + launchpad change
  useEffect(() => {
    let cancelled = false;
    async function fetchCached() {
      setLoadingCached(true);
      try {
        const res = await fetch(`${API_BASE}/api/tokens/trenches/${selectedLaunchpad}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setTokens(data.map((t: any) => ({
            mint: t.mint || '',
            name: t.name || 'Unknown',
            symbol: t.symbol || '???',
            image: t.image || t.icon || null,
            progress: parseFloat(t.bondingCurveProgress) || 0,
            mcap: parseFloat(t.virtualMcap) || parseFloat(t.spotPrice || '0') * 1e9,
            holders: parseInt(t.holders) || 0,
            priceUsd: parseFloat(t.spotPrice) || 0,
            priceChange24h: parseFloat(t.priceChange24h) || 0,
            createdAt: parseInt(t.createdAt) || Date.now(),
            launchpad: t.launchpad || selectedLaunchpad,
          })));
        }
      } catch { /* offline — live feed populates */ }
      finally { if (!cancelled) setLoadingCached(false); }
    }
    fetchCached();
    return () => { cancelled = true; };
  }, [selectedLaunchpad]);

  // 2. Live PumpPortal WebSocket ingestion
  useEffect(() => {
    const unsub = onTokenCreate((r: TokenIndexRecord) => {
      setTokens(prev => {
        if (prev.some(t => t.mint === r.address)) return prev;
        return [{
          mint: r.address, name: r.name || 'Unknown', symbol: r.symbol || '???',
          image: r.icon || null, progress: r.bondingCurveProgress ?? 0,
          mcap: (r.price || 0) * 1e9, holders: (r as any).holders || 0,
          priceUsd: r.price || 0, priceChange24h: (r as any).priceChange24h ?? 0,
          createdAt: r.createdAt || Date.now(), launchpad: selectedLaunchpad,
        }, ...prev].slice(0, 300);
      });
    });

    const iv = setInterval(() => {
      setConnected(getStreamHealth().connected);
      setTokens(prev => prev.map(t => {
        const live = getLivePrice(t.mint);
        return live ? { ...t, progress: live.bondingCurveProgress, priceUsd: live.spotPrice } : t;
      }));
    }, 3000);

    return () => { unsub(); clearInterval(iv); };
  }, [selectedLaunchpad]);

  // 3. Filter tokens
  const filtered = tokens.filter(t => {
    switch (activeTab) {
      case 'new': return true;
      case 'bonding': return t.progress < 100;
      case 'migrated': return t.progress >= 100;
      case 'gainers': return t.priceChange24h > 0;
      case 'losers': return t.priceChange24h < 0;
      case 'trending': return t.holders > 50 || t.mcap > 50000;
      default: return true;
    }
  });

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px' }}>

      {/* ══════════ TIER 1: CHAIN SELECTOR ══════════ */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {CHAINS.map(ch => {
          const active = selectedChain === ch.key;
          return (
            <button
              key={ch.key}
              onClick={() => {
                setSelectedChain(ch.key);
                const pads = LAUNCHPADS_BY_CHAIN[ch.key];
                if (pads?.length) setSelectedLaunchpad(pads[0].id);
              }}
              style={{
                padding: '7px 16px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                background: active ? '#EC489922' : 'var(--bg-surface, #111827)',
                color: active ? '#EC4899' : 'var(--text-dim, #9CA3AF)',
                border: `2px solid ${active ? '#EC4899' : 'var(--border, #1F2937)'}`,
                transition: 'all 0.15s',
              }}
            >
              {ch.label}
            </button>
          );
        })}
      </div>

      {/* ══════════ TIER 2: LAUNCHPAD LIST ══════════ */}
      {selectedChain !== 'ALL' && LAUNCHPADS_BY_CHAIN[selectedChain] && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <span style={{
            fontSize: 9, color: 'var(--text-dim, #6B7280)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontWeight: 700, flexShrink: 0,
          }}>Launchpads:</span>
          {LAUNCHPADS_BY_CHAIN[selectedChain].map(pad => {
            const active = selectedLaunchpad === pad.id;
            return (
              <button
                key={pad.id}
                onClick={() => setSelectedLaunchpad(pad.id)}
                style={{
                  padding: '5px 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: active ? `${pad.color}18` : 'var(--bg-surface, #111827)',
                  color: active ? pad.color : 'var(--text-dim, #9CA3AF)',
                  border: `1.5px solid ${active ? pad.color : 'var(--border, #1F2937)'}`,
                  transition: 'all 0.15s',
                }}
              >
                <span>{pad.icon}</span>
                <span>{pad.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ══════════ TIER 3: FILTER BAR ══════════ */}
      <div style={{
        display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none',
        background: 'var(--bg-surface, rgba(0,0,0,0.3))',
        padding: 4, borderRadius: 12,
      }}>
        {FILTER_TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center',
                background: active ? '#DB2777' : 'transparent',
                color: active ? '#fff' : 'var(--text-dim, #9CA3AF)',
                transition: 'all 0.15s',
                boxShadow: active ? '0 2px 8px rgba(219,39,119,0.35)' : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════ TIER 4: TOKEN LIST ══════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px',
            color: 'var(--text-dim, #6B7280)', fontSize: 13,
            border: '2px dashed var(--border, #1F2937)', borderRadius: 16,
          }}>
            {loadingCached ? 'Loading cached tokens...' : `Waiting for ${selectedLaunchpad} token launches...`}
          </div>
        ) : (
          filtered.slice(0, 50).map(token => {
            const isPositive = token.priceChange24h >= 0;
            return (
              <div
                key={token.mint}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  background: 'var(--bg-surface, #111827)',
                  border: '1px solid var(--border, #1F2937)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-dim, #374151)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #1F2937)'; }}
              >
                {/* Left: Token Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <img
                    src={token.image && token.image.startsWith('http') ? token.image : '/fallback-token-icon.svg'}
                    alt={token.symbol}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: '#2D1B69', border: '1.5px solid #4C1D95',
                      objectFit: 'cover', flexShrink: 0,
                    }}
                    onError={e => { (e.target as HTMLImageElement).src = '/fallback-token-icon.svg'; }}
                  />
                  <div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: 700, color: 'var(--text, #F9FAFB)',
                    }}>
                      {token.symbol}
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 6,
                        background: '#22C55E22', color: '#22C55E', fontWeight: 700,
                      }}>pump</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim, #9CA3AF)', marginTop: 2 }}>
                      {formatAge(token.createdAt)} • {formatMcap(token.mcap)}
                      {token.holders > 0 && <span> • {formatHolders(token.holders)} holders</span>}
                    </div>
                  </div>
                </div>

                {/* Right: Price + Change */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #E5E7EB)', fontFamily: 'monospace' }}>
                    {formatPrice(token.priceUsd)}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: isPositive ? '#34D399' : '#FB7185',
                  }}>
                    {isPositive ? '+' : ''}{token.priceChange24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ══════════ STATUS BAR ══════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 10, fontWeight: 600, color: connected ? '#22C55E' : '#EF4444',
        padding: 4,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: 3,
          background: connected ? '#22C55E' : '#EF4444',
        }} />
        {connected ? 'LIVE · PumpPortal WebSocket' : 'OFFLINE · Reconnecting...'}
      </div>
    </div>
  );
}
