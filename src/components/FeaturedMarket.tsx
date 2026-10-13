// Cupcak8 Swap — Featured Market Panel (Redesigned)
// Clean metrics bar · Chart controls · Modern dark styling
import { useState, useEffect, useCallback, memo } from 'react';
import { CHAINS, formatUsd, formatPct } from '../lib/config';
import type { ChainId } from '../lib/config';
import type { MarketToken } from '../lib/market-discovery';
import { onMarketEvent, getDataFreshness, type MarketStreamEvent } from '../lib/engine/market-stream';
import { subscribeToken } from '../lib/engine/market-stream';
import ChainIcon from './ChainIcon';
import { ChartErrorBoundary } from './PriceChart';
import PriceChart from './PriceChart';

const D = {
  text: 'var(--text)', textSec: 'var(--text)', textMuted: 'var(--text-dim)',
  border: 'var(--border)', borderLight: 'var(--border-bright)',
  bg: 'var(--bg-deep)', bgAlt: 'var(--bg-elevated)', bgPanel: 'var(--bg-surface)',
  gold: 'var(--yellow)', goldBg: 'var(--yellow-bg)',
  green: 'var(--green)', greenBg: 'var(--green-bg)',
  red: 'var(--red)', redBg: 'var(--red-bg)',
  mono: "var(--font-mono)",
  font: "var(--font)",
} as const;

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Props {
  token: MarketToken | null;
  allMarkets: MarketToken[];
  onSelectMarket: (t: MarketToken) => void;
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default memo(function FeaturedMarket({ token, allMarkets, onSelectMarket }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [chartMode, setChartMode] = useState<'candles' | 'line'>('candles');
  const [fullscreen, setFullscreen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [dataStatus, setDataStatus] = useState<'LIVE' | 'DELAYED' | 'RECONNECTING' | 'OFFLINE'>('OFFLINE');
  const [buyVolume, setBuyVolume] = useState<number | null>(null);
  const [sellVolume, setSellVolume] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { setLivePrice(null); return; }
    setLivePrice(token.price);
    const unsub = subscribeToken(token.chainId, token.pairAddress, token.symbol);
    const unsubEvent = onMarketEvent((e: MarketStreamEvent) => {
      if (e.tokenAddress !== token.pairAddress || e.chainId !== token.chainId) return;
      if (e.type === 'price' && e.data.price != null) {
        setLivePrice(e.data.price);
      }
      if (e.type === 'stats') {
        if (e.data.buys24h != null) setBuyVolume(e.data.buys24h);
        if (e.data.sells24h != null) setSellVolume(e.data.sells24h);
      }
    });
    return () => { unsub(); unsubEvent(); };
  }, [token?.chainId, token?.pairAddress]);

  useEffect(() => {
    const update = () => setDataStatus(getDataFreshness());
    update();
    const iv = setInterval(update, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (token) setLivePrice(token.price);
  }, [token?.price]);

  const displayPrice = livePrice ?? token?.price;
  const isUp = (token?.priceChange24h ?? 0) >= 0;
  const chain = token ? CHAINS[token.chainId] : null;

  const filteredMarkets = searchQuery
    ? allMarkets.filter(t =>
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 20)
    : allMarkets.slice(0, 20);

  // Fullscreen overlay
  if (fullscreen && token) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: D.bg, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 18px', borderBottom: `1px solid ${D.border}`,
          flexShrink: 0,
        }}>
          <ChainIcon chainId={token.chainId as ChainId} size={20} />
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-bright)' }}>{token.symbol}</span>
          <span style={{ fontSize: 13, color: D.textMuted }}>/ USD</span>
          <span style={{ fontFamily: D.mono, fontSize: 20, fontWeight: 700, color: 'var(--text-bright)' }}>
            {formatUsd(displayPrice)}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: isUp ? D.green : D.red,
            background: isUp ? D.greenBg : D.redBg,
            padding: '3px 8px', borderRadius: 6,
          }}>
            {formatPct(token.priceChange24h)}
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 3 }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600,
                background: timeframe === tf ? D.greenBg : 'transparent',
                border: timeframe === tf ? `1px solid ${D.green}` : `1px solid ${D.border}`,
                borderRadius: 6, cursor: 'pointer',
                color: timeframe === tf ? D.green : D.textMuted,
              }}>
                {tf.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => setFullscreen(false)} style={{
            padding: '7px 14px', fontSize: 11, fontWeight: 600,
            background: D.bgAlt, border: `1px solid ${D.border}`,
            borderRadius: 6, cursor: 'pointer', color: D.text,
          }}>
            ✕ Close
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChartErrorBoundary tokenSymbol={token.symbol}>
            <PriceChart
              chainId={token.chainId as ChainId}
              poolAddress={token.pairAddress}
              tokenSymbol={token.symbol}
              fullscreen
              onToggleFullscreen={() => setFullscreen(false)}
            />
          </ChartErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, height: '100%' }}>

      {/* ── TOKEN HEADER METRICS BAR ─────────────────────────── */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${D.border}`,
        flexShrink: 0,
      }}>
        {token ? (
          <>
            {/* Top row: pair + price + change + stats */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <ChainIcon chainId={token.chainId as ChainId} size={20} />
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-bright)' }}>{token.symbol}</span>
                <span style={{ fontSize: 12, color: D.textMuted, fontWeight: 500 }}>/ USD</span>
              </div>
              {/* Market selector */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setSearchOpen(!searchOpen)} style={{
                  padding: '4px 10px', fontSize: 10, fontWeight: 600,
                  background: D.bgAlt, border: `1px solid ${D.border}`,
                  borderRadius: 6, cursor: 'pointer', color: D.textMuted,
                }}>
                  ▼ Change
                </button>
                {searchOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6,
                    background: D.bg, border: `1px solid ${D.border}`,
                    borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    zIndex: 100, width: 280, maxHeight: 320, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    <input
                      autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search market..."
                      style={{
                        padding: '10px 12px', fontSize: 13, border: 'none',
                        borderBottom: `1px solid ${D.border}`, outline: 'none',
                        background: D.bgPanel, color: D.text,
                      }}
                    />
                    <div style={{ overflow: 'auto', maxHeight: 270 }}>
                      {filteredMarkets.map((t, i) => (
                        <div key={`${t.chainId}-${t.address}-${i}`}
                          onClick={() => { onSelectMarket(t); setSearchOpen(false); setSearchQuery(''); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', cursor: 'pointer',
                            borderBottom: `1px solid ${D.border}`,
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = D.bgAlt)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <ChainIcon chainId={t.chainId as ChainId} size={14} />
                          <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-bright)' }}>{t.symbol}</span>
                          <span style={{ fontSize: 11, color: D.textMuted, flex: 1 }}>{t.name}</span>
                          <span style={{ fontFamily: D.mono, fontSize: 11, color: D.textSec }}>{formatUsd(t.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }} />
              {/* Data status indicator */}
              <span style={{
                fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
                color: dataStatus === 'LIVE' ? D.green : dataStatus === 'DELAYED' ? D.gold : D.textMuted,
                background: dataStatus === 'LIVE' ? D.greenBg : 'transparent',
                padding: '3px 10px', borderRadius: 20,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: dataStatus === 'LIVE' ? D.green : dataStatus === 'DELAYED' ? D.gold : D.textMuted,
                  animation: dataStatus === 'LIVE' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  boxShadow: dataStatus === 'LIVE' ? `0 0 6px ${D.green}` : 'none',
                }} />
                {dataStatus}
              </span>
            </div>

            {/* Price row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: D.mono, fontSize: 24, fontWeight: 800, color: 'var(--text-bright)' }}>
                {formatUsd(displayPrice)}
              </span>
              <span style={{
                fontSize: 15, fontWeight: 700,
                color: isUp ? D.green : D.red,
                background: isUp ? D.greenBg : D.redBg,
                padding: '3px 10px', borderRadius: 6,
              }}>
                {formatPct(token.priceChange24h)}
              </span>
            </div>

            {/* Stats row: Market Cap · Liquidity · 24H Volume */}
            <div style={{
              display: 'flex', gap: 20, fontSize: 11, flexWrap: 'wrap',
              marginTop: 8, paddingTop: 8,
              borderTop: `1px solid ${D.border}`,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Market Cap</span>
                <span style={{ color: 'var(--text-bright)', fontWeight: 700, fontFamily: D.mono }}>{formatCompact(token.marketCap)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Liquidity</span>
                <span style={{ color: 'var(--text-bright)', fontWeight: 700, fontFamily: D.mono }}>{formatCompact(token.liquidity)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>24H Volume</span>
                <span style={{ color: 'var(--text-bright)', fontWeight: 700, fontFamily: D.mono }}>{formatCompact(token.volume24h)}</span>
              </div>
              {(buyVolume != null || sellVolume != null) && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Buy Vol</span>
                    <span style={{ color: D.green, fontWeight: 700, fontFamily: D.mono }}>{formatCompact(buyVolume)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sell Vol</span>
                    <span style={{ color: D.red, fontWeight: 700, fontFamily: D.mono }}>{formatCompact(sellVolume)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: D.textMuted, padding: '16px 0', textAlign: 'center' }}>
            Select a market to view chart
          </div>
        )}
      </div>

      {/* ── CHART TOOLBAR ────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 14px', borderBottom: `1px solid ${D.border}`,
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Timeframes */}
        <div style={{ display: 'flex', gap: 3 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: timeframe === tf ? D.greenBg : 'transparent',
              border: timeframe === tf ? `1px solid ${D.green}` : `1px solid ${D.border}`,
              borderRadius: 4, cursor: 'pointer',
              color: timeframe === tf ? D.green : D.textMuted,
              transition: 'all 0.15s',
            }}>
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 16, background: D.border }} />
        {/* Chart mode */}
        <div style={{ display: 'flex', gap: 3 }}>
          {(['candles', 'line'] as const).map(mode => (
            <button key={mode} onClick={() => setChartMode(mode)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: chartMode === mode ? D.bgAlt : 'transparent',
              border: `1px solid ${chartMode === mode ? D.textMuted : D.border}`,
              borderRadius: 4, cursor: 'pointer',
              color: chartMode === mode ? 'var(--text)' : D.textMuted,
              transition: 'all 0.15s',
            }}>
              {mode === 'candles' ? 'Candles' : 'Line'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {/* Fullscreen */}
        <button onClick={() => setFullscreen(true)} style={{
          padding: '4px 10px', fontSize: 11, fontWeight: 600,
          background: 'transparent', border: `1px solid ${D.border}`,
          borderRadius: 4, cursor: 'pointer', color: D.textMuted,
          transition: 'all 0.15s',
        }}>
          ⊞ Fullscreen
        </button>
      </div>

      {/* ── CHART ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 300 }}>
        {token ? (
          <ChartErrorBoundary tokenSymbol={token.symbol}>
            <PriceChart
              chainId={token.chainId as ChainId}
              poolAddress={token.pairAddress}
              tokenSymbol={token.symbol}
            />
          </ChartErrorBoundary>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: D.textMuted, fontSize: 13,
          }}>
            Chart data unavailable
          </div>
        )}
      </div>

      {/* ── KEY STATS ROW (bottom of chart) ───────────────────── */}
      {token && (
        <div style={{
          display: 'flex', gap: 16, flexWrap: 'wrap',
          padding: '10px 14px', borderTop: `1px solid ${D.border}`,
          background: D.bgPanel, flexShrink: 0,
        }}>
          {[
            ['24H High', '—'],
            ['24H Low', '—'],
            ['ATH', '—'],
            ['Holders', '—'],
            ['Pooled', formatCompact(token.liquidity)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, color: D.textMuted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: D.mono }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
});

function formatCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}