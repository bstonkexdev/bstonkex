import { useState, useEffect, useRef } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import { CHAIN_LIST, LAUNCHPADS_BY_CHAIN, FILTER_TABS, getChainInfo } from './ChainLaunchpads';

interface Token {
  mint: string; name: string; symbol: string; image: string | null;
  progress: number; mcap: number; holders: number;
  priceUsd: number; change24h: number; createdAt: number;
}

function age(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}
function fmtMcap(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
}
function fmtPrice(p: number): string {
  return p === 0 ? '$0.0000' : p < 0.000001 ? `$${p.toExponential(2)}` : `$${p.toFixed(4)}`;
}
function fmtHolders(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

const API = 'https://api.bstonkex.xyz';

// Sky blue palette
const SKY_BG = '#E0F2FE';       // main box background
const SKY_BG_LIGHT = '#F0F9FF'; // lighter cards
const SKY_BG_MED = '#BAE6FD';   // medium — launchpad buttons, filter bar
const SKY_BORDER = '#7DD3FC';   // borders
const SKY_ACCENT = '#0284C7';   // active accent (sky-600)
const DARK_TEXT = '#0C2340';    // primary text — very dark navy
const MID_TEXT = '#3B5998';     // secondary text — readable mid-tone
const LIGHT_TEXT = '#5B8DB8';   // tertiary / hints

export default function MarketSection() {
  const [chain, setChain] = useState<string>('SOL');
  const [launchpad, setLaunchpad] = useState<string>('pumpfun');
  const [subFilter, setSubFilter] = useState<string>('trending');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chainDrawerOpen, setChainDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setChainDrawerOpen(false);
    }
    if (chainDrawerOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [chainDrawerOpen]);

  function handleChainChange(c: string) {
    setChain(c);
    const pads = LAUNCHPADS_BY_CHAIN[c];
    setLaunchpad(pads?.length ? pads[0].id : '');
    setChainDrawerOpen(false);
  }

  useEffect(() => {
    if (!launchpad) { setLoading(false); return; }
    let cancelled = false;
    async function fetchCached() {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/tokens/cached?chain=${chain.toLowerCase()}&launchpad=${launchpad.toLowerCase()}&subFilter=${subFilter}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setTokens(data.map((t: any) => ({
            mint: t.mint || '', name: t.name || 'Unknown', symbol: t.symbol || '???',
            image: t.image || t.icon || null,
            progress: parseFloat(t.bondingCurveProgress) || 0,
            mcap: parseFloat(t.virtualMcap) || parseFloat(t.spotPrice || t.price || '0') * 1e9,
            holders: parseInt(t.holders) || 0,
            priceUsd: parseFloat(t.spotPrice || t.price) || 0,
            change24h: parseFloat(t.priceChange24h || t.change24h) || 0,
            createdAt: parseInt(t.createdAt) || Date.now(),
          })));
        }
      } catch { /* offline */ }
      finally { if (!cancelled) setLoading(false); }
    }
    fetchCached();
    return () => { cancelled = true; };
  }, [chain, launchpad, subFilter]);

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

  const activeChain = getChainInfo(chain);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', fontFamily: 'monospace' }}>

      {/* ═══ TIER 1: CHAIN DRAWER ═══ */}
      <div ref={drawerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setChainDrawerOpen(!chainDrawerOpen)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 14, cursor: 'pointer',
            background: SKY_BG_MED, border: `2px solid ${SKY_ACCENT}`,
            minWidth: 180,
          }}
        >
          {activeChain?.logo ? (
            <img src={activeChain.logo} alt="" style={{ width: 22, height: 22, borderRadius: 11 }} />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: 11,
              background: activeChain?.color || SKY_ACCENT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff',
            }}>{chain[0]}</div>
          )}
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: DARK_TEXT }}>
              {activeChain?.label || chain}
            </div>
            <div style={{ fontSize: 9, color: MID_TEXT }}>
              {LAUNCHPADS_BY_CHAIN[chain]?.length || 0} launchpads
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
            transform: chainDrawerOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s',
          }}>
            <path d="M3 4.5L6 7.5L9 4.5" stroke={DARK_TEXT} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {chainDrawerOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            marginTop: 6, borderRadius: 14, overflow: 'hidden',
            background: SKY_BG, border: `2px solid ${SKY_BORDER}`,
            boxShadow: '0 12px 40px rgba(2,132,199,0.25)',
          }}>
            {CHAIN_LIST.map(c => {
              const active = chain === c.key;
              const padCount = LAUNCHPADS_BY_CHAIN[c.key]?.length || 0;
              return (
                <button
                  key={c.key}
                  onClick={() => handleChainChange(c.key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', cursor: 'pointer',
                    background: active ? '#BAE6FD' : 'transparent',
                    border: 'none', borderBottom: `1px solid ${SKY_BORDER}`,
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F0F9FF'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {c.logo ? (
                    <img src={c.logo} alt="" style={{ width: 28, height: 28, borderRadius: 14 }} />
                  ) : (
                    <div style={{
                      width: 28, height: 28, borderRadius: 14,
                      background: c.color, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff',
                    }}>{c.label[0]}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? SKY_ACCENT : DARK_TEXT }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: 10, color: LIGHT_TEXT }}>
                      {padCount} launchpad{padCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {active && <div style={{ width: 8, height: 8, borderRadius: 4, background: SKY_ACCENT }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ TIER 2: LAUNCHPAD LIST ═══ */}
      {launchpad && LAUNCHPADS_BY_CHAIN[chain] && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          <span style={{
            fontSize: 10, color: MID_TEXT, textTransform: 'uppercase',
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
                  background: active ? SKY_ACCENT : SKY_BG_LIGHT,
                  color: active ? '#fff' : DARK_TEXT,
                  border: `1.5px solid ${active ? SKY_ACCENT : SKY_BORDER}`,
                  boxShadow: active ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {pad.logo ? (
                  <img
                    src={pad.logo}
                    alt=""
                    style={{ width: 16, height: 16, borderRadius: 8, objectFit: 'cover', background: '#fff' }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                      // Show initials badge as fallback
                      const badge = el.nextElementSibling as HTMLElement;
                      if (badge) badge.style.display = 'flex';
                    }}
                  />
                ) : null}
                <span
                  className="launchpad-initials-badge"
                  style={{
                    display: pad.logo ? 'none' : 'flex',
                    width: 16, height: 16, borderRadius: 8,
                    background: pad.brandColor, color: '#fff',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 7, fontWeight: 800, flexShrink: 0,
                  }}
                >{pad.initials}</span>
                <span>{pad.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ TIER 3: FILTER TOOLBAR ═══ */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
        background: SKY_BG_MED, padding: 6, borderRadius: 14,
        border: `1px solid ${SKY_BORDER}`,
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
                background: active ? SKY_ACCENT : 'transparent',
                color: active ? '#fff' : DARK_TEXT,
                boxShadow: active ? '0 2px 8px rgba(2,132,199,0.35)' : 'none',
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
            textAlign: 'center', padding: '48px 16px', color: MID_TEXT, fontSize: 13,
            border: `2px dashed ${SKY_BORDER}`, borderRadius: 14, background: SKY_BG_LIGHT,
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
                  background: SKY_BG_LIGHT, border: `1px solid ${SKY_BORDER}`,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = SKY_ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = SKY_BORDER; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    src={t.image && t.image.startsWith('http') ? t.image : '/fallback-token-icon.svg'}
                    alt={t.symbol}
                    style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: '#E0E7FF', border: '1.5px solid #C7D2FE', objectFit: 'cover',
                    }}
                    onError={e => { (e.target as HTMLImageElement).src = '/fallback-token-icon.svg'; }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: DARK_TEXT }}>
                      {t.symbol}
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        background: '#D1FAE5', color: '#065F46', fontWeight: 700,
                      }}>{chain.toLowerCase()}</span>
                    </div>
                    <div style={{ fontSize: 10, color: MID_TEXT, marginTop: 2 }}>
                      {age(t.createdAt)} • {fmtMcap(t.mcap)}
                      {t.holders > 0 && ` • ${fmtHolders(t.holders)} holders`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: DARK_TEXT }}>{fmtPrice(t.priceUsd)}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: pos ? '#059669' : '#DC2626' }}>
                    {pos ? '+' : ''}{t.change24h.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ═══ STATUS ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 10, fontWeight: 600, color: connected ? '#059669' : '#DC2626', padding: 4,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: connected ? '#059669' : '#DC2626' }} />
        {connected ? 'LIVE · PumpPortal WebSocket' : 'OFFLINE · Reconnecting...'}
      </div>
    </div>
  );
}
