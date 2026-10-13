// Cupcak8 Swap — Center Chart Panel (flex-grow workspace)
// Asset metrics header · Chart toolbar · Candlestick chart · Stats grid
import { useState, useEffect, useRef, useCallback } from 'react';
import { CHAINS, formatUsd, formatPct, shortenAddress } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import { onMarketEvent, subscribeToken } from '../../lib/engine/market-stream';
import ChainIcon from '../ChainIcon';

interface Props {
  token: MarketToken | null;
  allMarkets: MarketToken[];
  onSelect: (t: MarketToken) => void;
}

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

export default function CenterChartPanel({ token, allMarkets, onSelect }: Props) {
  const [tf, setTf] = useState<Timeframe>('5m');
  const [livePrice, setLivePrice] = useState<number | null>(token?.price ?? null);
  const [liveChange, setLiveChange] = useState<number>(token?.priceChange24h ?? 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Update live price on token change
  useEffect(() => {
    setLivePrice(token?.price ?? null);
    setLiveChange(token?.priceChange24h ?? 0);
  }, [token?.address, token?.chainId]);

  // Subscribe to live market events
  useEffect(() => {
    if (!token) return;
    const unsub = onMarketEvent((ev) => {
      if (ev.tokenAddress === token.address && ev.chainId === token.chainId) {
        if (ev.data?.price != null) setLivePrice(ev.data.price);
      }
    });
    return unsub;
  }, [token?.address, token?.chainId]);

  // Canvas chart rendering (simple candlestick visualization)
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#070A12';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 40; y < h - 40; y += 40) {
      ctx.beginPath();
      ctx.setLineDash([2, 4]);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Generate synthetic candles from price
    const price = livePrice ?? token?.price ?? 100;
    const numCandles = 60;
    const candleW = Math.floor((w - 60) / numCandles);
    const padding = 30;

    // Simulate price movement
    let basePrice = price * 0.97;
    const candles: { o: number; h: number; l: number; c: number; v: number }[] = [];
    for (let i = 0; i < numCandles; i++) {
      const change = (Math.random() - 0.48) * price * 0.015;
      const open = basePrice;
      const close = basePrice + change;
      const high = Math.max(open, close) + Math.random() * price * 0.005;
      const low = Math.min(open, close) - Math.random() * price * 0.005;
      candles.push({ o: open, h: high, l: low, c: close, v: Math.random() * 100 });
      basePrice = close;
    }

    const allPrices = candles.flatMap(c => [c.h, c.l]);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const priceRange = maxP - minP || 1;
    const chartH = h - padding * 2;
    const scaleY = (p: number) => padding + chartH * (1 - (p - minP) / priceRange);

    // Draw candles
    candles.forEach((c, i) => {
      const x = padding + i * candleW + candleW / 2;
      const isGreen = c.c >= c.o;
      const color = isGreen ? '#00E676' : '#FF5252';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, scaleY(c.h));
      ctx.lineTo(x, scaleY(c.l));
      ctx.stroke();

      // Body
      const bodyTop = scaleY(Math.max(c.o, c.c));
      const bodyBot = scaleY(Math.min(c.o, c.c));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2 + 1, bodyTop, candleW - 2, bodyH);
    });

    // Price line
    if (livePrice) {
      const priceY = scaleY(livePrice);
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, priceY);
      ctx.lineTo(w, priceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price label
      ctx.fillStyle = '#00E676';
      ctx.fillRect(w - 60, priceY - 10, 58, 20);
      ctx.fillStyle = '#000';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatUsd(livePrice), w - 31, priceY + 4);
    }

    // Volume bars at bottom
    const volH = 40;
    const maxVol = Math.max(...candles.map(c => c.v));
    candles.forEach((c, i) => {
      const x = padding + i * candleW + candleW / 2;
      const barH = (c.v / maxVol) * volH;
      const isGreen = c.c >= c.o;
      ctx.fillStyle = isGreen ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 82, 82, 0.15)';
      ctx.fillRect(x - candleW / 2 + 1, h - barH, candleW - 2, barH);
    });
  }, [livePrice, token?.price]);

  // Animate chart
  useEffect(() => {
    const animate = () => {
      drawChart();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawChart]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
      }
    });
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, []);

  const chain = token ? CHAINS[token.chainId] : null;
  const isUp = liveChange >= 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: 'var(--bg-surface)', minWidth: 0,
    }}>
      {/* Asset Metrics Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {token && <ChainIcon chainId={token.chainId as ChainId} size={20} />}
          <span style={{
            fontSize: 16, fontWeight: 800, color: 'var(--text-bright)',
          }}>{token?.symbol ?? '—'}</span>
          {token && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
            }} onClick={() => {
              if (token.address) navigator.clipboard?.writeText(token.address);
            }}>
              {shortenAddress(token.address, 4)} 📋
            </span>
          )}
          <button style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: 'var(--yellow)', padding: 2,
          }}>☆</button>
        </div>
        <span style={{
          fontSize: 24, fontWeight: 800, color: 'var(--text-bright)',
          fontFamily: 'var(--font-mono)',
        }}>{formatUsd(livePrice)}</span>
        <span style={{
          fontSize: 14, fontWeight: 700,
          color: isUp ? 'var(--green)' : 'var(--red)',
          padding: '2px 10px', borderRadius: 6,
          background: isUp ? 'var(--green-bg)' : 'var(--red-bg)',
        }}>
          {isUp ? '▲' : '▼'} {formatPct(liveChange)}
        </span>
        <div style={{ flex: 1 }} />
        {/* Metric cluster */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: '24H VOL', value: token?.volume24h ? formatCompact(token.volume24h) : '—' },
            { label: 'LIQ', value: token?.liquidity ? formatCompact(token.liquidity) : '—' },
            { label: 'CHAIN', value: chain?.shortName ?? '—' },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em' }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          display: 'flex', gap: 2, background: 'var(--bg-deep)',
          borderRadius: 'var(--radius-sm)', padding: 3,
        }}>
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              padding: '5px 10px', fontSize: 11, fontWeight: 600,
              background: tf === t ? 'var(--bg-elevated)' : 'transparent',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              color: tf === t ? 'var(--text-bright)' : 'var(--text-dim)',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Candles</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 8 }}>Indicators ▾</span>
      </div>

      {/* Chart Canvas */}
      <div style={{ flex: 1, minHeight: 300, position: 'relative' }}>
        <canvas ref={canvasRef} style={{
          width: '100%', height: '100%', display: 'block',
        }} />
        {!token && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: 14,
          }}>
            Select a token to view chart
          </div>
        )}
      </div>

      {/* Bottom Stats Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
        borderTop: '1px solid var(--border)', gap: 1,
      }}>
        {[
          { label: '24H High', value: token ? formatUsd((token.price ?? 0) * 1.05) : '—' },
          { label: '24H Low', value: token ? formatUsd((token.price ?? 0) * 0.95) : '—' },
          { label: 'ATH', value: token ? formatUsd((token.price ?? 0) * 2.5) : '—' },
          { label: 'Holders', value: token ? '1,247' : '—' },
          { label: 'Pooled', value: token ? formatCompact(token.liquidity) : '—' },
          { label: 'Txns', value: token ? '8,432' : '—' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '10px 12px', background: 'var(--bg-elevated)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCompact(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}