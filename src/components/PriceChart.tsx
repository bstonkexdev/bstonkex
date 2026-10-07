import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react';
import { getCandles, type CandleData } from '../lib/market';
import type { ChainId } from '../lib/config';
import { onCandleUpdate, getCandles as getLiveCandles, seedCandles, type Candle, type CandleInterval } from '../lib/engine/candle-engine';
import { onMarketEvent, type MarketStreamEvent } from '../lib/engine/market-stream';
import { processTrade } from '../lib/engine/candle-engine';

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';
type ChartMode = 'candles' | 'line';

// ── Chart Error Boundary ─────────────────────────────────────
interface EBState { hasError: boolean; error: Error | null; }

export class ChartErrorBoundary extends Component<{ children: ReactNode; tokenSymbol?: string }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ChartErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, background: '#040810' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', letterSpacing: '0.1em' }}>CHART DATA UNAVAILABLE</div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
            An error occurred while rendering the chart.
          </div>
          <button className="btn btn-sm btn-cyan" style={{ fontSize: 8, marginTop: 4 }}
            onClick={() => this.setState({ hasError: false, error: null })}>
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  chainId: ChainId;
  poolAddress: string | null;
  tokenSymbol: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  trades?: { time: number; price: number; side: 'buy' | 'sell' }[];
}

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

export default function PriceChart({ chainId, poolAddress, tokenSymbol, fullscreen, onToggleFullscreen, trades }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [chartMode, setChartMode] = useState<ChartMode>('candles');
  const [showVolume, setShowVolume] = useState(true);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; candle: CandleData } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!poolAddress) { setCandles([]); return; }
    setLoading(true);
    getCandles(chainId, poolAddress, timeframe).then(data => {
      // Filter out malformed candle data
      const valid = data.filter(c => c && typeof c.time === 'number' && isFinite(c.open) && isFinite(c.close));
      setCandles(valid);
      setLoading(false);
      // Seed candle engine with historical data for live updates
      if (valid.length > 0) {
        const intervalMap: Record<string, CandleInterval> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
        const interval = intervalMap[timeframe] || '1h';
        const mapped: Candle[] = valid.map(c => ({
          timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume, tradeCount: 0, status: 'final' as const,
        }));
        seedCandles(chainId, poolAddress, interval, mapped);
      }
    }).catch(() => { setCandles([]); setLoading(false); });
  }, [chainId, poolAddress, timeframe]);

  // Subscribe to live candle updates from candle engine
  useEffect(() => {
    if (!poolAddress) return;
    const intervalMap: Record<string, CandleInterval> = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w' };
    const interval = intervalMap[timeframe] || '1h';

    const unsub = onCandleUpdate((key, candle) => {
      const expectedKey = `${chainId}:${interval}:${poolAddress}`;
      if (key !== expectedKey) return;

      // Convert to CandleData format and merge
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const mapped: CandleData = {
          time: candle.timestamp, open: candle.open, high: candle.high,
          low: candle.low, close: candle.close, volume: candle.volume,
        };
        const last = prev[prev.length - 1];
        if (last.time === candle.timestamp) {
          // Update current candle
          return [...prev.slice(0, -1), mapped];
        }
        // New candle
        return [...prev, mapped];
      });
    });

    // Also listen for market events to feed candle engine
    const unsubMarket = onMarketEvent((e: MarketStreamEvent) => {
      if (e.tokenAddress !== poolAddress || e.chainId !== chainId) return;
      if (e.type === 'price' && e.data.price != null) {
        processTrade(chainId, poolAddress, {
          price: e.data.price,
          amountUsd: e.data.volume24h ?? 0,
          timestamp: e.timestamp,
          side: 'buy',
        });
      }
    });

    return () => { unsub(); unsubMarket(); };
  }, [chainId, poolAddress, timeframe]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#040810';
    ctx.fillRect(0, 0, w, h);

    // Subtle pixel grid
    ctx.strokeStyle = 'rgba(22, 40, 72, 0.15)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < w; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = 0; gy < h; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

    if (candles.length === 0) {
      ctx.fillStyle = '#3a5878';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(loading ? 'LOADING CHART DATA...' : 'INSUFFICIENT MARKET DATA', w / 2, h / 2);
      return;
    }

    const pad = { top: 16, right: 64, bottom: 24, left: 8 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const chartH = showVolume ? ch * 0.78 : ch;
    const volH = showVolume ? ch * 0.18 : 0;

    let minP = Infinity, maxP = -Infinity, maxV = 0;
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }
    const range = (maxP - minP) || maxP * 0.01 || 1;
    const padAmt = range * 0.05;
    minP -= padAmt; maxP += padAmt;
    const r = maxP - minP;
    const toY = (p: number) => pad.top + (1 - (p - minP) / r) * chartH;
    const toX = (i: number) => pad.left + (i + 0.5) * (cw / candles.length);
    const candleW = Math.max(1, (cw / candles.length) * 0.55);

    // Grid lines
    ctx.strokeStyle = '#162848';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const price = maxP - (i / 4) * r;
      ctx.fillStyle = '#3a5878';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price < 0.01 ? price.toExponential(1) : price.toFixed(4), w - pad.right + 4, y + 3);
    }

    // Volume bars
    if (showVolume && maxV > 0) {
      const vTop = pad.top + chartH + 4;
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const x = toX(i);
        const barH = (c.volume / maxV) * volH;
        ctx.fillStyle = c.close >= c.open ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 48, 96, 0.15)';
        ctx.fillRect(x - candleW / 2, vTop + volH - barH, candleW, barH);
      }
      // Volume separator
      ctx.strokeStyle = 'rgba(22, 40, 72, 0.3)';
      ctx.beginPath(); ctx.moveTo(pad.left, vTop); ctx.lineTo(w - pad.right, vTop); ctx.stroke();
    }

    // Draw candles or line
    if (chartMode === 'line') {
      // Line chart
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < candles.length; i++) {
        const x = toX(i);
        const y = toY(candles[i].close);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Fill area under line
      ctx.lineTo(toX(candles.length - 1), pad.top + chartH);
      ctx.lineTo(toX(0), pad.top + chartH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 212, 255, 0.04)';
      ctx.fill();
    } else {
      // Candlesticks
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const x = toX(i);
        const green = c.close >= c.open;
        const col = green ? '#00ff88' : '#ff3060';
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
        const bTop = toY(Math.max(c.open, c.close));
        const bBot = toY(Math.min(c.open, c.close));
        ctx.fillStyle = col;
        ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(1, bBot - bTop));
      }
    }

    // Trade markers (▲ buy / ▼ sell)
    if (trades && trades.length > 0) {
      for (const t of trades) {
        // Find closest candle by time
        let closestIdx = 0;
        let closestDiff = Infinity;
        for (let i = 0; i < candles.length; i++) {
          const diff = Math.abs(candles[i].time - t.time);
          if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
        }
        const x = toX(closestIdx);
        const y = toY(t.price);
        const isBuy = t.side === 'buy';
        ctx.fillStyle = isBuy ? '#00ff88' : '#ff3060';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isBuy ? '▲' : '▼', x, y + (isBuy ? 12 : -4));
      }
    }

    // Current price line
    const last = candles[candles.length - 1];
    const curY = toY(last.close);
    const pCol = last.close >= last.open ? '#00ff88' : '#ff3060';
    ctx.strokeStyle = pCol; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(w - pad.right, curY); ctx.stroke();
    ctx.setLineDash([]);
    // Price label
    ctx.fillStyle = pCol;
    ctx.fillRect(w - pad.right, curY - 7, pad.right, 14);
    ctx.fillStyle = '#040810';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(
      last.close < 0.01 ? last.close.toExponential(2) : last.close.toFixed(4),
      w - pad.right + 3, curY + 3
    );

    // Time labels
    ctx.fillStyle = '#3a5878';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(candles.length / 5));
    for (let i = 0; i < candles.length; i += step) {
      const d = new Date(candles[i].time * 1000);
      const lbl = timeframe === '1d' || timeframe === '1w'
        ? `${d.getMonth() + 1}/${d.getDate()}`
        : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(lbl, toX(i), h - 6);
    }
  }, [candles, loading, timeframe, chartMode, showVolume, trades]);

  const safeDraw = useCallback(() => { try { draw(); } catch (e) { console.error('[PriceChart] draw error:', e); } }, [draw]);
  useEffect(() => { safeDraw(); }, [safeDraw]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => safeDraw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [safeDraw]);

  const onMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || candles.length === 0) { setCrosshair(null); return; }
    const x = e.clientX - rect.left;
    const container = containerRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const pad = { left: 8, right: 64 };
    const cw = w - pad.left - pad.right;
    const idx = Math.floor(((x - pad.left) / cw) * candles.length);
    if (idx >= 0 && idx < candles.length) {
      setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top, candle: candles[idx] });
    }
  };

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', border: 'none' }}>
      <div className="panel-header" style={{ flexShrink: 0 }}>
        <span className="led" />
        {tokenSymbol} / USD
        <div style={{ flex: 1 }} />
        {/* Chart type */}
        <div style={{ display: 'flex', gap: 2, marginRight: 6 }}>
          <button className={`btn btn-sm ${chartMode === 'candles' ? 'btn-cyan' : ''}`}
            style={{ padding: '1px 4px', fontSize: 7 }}
            onClick={() => setChartMode('candles')}>CANDLES</button>
          <button className={`btn btn-sm ${chartMode === 'line' ? 'btn-cyan' : ''}`}
            style={{ padding: '1px 4px', fontSize: 7 }}
            onClick={() => setChartMode('line')}>LINE</button>
        </div>
        {/* Volume toggle */}
        <button className={`btn btn-sm ${showVolume ? 'btn-cyan' : ''}`}
          style={{ padding: '1px 4px', fontSize: 7, marginRight: 6 }}
          onClick={() => setShowVolume(v => !v)}>VOL</button>
        {/* Fullscreen */}
        {onToggleFullscreen && (
          <button className="btn btn-sm" style={{ padding: '1px 4px', fontSize: 7, marginRight: 6 }}
            onClick={onToggleFullscreen}>{fullscreen ? '╳ EXIT' : '⛶ FULL'}</button>
        )}
        {/* Timeframes */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf}
              className={`btn btn-sm ${tf === timeframe ? 'btn-cyan' : ''}`}
              style={{ padding: '2px 5px', fontSize: 8, minWidth: 0 }}
              onClick={() => setTimeframe(tf)}>
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="chart-container" style={{ flex: 1, position: 'relative' }}
        onMouseMove={onMouseMove} onMouseLeave={() => setCrosshair(null)}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 10 }}>
            LOADING CHART DATA...
          </div>
        )}
        {!loading && candles.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>NO HISTORICAL DATA</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>Chart data unavailable for this token</div>
          </div>
        )}
        {crosshair && (
          <>
            <div style={{ position: 'absolute', left: crosshair.x, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: crosshair.y, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
            <div style={{
              position: 'absolute', left: 8, top: 6,
              background: 'rgba(4, 8, 16, 0.92)', border: '1px solid var(--border)',
              padding: '3px 8px', fontSize: 9, pointerEvents: 'none',
              display: 'flex', gap: 10, color: 'var(--text)',
            }}>
              <span>O <b style={{ color: 'var(--text-bright)' }}>{crosshair.candle.open.toFixed(6)}</b></span>
              <span>H <b style={{ color: 'var(--text-bright)' }}>{crosshair.candle.high.toFixed(6)}</b></span>
              <span>L <b style={{ color: 'var(--text-bright)' }}>{crosshair.candle.low.toFixed(6)}</b></span>
              <span>C <b style={{ color: 'var(--text-bright)' }}>{crosshair.candle.close.toFixed(6)}</b></span>
              <span style={{ color: 'var(--text-dim)' }}>V {crosshair.candle.volume.toFixed(0)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}