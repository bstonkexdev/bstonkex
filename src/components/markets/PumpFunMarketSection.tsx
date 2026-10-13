import { useState, useEffect } from 'react';
import { onTokenCreate, getStreamHealth, getLivePrice } from '../../lib/engine/discovery/pumpportal-stream';
import type { TokenIndexRecord } from '../../lib/engine/discovery/types';

interface PumpToken {
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
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

function formatPrice(p: number): string {
  if (p === 0) return '$0';
  if (p < 0.000001) return `$${p.toExponential(2)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  return `$${p.toFixed(4)}`;
}

function formatHolders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const API_BASE = 'https://api.bstonkex.xyz';

interface Props {
  subFilter: string;
  launchpad: string;
}

export default function PumpFunMarketSection({ subFilter, launchpad }: Props) {
  const [tokens, setTokens] = useState<PumpToken[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadingCached, setLoadingCached] = useState(true);

  // 1. Fetch cached tokens on mount + launchpad change — instant population
  useEffect(() => {
    let cancelled = false;
    async function fetchCached() {
      setLoadingCached(true);
      try {
        const res = await fetch(`${API_BASE}/api/tokens/trenches/${launchpad}`);
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
          })));
        }
      } catch { /* offline — live feed will populate */ }
      finally { if (!cancelled) setLoadingCached(false); }
    }
    fetchCached();
    return () => { cancelled = true; };
  }, [launchpad]);

  // 2. Live WebSocket ingestion — merges new tokens in real-time
  useEffect(() => {
    const unsub = onTokenCreate((record: TokenIndexRecord) => {
      setTokens(prev => {
        if (prev.some(t => t.mint === record.address)) return prev;
        return [{
          mint: record.address,
          name: record.name || 'Unknown',
          symbol: record.symbol || '???',
          image: record.icon || null,
          progress: record.bondingCurveProgress ?? 0,
          mcap: (record.price || 0) * 1e9,
          holders: (record as any).holders || 0,
          priceUsd: record.price || 0,
          priceChange24h: (record as any).priceChange24h ?? 0,
          createdAt: record.createdAt || Date.now(),
        }, ...prev].slice(0, 200);
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

  // Filter tokens based on active sub-filter
  const filtered = tokens.filter(t => {
    switch (subFilter) {
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
    <div style={{
      width: '100%', borderRadius: 12,
      background: 'var(--bg-surface, #FAF7F2)',
      border: '1px solid var(--border, #EBE3D5)',
      overflow: 'hidden',
    }}>
      {/* Table Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 60px 90px 80px 90px 110px',
        padding: '8px 16px', borderBottom: '1px solid var(--border, #EBE3D5)',
        fontSize: 9, fontWeight: 700, color: 'var(--text-dim, #6B7280)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        alignItems: 'center',
      }}>
        <div>Token</div>
        <div>Age</div>
        <div>MCap</div>
        <div>Holders</div>
        <div>Price</div>
        <div style={{ textAlign: 'right' }}>Bonding Curve</div>
      </div>

      {/* Token Rows */}
      {filtered.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-dim, #9CA3AF)', fontSize: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.3 }}>📡</div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {loadingCached ? 'Loading cached tokens...' : connected ? 'Waiting for new token launches...' : 'Connecting to PumpPortal...'}
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>
            {loadingCached ? 'Fetching from API' : 'Tokens appear here in real-time'}
          </div>
        </div>
      ) : (
        filtered.slice(0, 50).map(token => {
          const isPositive = token.priceChange24h >= 0;
          const changeColor = isPositive ? '#16A34A' : '#DC2626';
          const changeBg = isPositive ? '#16A34A14' : '#DC262614';

          return (
            <div
              key={token.mint}
              style={{
                display: 'grid', gridTemplateColumns: '2fr 60px 90px 80px 90px 110px',
                alignItems: 'center', padding: '10px 16px',
                borderBottom: '1px solid var(--border, #EBE3D5)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Token: Image + Symbol + Address */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <img
                  src={token.image && token.image.startsWith('http') ? token.image : '/fallback-token-icon.svg'}
                  alt={token.symbol}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    objectFit: 'cover', flexShrink: 0,
                    background: 'var(--bg-elevated, #1A1A2E)',
                  }}
                  onError={e => { (e.target as HTMLImageElement).src = '/fallback-token-icon.svg'; }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: 'var(--text, #111827)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {token.symbol}
                    </span>
                    {token.priceChange24h !== 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px',
                        borderRadius: 8, color: changeColor, background: changeBg,
                      }}>
                        {isPositive ? '+' : ''}{token.priceChange24h.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 9, color: 'var(--text-dim, #9CA3AF)',
                    fontFamily: 'monospace', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                  </div>
                </div>
              </div>

              {/* Age */}
              <div style={{ fontSize: 11, color: 'var(--text-dim, #6B7280)', fontFamily: 'monospace' }}>
                {formatAge(token.createdAt)}
              </div>

              {/* Market Cap */}
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #1F2937)' }}>
                {formatMcap(token.mcap)}
              </div>

              {/* Holders */}
              <div style={{ fontSize: 11, color: 'var(--text-dim, #6B7280)', fontFamily: 'monospace' }}>
                {token.holders > 0 ? formatHolders(token.holders) : '—'}
              </div>

              {/* Price + 24h Change */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text, #1F2937)', fontFamily: 'monospace' }}>
                  {formatPrice(token.priceUsd)}
                </div>
              </div>

              {/* Bonding Curve */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: token.progress >= 100 ? '#3B82F6' : token.progress >= 80 ? '#EAB308' : '#10B981',
                }}>
                  {token.progress.toFixed(0)}%
                </span>
                <div style={{
                  width: 56, height: 6, borderRadius: 3,
                  background: 'var(--border, #E5E7EB)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${Math.min(100, token.progress)}%`,
                    background: token.progress >= 100 ? '#3B82F6' : token.progress >= 80 ? '#EAB308' : '#10B981',
                    borderRadius: 3, transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Live indicator footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '6px', fontSize: 9, fontWeight: 600,
        color: connected ? '#22C55E' : '#EF4444',
        background: 'var(--bg-elevated, rgba(0,0,0,0.02))',
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: 3,
          background: connected ? '#22C55E' : '#EF4444',
        }} />
        {connected ? 'LIVE · PumpPortal WebSocket' : 'OFFLINE · Reconnecting...'}
      </div>
    </div>
  );
}
