// Cupcak8 Swap — TradingView Lightweight Charts Integration
// Professional candlestick chart with volume histogram, real-time updates
// Data: GeckoTerminal OHLCV → DexScreener → backend WS → PumpPortal → fallback

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, Time, ColorType } from 'lightweight-charts';
import { microPrice } from '../../lib/micro-price';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

interface Props {
  mint: string;
  fallbackCandles?: Candle[];
  currentPrice: number | null;
  chainColor?: string;
  onTimeframeChange?: (tf: Timeframe) => void;
}

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '1m', label: '1m' }, { key: '5m', label: '5m' }, { key: '15m', label: '15m' },
  { key: '1h', label: '1h' }, { key: '4h', label: '4h' }, { key: '1d', label: '1d' },
];

const BG = '#0c0d10';
const BG2 = '#0a0b0e';
const GREEN = '#10b981';
const RED = '#ef4444';

// ── Fetch OHLCV candles from GeckoTerminal ──────────────────────────
async function fetchCandlesFromAPI(mint: string, tf: Timeframe): Promise<{ candles: Candle[]; source: string }> {
  const pairRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`, { signal: AbortSignal.timeout(10000) });
  if (!pairRes.ok) throw new Error(`DexScreener HTTP ${pairRes.status}`);
  const pairs = await pairRes.json();
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('No pairs found on DexScreener');

  const best = pairs.reduce((a: any, b: any) => (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a, pairs[0]);
  const pairAddress = best.pairAddress;
  if (!pairAddress) throw new Error('No pair address found');

  const tfMap: Record<Timeframe, { unit: string; agg: string }> = {
    '1m': { unit: 'minute', agg: '1' },
    '5m': { unit: 'minute', agg: '5' },
    '15m': { unit: 'minute', agg: '15' },
    '1h': { unit: 'hour', agg: '1' },
    '4h': { unit: 'hour', agg: '4' },
    '1d': { unit: 'day', agg: '1' },
  };
  const { unit, agg } = tfMap[tf];
  const gtUrl = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${unit}?aggregate=${agg}`;
  const gtRes = await fetch(gtUrl, { signal: AbortSignal.timeout(10000) });
  if (!gtRes.ok) throw new Error(`GeckoTerminal HTTP ${gtRes.status}`);
  const gtData = await gtRes.json();
  const ohlcvList = gtData?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(ohlcvList) || ohlcvList.length === 0) throw new Error('GeckoTerminal returned empty OHLCV');

  const candles: Candle[] = ohlcvList.map((c: any[]) => ({
    time: Math.floor(c[0] || 0),
    open: Number(c[1]) || 0,
    high: Number(c[2]) || 0,
    low: Number(c[3]) || 0,
    close: Number(c[4]) || 0,
    volume: Number(c[5]) || 0,
  })).filter((c: Candle) => c.time > 0 && (c.open > 0 || c.close > 0));

  if (candles.length === 0) throw new Error('All OHLCV candles were zero');
  return { candles, source: `geckoterminal (${candles.length} candles)` };
}

// ── Build synthetic candles from DexScreener pair data ──────────────
function buildSyntheticCandles(price: number, priceChange24h: number, volume24h: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const startPrice = price / (1 + (priceChange24h || 0) / 100);
  const candles: Candle[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t = now - (n - i) * 1800;
    const progress = i / n;
    const p = startPrice + (price - startPrice) * progress;
    const jitter = p * 0.015 * Math.sin(i * 1.8);
    candles.push({
      time: t,
      open: p - jitter,
      high: p + Math.abs(jitter) * 1.3 + p * 0.005 * Math.random(),
      low: p - Math.abs(jitter) * 1.3 - p * 0.005 * Math.random(),
      close: p + jitter,
      volume: (volume24h / n) * (0.3 + 1.4 * Math.random()),
    });
  }
  candles[candles.length - 1].close = price;
  candles[candles.length - 1].time = now;
  return candles;
}

// ── Main Component ──────────────────────────────────────────────────
export default function AveLiveChart({ mint, fallbackCandles = [], currentPrice, onTimeframeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<string>('loading');
  const [error, setError] = useState<string | null>(null);
  const [highPrice, setHighPrice] = useState<number | null>(null);
  const [lowPrice, setLowPrice] = useState<number | null>(null);

  const selectTimeframe = useCallback((tf: Timeframe) => {
    setActiveTimeframe(tf);
    onTimeframeChange?.(tf);
  }, [onTimeframeChange]);

  // Initialize TradingView Lightweight Chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: BG }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#1f2937' },
      rightPriceScale: { borderColor: '#1f2937' },
      crosshair: { mode: 0 },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderVisible: false,
      wickUpColor: GREEN,
      wickDownColor: RED,
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  // Fetch candles on mount + timeframe change
  useEffect(() => {
    if (!mint) { setSource('no mint'); return; }
    let cancelled = false;

    (async () => {
      setSource('loading');
      setError(null);

      // 1. Try GeckoTerminal OHLCV via DexScreener pair lookup
      try {
        const result = await fetchCandlesFromAPI(mint, activeTimeframe);
        if (cancelled) return;
        setCandles(result.candles);
        setSource(result.source);
        return;
      } catch (e: any) {
        if (cancelled) return;
        console.warn('[AveLiveChart] GeckoTerminal failed:', e?.message || e);
      }

      // 2. Try synthetic from DexScreener pair data
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`, { signal: AbortSignal.timeout(10000) });
        if (pairRes.ok) {
          const pairs = await pairRes.json();
          if (cancelled) return;
          if (Array.isArray(pairs) && pairs.length > 0) {
            const best = pairs.reduce((a: any, b: any) => (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a, pairs[0]);
            if (best.priceUsd) {
              const synthetic = buildSyntheticCandles(
                parseFloat(best.priceUsd), best.priceChange?.h24 || 0, best.volume?.h24 || 0,
              );
              setCandles(synthetic);
              setSource(`dexscreener synthetic (${synthetic.length})`);
              return;
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        console.warn('[AveLiveChart] DexScreener synthetic failed:', e?.message || e);
      }

      // 3. Fallback to local candle engine
      if (cancelled) return;
      if (fallbackCandles.length > 0) {
        setCandles(fallbackCandles);
        setSource(`local engine (${fallbackCandles.length})`);
      } else {
        setCandles([]);
        setSource('no data');
        setError('No chart data available. Check console for API errors.');
      }
    })();

    return () => { cancelled = true; };
  }, [mint, activeTimeframe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update chart when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);

    const candleData: CandlestickData[] = sorted.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = sorted.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Update high/low
    let hi = -Infinity, lo = Infinity;
    for (const c of sorted) { if (c.high > hi) hi = c.high; if (c.low < lo) lo = c.low; }
    setHighPrice(isFinite(hi) ? hi : null);
    setLowPrice(isFinite(lo) ? lo : null);

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Current price line
  useEffect(() => {
    if (!candleSeriesRef.current || currentPrice == null || !isFinite(currentPrice)) return;
    // Create/update price line
    candleSeriesRef.current.createPriceLine({
      price: currentPrice,
      color: '#3b82f6',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '',
    });
  }, [currentPrice]);

  // Subscribe to real-time candle_tick from backend WS gateway
  useEffect(() => {
    if (!mint) return;
    let unsub: (() => void) | undefined;
    import('../../lib/engine/realtime-ws').then(({ wsManager }) => {
      const intervalMap: Record<Timeframe, string> = {
        '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d',
      };
      const channel = `chart:${mint}:${intervalMap[activeTimeframe] || '1m'}`;
      unsub = wsManager.subscribe(channel, (msg: any) => {
        if (msg.type === 'candle_tick' && msg.candle) {
          const c = msg.candle;
          // Update TradingView chart directly
          candleSeriesRef.current?.update({
            time: c.time as Time,
            open: c.open, high: c.high, low: c.low, close: c.close,
          });
          volumeSeriesRef.current?.update({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
          });
          // Also update state for consistency
          setCandles(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.time === c.time) {
              updated[updated.length - 1] = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
            } else {
              updated.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
              if (updated.length > 500) updated.splice(0, updated.length - 500);
            }
            return updated;
          });
        }
      });
    }).catch(() => {});
    return () => { unsub?.(); };
  }, [mint, activeTimeframe]);

  // Subscribe to PumpPortal trade events for this specific mint
  useEffect(() => {
    if (!mint) return;
    let unsubTrade: (() => void) | undefined;
    import('../../lib/engine/discovery/pumpportal-stream').then(({ subscribeTokenTrades, unsubscribeTokenTrades, onTokenTrade }) => {
      subscribeTokenTrades(mint);
      unsubTrade = onTokenTrade((trade: any) => {
        if (trade.mint !== mint) return;
        const priceUsd = trade.priceUsd || 0;
        if (priceUsd <= 0) return;
        // Update TradingView chart directly for instant feedback
        const now = Math.floor(Date.now() / 1000);
        candleSeriesRef.current?.update({
          time: now as Time,
          open: priceUsd, high: priceUsd, low: priceUsd, close: priceUsd,
        });
        setCandles(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            high: Math.max(last.high, priceUsd),
            low: Math.min(last.low, priceUsd),
            close: priceUsd,
            volume: last.volume + (trade.volumeUsd || 0),
          };
          return updated;
        });
      });
      return () => { unsubscribeTokenTrades(mint); };
    }).catch(() => {});
    return () => { unsubTrade?.(); };
  }, [mint]);

  // Update candles when fallbackCandles changes
  useEffect(() => {
    if (source.startsWith('local engine') && fallbackCandles.length > 0) {
      setCandles(fallbackCandles);
      setSource(`local engine (${fallbackCandles.length})`);
    }
  }, [fallbackCandles]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, marginRight: 8 }}>H: {microPrice(highPrice, '')}</span>
        )}
        {lowPrice != null && (
          <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>L: {microPrice(lowPrice, '')}</span>
        )}
      </div>

      {/* TradingView Lightweight Chart */}
      <div ref={containerRef} style={{ width: '100%', height: 380 }} />

      {/* Data footer with diagnostics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: BG2, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize: 8, color: error ? '#ef4444' : 'var(--text-muted)', fontFamily: 'monospace' }}>
          {error || `${candles.length} candles · ${source}`}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{mint.slice(0, 8)}…</span>
      </div>
    </div>
  );
}