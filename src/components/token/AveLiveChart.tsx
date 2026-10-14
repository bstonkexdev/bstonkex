// Cupcak8 Swap — Ave.ai-style Live Chart (Canvas-based, zero dependencies)
// Candlestick + Volume histogram + High/Low markers + Current price line
// Fetches historical OHLCV from backend REST + subscribes to WS chart channels
// Dark theme, green/red candles, timeframe selector

import { useEffect, useRef, useState, useCallback } from 'react';
import { microPrice } from '../../lib/micro-price';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'https://api.bstonkex.xyz';
const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'wss://api.bstonkex.xyz/ws';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

interface Props {
  /** Token mint address (used to fetch from backend chart engine) */
  mint: string;
  /** Fallback candles from local candle engine (if backend has no data yet) */
  fallbackCandles?: Candle[];
  /** Current live price */
  currentPrice: number | null;
  /** Chain for color theme */
  chainColor?: string;
  /** Called when timeframe changes */
  onTimeframeChange?: (tf: Timeframe) => void;
}

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '1m', label: '1m' }, { key: '5m', label: '5m' }, { key: '15m', label: '15m' },
  { key: '1h', label: '1h' }, { key: '4h', label: '4h' }, { key: '1d', label: '1d' },
];

const BG = '#12161f';
const BG2 = '#0e1118';
const GREEN = '#10b981';
const RED = '#ef4444';
const GRID = 'rgba(255,255,255,0.04)';
const TEXT_DIM = 'rgba(255,255,255,0.35)';

function drawChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  currentPrice: number | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  if (candles.length === 0) {
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO CANDLE DATA — Waiting for trades…', W / 2, H / 2);
    return;
  }

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const pad = { top: 20, right: 60, bottom: 30, left: 10 };

  let hi = -Infinity, lo = Infinity;
  for (const c of sorted) {
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  const priceRange = hi - lo || 1;
  const pricePad = priceRange * 0.08;
  hi += pricePad;
  lo -= pricePad;

  let maxVol = 0;
  for (const c of sorted) {
    if (c.volume > maxVol) maxVol = c.volume;
  }
  const volH = H * 0.15;

  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom - volH;
  const barW = Math.max(1, chartW / sorted.length);
  const gap = Math.max(0.5, barW * 0.2);

  const priceToY = (p: number) => pad.top + chartH * (1 - (p - lo) / (hi - lo));
  const volToH = (v: number) => maxVol > 0 ? (v / maxVol) * volH : 0;

  // Grid lines
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.5;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();

    const price = hi - ((hi - lo) / gridLines) * i;
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(microPrice(price, ''), W - pad.right + 4, y + 3);
  }

  // Volume separator line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + chartH + 4);
  ctx.lineTo(W - pad.right, pad.top + chartH + 4);
  ctx.stroke();

  // Candles + Volume
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const x = pad.left + i * barW + barW / 2;
    const isBull = c.close >= c.open;
    const color = isBull ? GREEN : RED;

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, priceToY(c.high));
    ctx.lineTo(x, priceToY(c.low));
    ctx.stroke();

    // Body
    const bodyTop = priceToY(Math.max(c.open, c.close));
    const bodyBot = priceToY(Math.min(c.open, c.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);
    ctx.fillStyle = color;
    ctx.fillRect(x - (barW - gap) / 2, bodyTop, barW - gap, bodyH);

    // Volume bar
    const vH = volToH(c.volume);
    ctx.fillStyle = isBull ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(x - (barW - gap) / 2, H - pad.bottom - vH, barW - gap, vH);
  }

  // High/Low markers
  let hiIdx = 0, loIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].high > sorted[hiIdx].high) hiIdx = i;
    if (sorted[i].low < sorted[loIdx].low) loIdx = i;
  }
  const markHi = (idx: number, label: string, color: string) => {
    const x = pad.left + idx * barW + barW / 2;
    const y = priceToY(sorted[idx].high) - 10;
    ctx.fillStyle = color;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
    ctx.beginPath();
    ctx.arc(x, priceToY(sorted[idx].high) - 3, 2, 0, Math.PI * 2);
    ctx.fill();
  };
  const markLo = (idx: number, label: string, color: string) => {
    const x = pad.left + idx * barW + barW / 2;
    const y = priceToY(sorted[idx].low) + 14;
    ctx.fillStyle = color;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
    ctx.beginPath();
    ctx.arc(x, priceToY(sorted[idx].low) + 3, 2, 0, Math.PI * 2);
    ctx.fill();
  };
  markHi(hiIdx, `H: ${microPrice(sorted[hiIdx].high, '')}`, '#a78bfa');
  markLo(loIdx, `L: ${microPrice(sorted[loIdx].low, '')}`, '#60a5fa');

  // Current price line
  if (currentPrice != null && isFinite(currentPrice) && currentPrice >= lo && currentPrice <= hi) {
    const y = priceToY(currentPrice);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(W - pad.right, y - 8, pad.right, 16);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(microPrice(currentPrice, ''), W - pad.right + 4, y + 3);
  }

  // Time labels
  const step = Math.max(1, Math.floor(sorted.length / 8));
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < sorted.length; i += step) {
    const d = new Date(sorted[i].time * 1000);
    const label = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const x = pad.left + i * barW + barW / 2;
    ctx.fillText(label, x, H - pad.bottom + 14);
  }
}

export default function AveLiveChart({ mint, fallbackCandles = [], currentPrice, onTimeframeChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<string>('loading');
  const [highPrice, setHighPrice] = useState<number | null>(null);
  const [lowPrice, setLowPrice] = useState<number | null>(null);

  const selectTimeframe = useCallback((tf: Timeframe) => {
    setActiveTimeframe(tf);
    onTimeframeChange?.(tf);
  }, [onTimeframeChange]);

  // Fetch historical candles from backend chart engine
  useEffect(() => {
    if (!mint) return;
    let cancelled = false;

    const fetchHistory = async () => {
      try {
        setSource('loading');
        const res = await fetch(`${API_BASE}/api/v1/chart/history?mint=${encodeURIComponent(mint)}&interval=${activeTimeframe}&limit=500`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.candles && data.candles.length > 0) {
          setCandles(data.candles);
          setSource(`backend (${data.count} candles)`);
        } else {
          // Backend has no data — use fallback from local candle engine
          setCandles(fallbackCandles);
          setSource(fallbackCandles.length > 0 ? `local engine (${fallbackCandles.length})` : 'no data');
        }
      } catch {
        if (cancelled) return;
        // Backend unreachable — use fallback
        setCandles(fallbackCandles);
        setSource(fallbackCandles.length > 0 ? `local engine (${fallbackCandles.length})` : 'offline');
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [mint, activeTimeframe, fallbackCandles]);

  // Subscribe to WS chart channel for real-time candle ticks
  useEffect(() => {
    if (!mint) return;

    const wsUrl = WS_URL || `ws://${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Subscribe to chart channel for this mint + interval
          ws?.send(JSON.stringify({
            type: 'subscribe',
            channel: `chart:${mint}:${activeTimeframe}`,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // Handle chart_snapshot (initial data on subscribe)
            if (msg.type === 'chart_snapshot' && msg.candles?.length > 0) {
              setCandles(prev => {
                // Merge: use snapshot if longer than current
                if (msg.candles.length > prev.length) return msg.candles;
                return prev;
              });
              return;
            }

            // Handle candle_tick (real-time update)
            if (msg.type === 'event' && msg.event === 'candle_tick') {
              const tick = msg as { time: number; open: number; high: number; low: number; close: number; volume: number };
              setCandles(prev => {
                const idx = prev.findIndex(c => c.time === tick.time);
                const updated: Candle = { time: tick.time, open: tick.open, high: tick.high, low: tick.low, close: tick.close, volume: tick.volume };
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = updated;
                  return next;
                }
                // New candle
                return [...prev, updated].sort((a, b) => a.time - b.time).slice(-500);
              });
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch { /* ignore connection errors */ }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      // Unsubscribe before closing
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'unsubscribe',
          channel: `chart:${mint}:${activeTimeframe}`,
        }));
      }
      ws?.close();
      wsRef.current = null;
    };
  }, [mint, activeTimeframe]);

  // Draw chart whenever candles or price changes
  useEffect(() => {
    if (!canvasRef.current) return;
    drawChart(canvasRef.current, candles, currentPrice);

    if (candles.length > 0) {
      let hi = -Infinity, lo = Infinity;
      for (const c of candles) {
        if (c.high > hi) hi = c.high;
        if (c.low < lo) lo = c.low;
      }
      setHighPrice(isFinite(hi) ? hi : null);
      setLowPrice(isFinite(lo) ? lo : null);
    }
  }, [candles, currentPrice]);

  // Resize handler
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(() => {
      if (canvasRef.current) drawChart(canvasRef.current, candles, currentPrice);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [candles, currentPrice]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: BG, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Timeframe Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: BG }}>
        {TIMEFRAMES.map(tf => (
          <button key={tf.key} onClick={() => selectTimeframe(tf.key)} style={{
            padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
            background: tf.key === activeTimeframe ? 'rgba(139,92,246,0.15)' : 'transparent',
            color: tf.key === activeTimeframe ? '#a78bfa' : 'var(--text-dim)',
            transition: 'all 0.15s',
          }}>{tf.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {highPrice != null && (
          <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, marginRight: 8 }}>
            H: {microPrice(highPrice, '')}
          </span>
        )}
        {lowPrice != null && (
          <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>
            L: {microPrice(lowPrice, '')}
          </span>
        )}
      </div>

      {/* Canvas Chart */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 380, display: 'block' }}
      />

      {/* Data footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: BG2, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: 8, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {candles.length} candles · {source}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
          WS: chart:{mint}:{activeTimeframe}
        </span>
      </div>
    </div>
  );
}