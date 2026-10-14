import { useState, useEffect, useRef } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import { CHAIN_LIST, LAUNCHPADS_BY_CHAIN, FILTER_TABS, getChainInfo } from './ChainLaunchpads';
import TokenAvatar from './TokenAvatar';
import { fetchBootstrapTokens, type BootstrapToken } from '../../lib/engine/market-bootstrapper';

interface Token {
  mint: string; name: string; symbol: string; image: string | null;
  progress: number; mcap: number; holders: number;
  priceUsd: number; change24h: number; createdAt: number;
  volume24h: number; liquidity: number; buys24h: number; sells24h: number;
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

const API = 'https://api.bstonkex.xyz';

// Sky blue palette
const SKY_BG = '#E0F2FE';
const SKY_BG_LIGHT = '#F0F9FF';
const SKY_BG_MED = '#BAE6FD';
const SKY_BORDER = '#7DD3FC';
const SKY_ACCENT = '#0284C7';
const DARK_TEXT = '#0C2340';
const MID_TEXT = '#3B5998';
const LIGHT_TEXT = '#5B8DB8';

export default function MarketSection({ onTokenClick }: { onTokenClick?: (t: { chainId: string; address: string; name: string; symbol: string }) => void }) {
  const [chain, setChain] = useState<string>('SOL');
  const [launchpad, setLaunchpad] = useState<string>('pumpfun');
  const [subFilter, setSubFilter] = useState<string>('trending');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chainDrawerOpen, setChainDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close chain drawer on outside click
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

  // 1. Fetch tokens: bootstrapper FIRST (instant), then backend enriches
  useEffect(() => {
    if (!launchpad) { setLoading(false); return; }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function mapToken(t: any) {
      let img = (t.image || t.icon || '').trim();
      if (img.startsWith('ipfs://')) {
        img = 'https://cf-ipfs.com/ipfs/' + img.replace('ipfs://', '').replace(/^ipfs\//, '');
      }
      return {
        mint: t.mint || '', name: t.name || 'Unknown', symbol: t.symbol || '???',
        image: img || null,
        progress: parseFloat(t.bondingCurveProgress) || 0,
        mcap: parseFloat(t.virtualMcap) || 0,
        holders: parseInt(t.holders) || 0,
        priceUsd: parseFloat(t.spotPrice || t.price) || 0,
        change24h: parseFloat(t.priceChange24h || t.change24h) || 0,
        createdAt: parseInt(t.createdAt) || Date.now(),
        volume24h: parseFloat(t.volume24h) || 0,
        liquidity: parseFloat(t.liquidity) || 0,
        buys24h: parseInt(t.buys24h) || 0,
        sells24h: parseInt(t.sells24h) || 0,
      };
    }

    // Step 1: Fetch from bootstrapper IMMEDIATELY (DexScreener + GeckoTerminal + PumpPortal)
    const chainMap: Record<string, string> = { SOL: 'sol', ETH: 'eth', BSC: 'bsc', BASE: 'base' };
    const targetChain = chainMap[chain] || chain.toLowerCase();
    fetchBootstrapTokens(true).then(bootstrapTokens => {
      if (cancelled) return;
      const filtered = bootstrapTokens
        .filter(t => targetChain === 'all' || t.chain === targetChain)
        .map(mapToken);
      if (filtered.length > 0) {
        setTokens(filtered);
      }
      setLoading(false); // Always stop loading after bootstrapper returns
    }).catch((err) => {
      if (cancelled) return;
      console.warn('[MarketSection] Bootstrapper failed:', err);
      setLoading(false); // Stop loading even on failure
    });

    // Step 2: Fetch from backend API (enriches bootstrapper data)
    async function fetchBackend(retryCount = 0) {
      if (cancelled) return;
      try {
        const query = `chain=${chain.toLowerCase()}&launchpad=${launchpad.toLowerCase()}&subFilter=${subFilter}`;
        const res = await fetch(`${API}/api/tokens/cached?${query}`);
        const data = await res.json();
        if (cancelled) return;

        if (Array.isArray(data) && data.length > 0) {
          // Backend has data — merge with existing (bootstrapper) tokens
          const backendTokens = data.map(mapToken);
          setTokens(prev => {
            if (prev.length === 0) return backendTokens;
            // Merge: backend tokens take priority, keep bootstrapper-only tokens
            const byMint = new Map(prev.map(t => [t.mint, t]));
            for (const t of backendTokens) {
              const existing = byMint.get(t.mint);
              if (existing) {
                // Backend data enriches bootstrapper data
                if (t.volume24h > 0) existing.volume24h = t.volume24h;
                if (t.mcap > 0) existing.mcap = t.mcap;
                if (t.liquidity > 0) existing.liquidity = t.liquidity;
                if (t.holders > 0) existing.holders = t.holders;
                if (t.buys24h > 0) existing.buys24h = t.buys24h;
                if (t.sells24h > 0) existing.sells24h = t.sells24h;
                if (t.priceUsd > 0) existing.priceUsd = t.priceUsd;
                if (t.change24h !== 0) existing.change24h = t.change24h;
                if (t.name !== 'Unknown') existing.name = t.name;
                if (t.symbol !== '???') existing.symbol = t.symbol;
                if (t.image) existing.image = t.image;
              } else {
                byMint.set(t.mint, t);
              }
            }
            return [...byMint.values()];
          });
          setLoading(false);
        } else if (retryCount < 3) {
          // Backend empty — retry after delay (bootstrap may still be running)
          retryTimer = setTimeout(() => fetchBackend(retryCount + 1), 3000);
        }
      } catch {
        // Offline — bootstrapper data is already shown
        if (retryCount < 2) {
          retryTimer = setTimeout(() => fetchBackend(retryCount + 1), 5000);
        }
      }
      finally { if (!cancelled && !retryTimer) setLoading(false); }
    }

    fetchBackend();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [chain, launchpad, subFilter]);

  // 2. Live WS merge — handles both new tokens AND metadata-resolved updates
  useEffect(() => {
    const unsub = onTokenCreate((r: any) => {
      setTokens(prev => {
        const existingIdx = prev.findIndex(t => t.mint === r.address);
        if (existingIdx >= 0) {
          // Update existing token (metadata resolved → real image URL)
          const updated = [...prev];
          const existing = updated[existingIdx];
          updated[existingIdx] = {
            ...existing,
            image: r.icon || existing.image, // Replace with resolved image if available
            name: r.name || existing.name,
            symbol: r.symbol || existing.symbol,
          };
          return updated;
        }
        // New token — prepend
        return [{
          mint: r.address, name: r.name || 'Unknown', symbol: r.symbol || '???',
          image: r.icon || null, progress: r.bondingCurveProgress ?? 0,
          mcap: r.marketCap || (r.price || 0) * 1e9, holders: 0,
          priceUsd: r.price || 0, change24h: 0,
          createdAt: r.createdAt || Date.now(),
          volume24h: 0, liquidity: r.liquidity || 0,
          buys24h: 0, sells24h: 0,
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

  // 3. Client-side filter + sort
  const filtered = tokens.filter(t => {
    switch (subFilter) {
      case 'bonding': return t.progress < 100;
      case 'migrated': return t.progress >= 100;
      case 'gainers': return t.change24h > 0;
      case 'losers': return t.change24h < 0;
      case 'trending': return true; // Show ALL tokens — sort by volume+mcap handles ranking
      case 'volume': return true;   // Show ALL — volume sort handles ordering
      default: return true;
    }
  }).sort((a, b) => {
    switch (subFilter) {
      case 'volume': return b.volume24h - a.volume24h;
      case 'gainers': return b.change24h - a.change24h;
      case 'losers': return a.change24h - b.change24h;
      case 'trending': return (b.volume24h + b.mcap + b.createdAt * 0.001) - (a.volume24h + a.mcap + a.createdAt * 0.001);
      default: return b.createdAt - a.createdAt; // newest first
    }
  });

  const activeChain = getChainInfo(chain);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px', fontFamily: 'monospace' }}>

      {/* ═══ TIER 1: CHAIN DRAWER (dropdown) ═══ */}
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
            <div style={{ fontSize: 13, fontWeight: 700, color: DARK_TEXT }}>{activeChain?.label || chain}</div>
            <div style={{ fontSize: 9, color: MID_TEXT }}>{LAUNCHPADS_BY_CHAIN[chain]?.length || 0} launchpads</div>
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
                    background: active ? SKY_BG_MED : 'transparent',
                    border: 'none', borderBottom: `1px solid ${SKY_BORDER}`,
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = SKY_BG_LIGHT; }}
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? SKY_ACCENT : DARK_TEXT }}>{c.label}</div>
                    <div style={{ fontSize: 10, color: LIGHT_TEXT }}>{padCount} launchpad{padCount !== 1 ? 's' : ''}</div>
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
                    src={pad.logo} alt=""
                    style={{ width: 16, height: 16, borderRadius: 8, objectFit: 'cover', background: '#fff' }}
                    onError={e => {
                      const el = e.target as HTMLImageElement;
                      el.style.display = 'none';
                      const badge = el.nextElementSibling as HTMLElement;
                      if (badge) badge.style.display = 'flex';
                    }}
                  />
                ) : null}
                <span style={{
                  display: pad.logo ? 'none' : 'flex',
                  width: 16, height: 16, borderRadius: 8,
                  background: pad.brandColor, color: '#fff',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 800, flexShrink: 0,
                }}>{pad.initials}</span>
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
        {loading ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px', color: MID_TEXT, fontSize: 13,
            border: `2px dashed ${SKY_BORDER}`, borderRadius: 14, background: SKY_BG_LIGHT,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              border: `3px solid ${SKY_BORDER}`, borderTopColor: SKY_ACCENT,
              animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
            }} />
            Loading cached tokens...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 16px', color: MID_TEXT, fontSize: 13,
            border: `2px dashed ${SKY_BORDER}`, borderRadius: 14, background: SKY_BG_LIGHT,
          }}>
            No cached tokens found for <strong>{launchpad ? launchpad.toUpperCase() : chain}</strong>.
          </div>
        ) : (
          filtered.slice(0, 50).map(t => {
            const pos = t.change24h >= 0;
            return (
              <div
                key={t.mint}
                onClick={() => onTokenClick?.({ chainId: chain.toLowerCase() === 'sol' ? 'solana' : chain.toLowerCase(), address: t.mint, name: t.name, symbol: t.symbol })}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                  background: SKY_BG_LIGHT, border: `1px solid ${SKY_BORDER}`,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = SKY_ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = SKY_BORDER; }}
              >
                {/* Left: Avatar + Identity */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <TokenAvatar src={t.image} symbol={t.symbol} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: DARK_TEXT }}>
                      {t.symbol}
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        background: '#D1FAE5', color: '#065F46', fontWeight: 700,
                      }}>{chain.toLowerCase()}</span>
                    </div>
                    <div style={{ fontSize: 10, color: MID_TEXT, marginTop: 2 }}>
                      {t.name} • {fmtMcap(t.mcap)} MCAP{t.volume24h > 0 ? ` • ${fmtMcap(t.volume24h)} VOL` : ''}
                    </div>
                  </div>
                </div>

                {/* Right: Price & Change */}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
