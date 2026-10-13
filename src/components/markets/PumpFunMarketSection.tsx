import { useState, useEffect, useCallback } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import type { TokenIndexRecord } from '../../lib/engine/discovery/types';

interface PumpToken {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  progress: number;
  mcap: number;
  age: string;
  priceChange24h: number;
  createdAt: number;
  spotPrice: number;
}

function formatAge(createdAt: number): string {
  const s = Math.floor((Date.now() - createdAt) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function formatMcap(usd: number): string {
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `${(usd / 1e3).toFixed(0)}K`;
  return `${usd.toFixed(0)}`;
}

const SUB_FILTERS = [
  { id: 'new' as const, label: '✨ New' },
  { id: 'bonding' as const, label: '🫧 Bonding' },
  { id: 'migrated' as const, label: '🔄 Migrated' },
  { id: 'gainers' as const, label: '📈 Gainers' },
  { id: 'losers' as const, label: '📉 Losers' },
];

const LAUNCHPADS = [
  { id: 'pumpfun', label: '🟢 Pump.fun' },
  { id: 'bags', label: '🟣 Bags' },
  { id: 'stonk', label: '🟡 Stonk' },
  { id: 'fourmeme', label: '🔵 Four.meme' },
];

type SubFilter = typeof SUB_FILTERS[number]['id'];

const API_BASE = 'https://api.bstonkex.xyz';

export default function PumpFunMarketSection() {
  const [activeSubFilter, setActiveSubFilter] = useState<SubFilter>('bonding');
  const [activeLaunchpad, setActiveLaunchpad] = useState('pumpfun');
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingCached, setLoadingCached] = useState(true);

  // Fetch cached tokens from backend — populates list instantly
  useEffect(() => {
    async function fetchCachedTokens() {
      setLoadingCached(true);
      try {
        const response = await fetch(`${API_BASE}/api/tokens/trenches/${activeLaunchpad}`);
        const cachedTokens = await response.json();
        if (Array.isArray(cachedTokens) && cachedTokens.length > 0) {
          const parsed: PumpToken[] = cachedTokens.map((t: any) => ({
            mint: t.mint || '',
            name: t.name || 'Unknown',
            symbol: t.symbol || '???',
            image: t.image || t.icon || null,
            progress: parseFloat(t.bondingCurveProgress) || 0,
            mcap: parseFloat(t.virtualMcap) || parseFloat(t.spotPrice || '0') * 1e9,
            age: formatAge(parseInt(t.createdAt) || Date.now()),
            priceChange24h: parseFloat(t.priceChange24h) || 0,
            createdAt: parseInt(t.createdAt) || Date.now(),
            spotPrice: parseFloat(t.spotPrice) || 0,
          }));
          setTokens(parsed);
        }
      } catch (err) {
        console.error('Failed to load cached tokens:', err);
      } finally {
        setLoadingCached(false);
      }
    }
    fetchCachedTokens();
  }, [activeLaunchpad]);

  // Ingest PumpPortal live tokens
  useEffect(() => {
    const unsub = onTokenCreate((record: TokenIndexRecord) => {
      const token: PumpToken = {
        mint: record.address,
        name: record.name || 'Unknown',
        symbol: record.symbol || '???',
        image: record.icon || null,
        progress: record.bondingCurveProgress ?? 0,
        mcap: (record.price || 0) * 1e9,
        age: formatAge(record.createdAt || Date.now()),
        priceChange24h: (record as any).priceChange24h ?? 0,
        createdAt: record.createdAt || Date.now(),
        spotPrice: record.price || 0,
      };
      setTokens(prev => {
        if (prev.some(t => t.mint === token.mint)) return prev;
        return [token, ...prev].slice(0, 200);
      });
    });

    const iv = setInterval(() => {
      const h = getStreamHealth();
      setConnected(h.connected);
      // Refresh age strings
      setTokens(prev => prev.map(t => ({ ...t, age: formatAge(t.createdAt) })));
      // Refresh bonding progress from live prices
      setTokens(prev => prev.map(t => {
        const live = getLivePrice(t.mint);
        return live ? { ...t, progress: live.bondingCurveProgress, spotPrice: live.spotPrice } : t;
      }));
    }, 3000);

    return () => { unsub(); clearInterval(iv); };
  }, []);

  const displayedTokens = tokens.filter((token) => {
    if (activeSubFilter === 'new') return true;
    if (activeSubFilter === 'bonding') return token.progress < 100;
    if (activeSubFilter === 'migrated') return token.progress >= 100;
    if (activeSubFilter === 'gainers') return token.priceChange24h > 0;
    if (activeSubFilter === 'losers') return token.priceChange24h < 0;
    return true;
  });

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Launchpad Selector */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {LAUNCHPADS.map(lp => (
          <button
            key={lp.id}
            onClick={() => setActiveLaunchpad(lp.id)}
            style={{
              padding: '5px 12px', borderRadius: 16, cursor: 'pointer',
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
              background: activeLaunchpad === lp.id ? '#22C55E' : 'var(--bg-surface, #fff)',
              color: activeLaunchpad === lp.id ? '#fff' : 'var(--text-dim, #6B7280)',
              border: activeLaunchpad === lp.id ? '2px solid #22C55E' : '2px solid var(--border, #E5E7EB)',
              transition: 'all 0.15s',
            }}
          >
            {lp.label}
          </button>
        ))}
      </div>

      {/* Sub-Filter Bar */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0',
        scrollbarWidth: 'none',
      }}>
        {SUB_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveSubFilter(f.id)}
            style={{
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              background: activeSubFilter === f.id ? '#1A1A2E' : 'var(--bg-surface, #fff)',
              color: activeSubFilter === f.id ? '#fff' : 'var(--text-dim, #6B7280)',
              border: activeSubFilter === f.id ? '2px solid #1A1A2E' : '2px solid var(--border, #E5E7EB)',
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
        {/* Live indicator */}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 9, color: connected ? '#22C55E' : '#EF4444', fontWeight: 700,
          alignSelf: 'center', whiteSpace: 'nowrap',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: 3,
            background: connected ? '#22C55E' : '#EF4444',
            animation: connected ? 'pulse 2s infinite' : 'none',
          }} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
      </div>

      {/* Clean Token Table */}
      <div style={{
        width: '100%', borderRadius: 12,
        background: 'var(--bg-surface, #FAF7F2)',
        border: '1px solid var(--border, #EBE3D5)',
        overflow: 'hidden',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 100px 1fr',
          padding: '8px 16px', borderBottom: '1px solid var(--border, #EBE3D5)',
          fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #6B7280)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <div>Token</div>
          <div>Age</div>
          <div>MCap</div>
          <div style={{ textAlign: 'right' }}>Bonding Curve</div>
        </div>

        {/* Live Token Feed Items */}
        {displayedTokens.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--text-dim, #9CA3AF)', fontSize: 12,
          }}>
            <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.3 }}>📡</div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {loadingCached ? 'Loading cached tokens...' : connected ? 'Waiting for new token launches...' : 'Connecting to PumpPortal...'}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>
              {loadingCached ? 'Fetching from API' : 'Tokens appear here in real-time'}
            </div>
          </div>
        ) : (
          displayedTokens.slice(0, 50).map((token) => (
            <div
              key={token.mint}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 100px 1fr',
                alignItems: 'center', padding: '10px 16px',
                borderBottom: '1px solid var(--border, #EBE3D5)',
                opacity: 0.6, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {/* Token Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={token.image && token.image.startsWith('http') ? token.image : '/fallback-token-icon.svg'}
                  alt={token.symbol}
                  style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover', background: 'var(--bg-elevated, #1A1A2E)' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/fallback-token-icon.svg';
                  }}
                />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #111827)' }}>
                    {token.name}
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--text-dim, #9CA3AF)',
                    fontFamily: 'monospace',
                  }}>
                    {token.mint.slice(0, 6)}...pump
                  </div>
                </div>
              </div>

              {/* Age */}
              <div style={{
                fontSize: 11, color: 'var(--text-dim, #6B7280)', fontFamily: 'monospace',
              }}>
                {token.age}
              </div>

              {/* MCap */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text, #1F2937)',
              }}>
                ${formatMcap(token.mcap)}
              </div>

              {/* Bonding Curve */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
              }}>
                <span style={{
                  fontSize: 10, color: 'var(--text-dim, #6B7280)', fontWeight: 700,
                }}>
                  {token.progress.toFixed(0)}%
                </span>
                <div style={{
                  width: 64, height: 8, borderRadius: 4,
                  background: 'var(--border, #E5E7EB)', overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%', width: `${Math.min(100, token.progress)}%`,
                      background: token.progress >= 100 ? '#3B82F6' : token.progress >= 80 ? '#EAB308' : '#10B981',
                      borderRadius: 4, transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
