// Cupcak8 Swap — Ave.ai-style Live Chart
// TradingView Lightweight Charts with Candlestick, MACD, RSI sub-panes
// Dark theme, green/red candles, high/low markers, current price line
import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type LineData, ColorType, CrosshairMode } from 'lightweight-charts';
import { microPrice } from '../../lib/micro-price';

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

interface Props {
  /** Raw candles (can be from market API or seeded) */
  candles: Candle[];
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

/** Calculate EMA for a data series */
function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = data[0] ?? 0;
  for (let i = 0; i < data.length; i++) {
    const val = data[i] * k + prev * (1 - k);
    out.push(val);
    prev = val;
  }
  return out;
}

/** Calculate RSI */
function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (i <= period) {
      gainSum += Math.max(0, diff);
      lossSum += Math.max(0, -diff);
      if (i < period) { out.push(null); continue; }
      const avgGain = gainSum / period;
      const avgLoss = lossSum / period;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    } else {
      const prev = out[out.length - 1] as number;
      const avgGain = (gainSum * (period - 1) + Math.max(0, diff)) / period;
      const avgLoss = (lossSum * (period - 1) + Math.max(0, -diff)) / period;
      gainSum = avgGain;
      lossSum = avgLoss;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  out.unshift(null);
  return out;
}

export default function AveLiveChart({ candles, currentPrice, chainColor, onTimeframeChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('5m');
  const [highPrice, setHighPrice] = useState<number | null>(null);
  const [lowPrice, setLowPrice] = useState<number | null>(null);

  const selectTimeframe = useCallback((tf: Timeframe) => {
    setActiveTimeframe(tf);
    onTimeframeChange?.(tf);
  }, [onTimeframeChange]);

  // Create charts
  useEffect(() => {
    if (!containerRef.current || !macdRef.current || !rsiRef.current) return;

    const mainChart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 320,
      layout: { background: { type: ColorType.Solid, color: BG }, textColor: TEXT_DIM, fontSize: 10 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(255,255,255,0.1)', width: 1 }, horzLine: { color: 'rgba(255,255,255,0.1)', width: 1 } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false },
    });

    const macdChart = createChart(macdRef.current, {
      width: macdRef.current.clientWidth,
      height: 100,
      layout: { background: { type: ColorType.Solid, color: BG2 }, textColor: TEXT_DIM, fontSize: 9 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
      timeScale: { visible: false },
    });

    const rsiChart = createChart(rsiRef.current, {
      width: rsiRef.current.clientWidth,
      height: 80,
      layout: { background: { type: ColorType.Solid, color: BG2 }, textColor: TEXT_DIM, fontSize: 9 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true },
    });

    chartRef.current = mainChart;
    macdChartRef.current = macdChart;
    rsiChartRef.current = rsiChart;

    const candleSeries = mainChart.addCandlestickSeries({
      upColor: GREEN, downColor: RED,
      borderUpColor: GREEN, borderDownColor: RED,
      wickUpColor: GREEN, wickDownColor: RED,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = mainChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // MACD lines
    const difLine = macdChart.addLineSeries({ color: '#3b82f6', lineWidth: 1 });
    const deaLine = macdChart.addLineSeries({ color: '#f59e0b', lineWidth: 1 });
    const macdHist = macdChart.addHistogramSeries({});

    // RSI lines
    const rsi6 = rsiChart.addLineSeries({ color: '#a78bfa', lineWidth: 1 });
    const rsi12 = rsiChart.addLineSeries({ color: '#60a5fa', lineWidth: 1 });
    const rsi24 = rsiChart.addLineSeries({ color: '#f472b6', lineWidth: 1 });

    // Sync crosshairs across all 3 charts
    const syncCrosshair = (src: IChartApi, ...targets: IChartApi[]) => {
      src.subscribeCrosshairMove((param: { time?: unknown }) => {
        for (const t of targets) {
          if (param.time) t.setCrosshairPosition(undefined as any, param.time as any, undefined as any);
        }
      });
    };
    syncCrosshair(mainChart, macdChart, rsiChart);
    syncCrosshair(macdChart, mainChart, rsiChart);
    syncCrosshair(rsiChart, mainChart, macdChart);

    // Resize observer
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = e.contentRect.width;
        mainChart.applyOptions({ width: w });
        macdChart.applyOptions({ width: w });
        rsiChart.applyOptions({ width: w });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      mainChart.remove();
      macdChart.remove();
      rsiChart.remove();
      chartRef.current = null;
      macdChartRef.current = null;
      rsiChartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const sorted = [...candles].sort((a, b) => a.time - b.time);

    // Candlestick data
    const candleData: CandlestickData[] = sorted.map(c => ({
      time: c.time as CandlestickData['time'],
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeriesRef.current.setData(candleData);

    // High/Low markers
    let hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
    for (const c of sorted) {
      if (c.high > hi) { hi = c.high; hiT = c.time; }
      if (c.low < lo) { lo = c.low; loT = c.time; }
    }
    setHighPrice(isFinite(hi) ? hi : null);
    setLowPrice(isFinite(lo) ? lo : null);

    candleSeriesRef.current.setMarkers([
      { time: hiT as any, position: 'aboveMarket', color: '#a78bfa', shape: 'circle', text: `H: ${microPrice(hi, '')}` },
      { time: loT as any, position: 'belowMarket', color: '#60a5fa', shape: 'circle', text: `L: ${microPrice(lo, '')}` },
    ]);

    // Volume bars
    const volumeSeries = chartRef.current?.series().find((s: any) => s.priceScaleId === '');
    if (volumeSeries) {
      const volData: HistogramData[] = sorted.map(c => ({
        time: c.time as HistogramData['time'],
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
      }));
      (volumeSeries as ISeriesApi<'Histogram'>).setData(volData);
    }

    // MACD calculation
    const closes = sorted.map(c => c.close);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const dif = ema12.map((v, i) => v - ema26[i]);
    const dea = ema(dif, 9);
    const macdVals = dif.map((v, i) => 2 * (v - dea[i]));

    const macdChart = macdChartRef.current;
    if (macdChart) {
      const series = macdChart.series();
      if (series.length >= 3) {
        (series[0] as ISeriesApi<'Line'>).setData(dif.map((v, i) => ({ time: sorted[i].time as LineData['time'], value: v })));
        (series[1] as ISeriesApi<'Line'>).setData(dea.map((v, i) => ({ time: sorted[i].time as LineData['time'], value: v })));
        (series[2] as ISeriesApi<'Histogram'>).setData(macdVals.map((v, i) => ({
          time: sorted[i].time as HistogramData['time'], value: v,
          color: v >= 0 ? (macdVals[i - 1] !== undefined && v > macdVals[i - 1] ? GREEN : 'rgba(16,185,129,0.4)') : (macdVals[i - 1] !== undefined && v < macdVals[i - 1] ? RED : 'rgba(239,68,68,0.4)'),
        })));
      }
    }

    // RSI calculation
    const rsiChart = rsiChartRef.current;
    if (rsiChart) {
      const rsi6Data = rsi(closes, 6);
      const rsi12Data = rsi(closes, 12);
      const rsi24Data = rsi(closes, 24);
      const series = rsiChart.series();
      if (series.length >= 3) {
        const toLine = (data: (number | null)[]) => data.map((v, i) => v != null ? { time: sorted[i].time as LineData['time'], value: v } : null).filter(Boolean) as LineData[];
        (series[0] as ISeriesApi<'Line'>).setData(toLine(rsi6Data));
        (series[1] as ISeriesApi<'Line'>).setData(toLine(rsi12Data));
        (series[2] as ISeriesApi<'Line'>).setData(toLine(rsi24Data));
      }
    }
  }, [candles]);

  // Current price line
  useEffect(() => {
    if (!candleSeriesRef.current || currentPrice == null || !isFinite(currentPrice)) return;
    candleSeriesRef.current.createPriceLine({
      price: currentPrice,
      color: chainColor || '#3b82f6',
      lineWidth: 1,
      lineStyle: 2, // Dotted
      axisLabelVisible: true,
      title: microPrice(currentPrice, ''),
    });
  }, [currentPrice, chainColor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: BG, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* ── Timeframe Selector ──────────────────────────────────────── */}
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
        {/* High/Low badges */}
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

      {/* ── Main Candlestick Chart ──────────────────────────────────── */}
      <div ref={containerRef} style={{ width: '100%', height: 320 }} />

      {/* ── MACD Sub-pane ───────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ padding: '4px 10px', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', background: BG2, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>MACD(12,26,9)</span>
          <span style={{ color: '#3b82f6' }}>DIF</span>
          <span style={{ color: '#f59e0b' }}>DEA</span>
        </div>
        <div ref={macdRef} style={{ width: '100%', height: 100 }} />
      </div>

      {/* ── RSI Sub-pane ────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ padding: '4px 10px', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', background: BG2, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>RSI</span>
          <span style={{ color: '#a78bfa' }}>6</span>
          <span style={{ color: '#60a5fa' }}>12</span>
          <span style={{ color: '#f472b6' }}>24</span>
        </div>
        <div ref={rsiRef} style={{ width: '100%', height: 80 }} />
      </div>
    </div>
  );
}