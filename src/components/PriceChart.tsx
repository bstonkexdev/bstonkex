// Cupcak8 Swap Price Chart — the primary visual element of the token page.
// Renders only real candle data (GeckoTerminal pool OHLCV or CoinGecko reference OHLC).
// Controls (timeframes, display, indicators, pan/zoom) all drive this same engine.
import { useState, useEffect, useRef, useCallback, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { getCandles, type CandleData } from '../lib/market';
import { fetchMajorOhlc, MAJOR_RANGES, formatIntervalLabel, type MajorRange } from '../lib/major-assets';
import { drawChart, clampView, indexAtX, type ChartTradeMarker } from '../lib/chart-draw';
import { computeRsi } from '../lib/chart-indicators';
import type { ChainId } from '../lib/config';
import { onCandleUpdate, seedCandles, processTrade, type Candle, type CandleInterval } from '../lib/engine/candle-engine';
import { onMarketEvent, type MarketStreamEvent } from '../lib/engine/market-stream';

// Timeframes the pool OHLCV provider (GeckoTerminal) actually serves.
type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
type ChartMode = 'candles' | 'line';
type ChartStatus = 'loading' | 'ok' | 'empty' | 'rate_limited' | 'error';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TF_INTERVAL: Record<Timeframe, CandleInterval> = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };

// ── Chart Error Boundary ─────────────────────────────────────
interface EBState { hasError: boolean; error: Error | null; }

export class ChartErrorBoundary extends Component<{ children: ReactNode; tokenSymbol?: string }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ChartErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, background: 'var(--bg-panel)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', letterSpacing: '0.1em' }}>CHART DATA UNAVAILABLE</div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', maxWidth: 260, textAlign: 'center', lineHeight: 1.5 }}>
            An error occurred while rendering the chart.
          </div>
          <button className="btn btn-sm btn-cyan" style={{ fontSize: 8, marginTop: 4 }}
            onClick={() => this.setState({ hasError: false, error: null })}>RETRY</button>
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
  /** Canonical CoinGecko asset id — switches the chart to real reference OHLC. */
  coingeckoId?: string | null;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  trades?: ChartTradeMarker[];
}

export default function PriceChart({ chainId, poolAddress, tokenSymbol, coingeckoId, fullscreen, onToggleFullscreen, trades }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [range, setRange] = useState<MajorRange>('7d');
  const [mode, setMode] = useState<ChartMode>('candles');
  const [showVolume, setShowVolume] = useState(true);
  const [showRsi, setShowRsi] = useState(false);
  const [menu, setMenu] = useState<'none' | 'display' | 'indicators' | 'more'>('none');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [chartStatus, setChartStatus] = useState<ChartStatus>('loading');
  const [chartError, setChartError] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState({ start: 0, count: 0 }); // count 0 = full series
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; candle: CandleData } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; start: number; moved: boolean } | null>(null);

  // ── Real data loading (pool candles or reference OHLC) ──
  useEffect(() => {
    let cancelled = false;
    setCandles([]);            // clear previous asset immediately — never show a stale chart
    setCrosshair(null);
    setView({ start: 0, count: 0 });
    setChartStatus('loading');
    setChartError(null);
    setIntervalMs(null);

    const sanitize = (data: CandleData[]) =>
      data.filter(c => c && typeof c.time === 'number' && isFinite(c.open) && isFinite(c.close) && isFinite(c.high) && isFinite(c.low));

    if (coingeckoId) {
      fetchMajorOhlc(coingeckoId, range).then(res => {
        if (cancelled) return;
        const valid = sanitize(res.candles);
        setCandles(valid);
        setIntervalMs(res.intervalMs);
        if (res.status === 'ok') setChartStatus(valid.length > 0 ? 'ok' : 'empty');
        else if (res.status === 'empty') setChartStatus('empty');
        else {
          setChartStatus(res.status === 'rate_limited' ? 'rate_limited' : 'error');
          setChartError(res.error ?? null);
        }
      }).catch(() => {
        if (cancelled) return;
        setCandles([]); setChartStatus('error'); setChartError('CHART DATA UNAVAILABLE');
      });
      return () => { cancelled = true; };
    }

    if (!poolAddress) { setChartStatus('empty'); return () => { cancelled = true; }; }

    getCandles(chainId, poolAddress, timeframe).then(data => {
      if (cancelled) return;
      const valid = sanitize(data);
      setCandles(valid);
      setChartStatus(valid.length > 0 ? 'ok' : 'empty');
      if (valid.length > 0) {
        const mapped: Candle[] = valid.map(c => ({
          timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume, tradeCount: 0, status: 'final' as const,
        }));
        seedCandles(chainId, poolAddress, TF_INTERVAL[timeframe], mapped);
      }
    }).catch(() => {
      if (cancelled) return;
      setCandles([]); setChartStatus('error'); setChartError('CHART DATA UNAVAILABLE');
    });
    return () => { cancelled = true; };
  }, [chainId, poolAddress, coingeckoId, timeframe, range, reloadKey]);

  // ── Live candle updates (pool-based series only) ──
  useEffect(() => {
    if (!poolAddress || coingeckoId) return;
    const interval = TF_INTERVAL[timeframe];
    const unsub = onCandleUpdate((key, candle) => {
      if (key !== `${chainId}:${interval}:${poolAddress}`) return;
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const mapped: CandleData = {
          time: candle.timestamp, open: candle.open, high: candle.high,
          low: candle.low, close: candle.close, volume: candle.volume,
        };
        const last = prev[prev.length - 1];
        return last.time === candle.timestamp
          ? [...prev.slice(0, -1), mapped]
          : [...prev, mapped];
      });
    });
    const unsubMarket = onMarketEvent((e: MarketStreamEvent) => {
      if (e.tokenAddress !== poolAddress || e.chainId !== chainId) return;
      if (e.type === 'price' && e.data.price != null) {
        processTrade(chainId, poolAddress, {
          price: e.data.price, amountUsd: e.data.volume24h ?? 0, timestamp: e.timestamp, side: 'buy',
        });
      }
    });
    return () => { unsub(); unsubMarket(); };
  }, [chainId, poolAddress, coingeckoId, timeframe]);

  // ── Derived view state ──
  const n = candles.length;
  const eff = useMemo(() => clampView(n, view.start, view.count || n), [n, view]);
  const rsi = useMemo(() => (showRsi && n > 0 ? computeRsi(candles) : null), [candles, n, showRsi]);
  const dateAxis = coingeckoId ? (intervalMs ?? 0) >= 3_600_000 : timeframe === '1d';

  // ── Rendering ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    drawChart(canvas, container.clientWidth, container.clientHeight, {
      candles, start: eff.start, count: eff.count, mode,
      showVolume, showRsi, rsi, trades, dateAxis,
      emptyLabel: chartStatus === 'loading' ? 'LOADING CHART DATA...' : 'NO HISTORICAL DATA',
    });
  }, [candles, eff, mode, showVolume, showRsi, rsi, trades, dateAxis, chartStatus]);

  const safeDraw = useCallback(() => { try { draw(); } catch (e) { console.error('[PriceChart] draw error:', e); } }, [draw]);
  useEffect(() => { safeDraw(); }, [safeDraw]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => safeDraw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [safeDraw]);

  // ── Pan / zoom (drag pan, wheel zoom, buttons) ──
  const zoom = useCallback((factor: number, anchorRatio = 0.5) => {
    setView(v => {
      const total = candles.length;
      if (total === 0) return v;
      const cur = clampView(total, v.start, v.count || total);
      const newCount = Math.round(clampView(total, 0, Math.max(5, Math.round(cur.count * factor))).count);
      const anchor = cur.start + anchorRatio * cur.count;
      const newStart = Math.round(anchor - anchorRatio * newCount);
      return clampView(total, newStart, newCount);
    });
  }, [candles.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // keep the page stable while zooming the chart
      const rect = el.getBoundingClientRect();
      const cw = rect.width - 64 - 8; // price axis + left pad
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - 8) / cw));
      zoom(e.deltaY > 0 ? 1.15 : 0.87, ratio);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, start: eff.start, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Crosshair (hover)
    const rect = canvasRef.current?.getBoundingClientRect();
    const container = containerRef.current;
    if (!rect || !container || candles.length === 0) { setCrosshair(null); return; }
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const drag = dragRef.current;
    if (drag && e.buttons > 0) {
      const cw = container.clientWidth - 72;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      const shift = Math.round((dx / cw) * eff.count);
      setView(v => clampView(candles.length, drag.start - shift, v.count || candles.length));
      return;
    }
    const idx = indexAtX(x, container.clientWidth, eff.start, eff.count, candles.length);
    setCrosshair({ x, y, candle: candles[idx] });
  };
  const endDrag = () => { dragRef.current = null; };

  const menuBtn = (label: string, active = false, onClick?: () => void) => (
    <button className={`btn btn-sm ${active ? 'btn-cyan' : ''}`} style={{ padding: '2px 5px', fontSize: 7, minWidth: 0, whiteSpace: 'nowrap' }} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="panel chart-panel">
      {/* ── Chart controls (directly above the chart) ── */}
      <div className="chart-controls">
        <span className="led" />
        <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{tokenSymbol} / USD</span>
        <span className="chart-source-chip">
          {coingeckoId
            ? `REF · COINGECKO${formatIntervalLabel(intervalMs) ? ` · ${formatIntervalLabel(intervalMs)}` : ''}`
            : 'POOL OHLCV'}
        </span>
        <div style={{ flex: 1, minWidth: 4 }} />

        {/* Timeframes — only what the configured provider actually serves */}
        <div className="chart-tf-group">
          {coingeckoId
            ? MAJOR_RANGES.map(r => menuBtn(r.label, r.key === range, () => setRange(r.key)))
            : TIMEFRAMES.map(tf => menuBtn(tf.toUpperCase(), tf === timeframe, () => setTimeframe(tf)))}
          <div style={{ position: 'relative' }}>
            {menuBtn('MORE ▾', menu === 'more', () => setMenu(m => m === 'more' ? 'none' : 'more'))}
            {menu === 'more' && (
              <div className="chart-menu">
                {onToggleFullscreen && <button onClick={() => { onToggleFullscreen(); setMenu('none'); }}>{fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN CHART'}</button>}
                <button onClick={() => { setView({ start: 0, count: 0 }); setMenu('none'); }}>RESET ZOOM</button>
                <button onClick={() => { setReloadKey(k => k + 1); setMenu('none'); }}>RELOAD DATA</button>
              </div>
            )}
          </div>
        </div>

        {/* Display settings */}
        <div style={{ position: 'relative' }}>
          {menuBtn('DISPLAY', menu === 'display', () => setMenu(m => m === 'display' ? 'none' : 'display'))}
          {menu === 'display' && (
            <div className="chart-menu">
              <button onClick={() => { setMode('candles'); setMenu('none'); }}>CANDLESTICKS {mode === 'candles' ? '✓' : ''}</button>
              <button onClick={() => { setMode('line'); setMenu('none'); }}>LINE / PRICE {mode === 'line' ? '✓' : ''}</button>
              <button onClick={() => setShowVolume(v => !v)}>VOLUME {showVolume ? 'ON ✓' : 'OFF'}</button>
            </div>
          )}
        </div>

        {/* Indicator settings (only indicators the engine supports) */}
        <div style={{ position: 'relative' }}>
          {menuBtn('IND', menu === 'indicators', () => setMenu(m => m === 'indicators' ? 'none' : 'indicators'))}
          {menu === 'indicators' && (
            <div className="chart-menu">
              <button onClick={() => setShowRsi(v => !v)}>RSI 14 {showRsi ? 'ON ✓' : 'OFF'}</button>
            </div>
          )}
        </div>

        {/* Pan/zoom controls */}
        {menuBtn('−', false, () => zoom(1.25))}
        {menuBtn('+', false, () => zoom(0.8))}
        {menuBtn('RST', false, () => setView({ start: 0, count: 0 }))}
      </div>

      {/* ── Chart canvas ── */}
      <div
        ref={containerRef}
        className="chart-shell"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => { endDrag(); setCrosshair(null); }}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, touchAction: 'pan-y' }} />

        {chartStatus === 'loading' && (
          <div className="chart-overlay" style={{ color: 'var(--text-dim)', fontSize: 10 }}>LOADING CHART DATA...</div>
        )}
        {chartStatus === 'empty' && candles.length === 0 && (
          <div className="chart-overlay" style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>NO HISTORICAL DATA</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8 }}>Chart data unavailable for this asset</div>
          </div>
        )}
        {(chartStatus === 'error' || chartStatus === 'rate_limited') && candles.length === 0 && (
          <div className="chart-overlay" style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ color: 'var(--amber, #FFD700)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
              {chartStatus === 'rate_limited' ? 'RATE LIMITED BY DATA PROVIDER' : 'CHART DATA UNAVAILABLE'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
              {chartError || 'The market data provider did not return history for this asset.'}
            </div>
            <button className="btn btn-sm btn-cyan" style={{ fontSize: 8, marginTop: 2 }} onClick={() => setReloadKey(k => k + 1)}>RETRY</button>
          </div>
        )}

        {crosshair && chartStatus === 'ok' && (
          <>
            <div style={{ position: 'absolute', left: crosshair.x, top: 0, bottom: 0, width: 1, background: 'var(--border-bright)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: crosshair.y, left: 0, right: 0, height: 1, background: 'var(--border-bright)', pointerEvents: 'none' }} />
            <div className="chart-tooltip">
              <span>O <b>{crosshair.candle.open.toFixed(6)}</b></span>
              <span>H <b>{crosshair.candle.high.toFixed(6)}</b></span>
              <span>L <b>{crosshair.candle.low.toFixed(6)}</b></span>
              <span>C <b>{crosshair.candle.close.toFixed(6)}</b></span>
              <span style={{ color: 'var(--text-dim)' }}>V {crosshair.candle.volume > 0 ? crosshair.candle.volume.toFixed(0) : 'N/A'}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
