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

type SubFilter = typeof SUB_FILTERS[number]['id'];

export default function PumpFunMarketSection() {
  const [activeSubFilter, setActiveSubFilter] = useState<SubFilter>('bonding');
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [connected, setConnected] = useState(false);

  // Ingest PumpPortal tokens
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
              {connected ? 'Waiting for new token launches...' : 'Connecting to PumpPortal...'}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6 }}>Tokens appear here in real-time</div>
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
                {token.image ? (
                  <img
                    src={token.image}
                    alt={token.symbol}
                    style={{ width: 32, height: 32, borderRadius: 16, objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: 16,
                    background: 'linear-gradient(135deg, #22C55E22, #22C55E11)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#22C55E',
                  }}>
                    {token.symbol.slice(0, 2)}
                  </div>
                )}
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
