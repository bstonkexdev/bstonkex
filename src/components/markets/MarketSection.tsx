import { useState, useEffect } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import { CHAINS, LAUNCHPADS_BY_CHAIN, FILTER_TABS } from './ChainLaunchpads';

interface Token {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  progress: number;
  mcap: number;
  holders: number;
  priceUsd: number;
  change24h: number;
  createdAt: number;
}

function age(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s` : Math.floor(s / 60) < 60 ? `${Math.floor(s / 60)}m` : Math.floor(s / 3600) < 24 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

function fmtMcap(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
}

function fmtPrice(p: number): string {
  return p === 0 ? '$0.0000' : p < 0.000001 ? `$${p.toExponential(2)}` : `$${p.toFixed(4)}`;
}

const API = 'https://api.bstonkex.xyz';

export default function MarketSection() {
  const [chain, setChain] = useState<string>('SOL');
  const [launchpad, setLaunchpad] = useState<string>('pumpfun');
  const [subFilter, setSubFilter] = useState<string>('trending');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auto-reset launchpad when chain changes
  function handleChainChange(c: string) {
    setChain(c);
    const pads = LAUNCHPADS_BY_CHAIN[c];
    setLaunchpad(pads?.length ? pads[0].id : '');
  }

  // 1. Fetch cached tokens instantly on load
  useEffect(() => {
    if (!launchpad) { setLoading(false); return; }
    let cancelled = false;
    async function fetchCached() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/tokens/trenches/${launchpad}`);
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
            change24h: parseFloat(t.priceChange24h || t.change24h) || 0,
            createdAt: parseInt(t.createdAt) || Date.now(),
          })));
        }
      } catch { /* offline */ }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchCached();
    return () => { cancelled = true; };
  }, [chain, launchpad]);

  // 2. Live WebSocket ingestion
  useEffect(() => {
    const unsub = onTokenCreate((r: any) => {
      setTokens(prev => {
        if (prev.some(t => t.mint === r.address)) return prev;
        return [{
          mint: r.address, name: r.name || 'Unknown', symbol: r.symbol || '???',
          image: r.icon || null, progress: r.bondingCurveProgress ?? 0,
          mcap: (r.price || 0) * 1e9, holders: r.holders || 0,
          priceUsd: r.price || 0, change24h: r.priceChange24h ?? 0,
          createdAt: r.createdAt || Date.now(),
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
  }, []);

  // 3. Filter tokens
  const filtered = tokens.filter(t => {
    switch (subFilter) {
      case 'bonding': return t.progress < 100;
      case 'migrated': return t.progress >= 100;
      case 'gainers': return t.change24h > 0;
      case 'losers': return t.change24h < 0;
      case 'trending': return t.holders > 50 || t.mcap > 50000;
      default: return true;
    }
  });

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', fontFamily: 'monospace' }}>

      {/* ═══ TIER 1: CHAIN DRAWER (8 chains) ═══ */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none',
        paddingBottom: 8, borderBottom: '1px solid #1F2937',
      }}>
        {CHAINS.map(c => {
          const active = chain === c;
          return (
            <button
              key={c}
              onClick={() => handleChainChange(c)}
              style={{
                padding: '7px 16px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                background: active ? 'rgba(236,72,153,0.15)' : '#111827',
                color: active ? '#F472B6' : '#9CA3AF',
                border: `1.5px solid ${active ? '#EC4899' : '#1F2937'}`,
                boxShadow: active ? '0 2px 8px rgba(236,72,153,0.25)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* ═══ TIER 2: LAUNCHPAD LIST ═══ */}
      {launchpad && LAUNCHPADS_BY_CHAIN[chain] && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <span style={{
            fontSize: 10, color: '#6B7280', textTransform: 'uppercase',
            letterSpacing: '0.08em', fontWeight: 700, flexShrink: 0,
          }}>Launchpad:</span>
          {LAUNCHPADS_BY_CHAIN[chain].map(pad => {
            const active = launchpad === pad.id;
            return (
              <button
                key={pad.id}
                onClick={() => setLaunchpad(pad.id)}
                style={{
                  padding: '6px 12px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                  fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: active ? 'rgba(88,28,135,0.6)' : '#111827',
                  color: active ? '#C4B5FD' : '#9CA3AF',
                  border: `1.5px solid ${active ? '#8B5CF6' : '#1F2937'}`,
                  boxShadow: active ? '0 2px 8px rgba(139,92,246,0.2)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <img
                  src={`/assets/launchpads/${pad.id}.png`}
                  alt=""
                  style={{ width: 16, height: 16, borderRadius: 8, objectFit: 'contain' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span>{pad.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ TIER 3: SUB-FILTER TOOLBAR ═══ */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
        background: 'rgba(17,24,39,0.9)', padding: 6, borderRadius: 14,
        border: '1px solid #1F2937',
      }}>
        {FILTER_TABS.map(f => {
          const active = subFilter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setSubFilter(f.id)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center',
                background: active ? '#DB2777' : 'transparent',
                color: active ? '#fff' : '#9CA3AF',
                boxShadow: active ? '0 2px 8px rgba(219,39,119,0.35)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ═══ TIER 4: TOKEN FEED ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px', color: '#6B7280', fontSize: 13,
            border: '2px dashed #1F2937', borderRadius: 14,
          }}>
            {loading ? 'Loading cached tokens...' : `Waiting for ${launchpad ? launchpad.toUpperCase() : chain} token launches...`}
          </div>
        ) : (
          filtered.slice(0, 50).map(t => {
            const pos = t.change24h >= 0;
            return (
              <div
                key={t.mint}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  background: '#111827', border: '1px solid #1F2937',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#374151'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#1F2937'; }}
              >
                {/* Left: Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    src={t.image && t.image.startsWith('http') ? t.image : '/fallback-token-icon.svg'}
                    alt={t.symbol}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: '#2D1B69', border: '1.5px solid #4C1D95', objectFit: 'cover',
                    }}
                    onError={e => { (e.target as HTMLImageElement).src = '/fallback-token-icon.svg'; }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff' }}>
                      {t.symbol}
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        background: 'rgba(16,185,129,0.15)', color: '#34D399', fontWeight: 700,
                      }}>{chain.toLowerCase()}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>
                      {age(t.createdAt)} • {fmtMcap(t.mcap)}
                      {t.holders > 0 && ` • ${(t.holders >= 1000 ? `${(t.holders / 1000).toFixed(1)}K` : t.holders)} holders`}
                    </div>
                  </div>
                </div>

                {/* Right: Price & Change */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#E5E7EB' }}>
                    {fmtPrice(t.priceUsd)}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: pos ? '#34D399' : '#FB7185',
                  }}>
                    {pos ? '+' : ''}{t.change24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ═══ STATUS BAR ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 10, fontWeight: 600, color: connected ? '#22C55E' : '#EF4444', padding: 4,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: connected ? '#22C55E' : '#EF4444' }} />
        {connected ? 'LIVE · PumpPortal WebSocket' : 'OFFLINE · Reconnecting...'}
      </div>
    </div>
  );
}
