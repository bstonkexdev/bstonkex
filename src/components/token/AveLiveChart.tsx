// Cupcak8 Swap — Ave.ai-style Live Chart (Canvas-based, zero dependencies)
// Candlestick + Volume histogram + High/Low markers + Current price line
// Data: GeckoTerminal OHLCV (primary) → DexScreener pair → backend → fallback
// Dark theme, green/red candles, timeframe selector

import { useEffect, useRef, useState, useCallback } from 'react';
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

const BG = '#12161f';
const BG2 = '#0e1118';
const GREEN = '#10b981';
const RED = '#ef4444';
const GRID = 'rgba(255,255,255,0.04)';
const TEXT_DIM = 'rgba(255,255,255,0.35)';

// ── Fetch OHLCV candles from GeckoTerminal (public, no auth) ──────────
async function fetchCandlesFromAPI(mint: string, tf: Timeframe): Promise<{ candles: Candle[]; source: string }> {
  // Step 1: Get best pair address from DexScreener
  const pairRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${encodeURIComponent(mint)}`, { signal: AbortSignal.timeout(10000) });
  if (!pairRes.ok) throw new Error(`DexScreener HTTP ${pairRes.status}`);
  const pairs = await pairRes.json();
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('No pairs found on DexScreener');

  // Pick pair with highest liquidity
  const best = pairs.reduce((a: any, b: any) => (b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a, pairs[0]);
  const pairAddress = best.pairAddress;
  if (!pairAddress) throw new Error('No pair address found');

  // Step 2: Fetch OHLCV from GeckoTerminal
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

// ── Build synthetic candles from DexScreener pair data (last resort) ───
function buildSyntheticCandles(price: number, priceChange24h: number, volume24h: number): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const startPrice = price / (1 + (priceChange24h || 0) / 100);
  const candles: Candle[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t = now - (n - i) * 1800; // 30min intervals
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

// ── Canvas chart drawing ───────────────────────────────────────────────
function drawChart(canvas: HTMLCanvasElement, candles: Candle[], currentPrice: number | null) {
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
    ctx.fillText('Loading chart data…', W / 2, H / 2);
    return;
  }

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const pad = { top: 20, right: 60, bottom: 30, left: 10 };

  let hi = -Infinity, lo = Infinity;
  for (const c of sorted) { if (c.high > hi) hi = c.high; if (c.low < lo) lo = c.low; }
  const priceRange = hi - lo || 1;
  const pricePad = priceRange * 0.08;
  hi += pricePad; lo -= pricePad;

  let maxVol = 0;
  for (const c of sorted) { if (c.volume > maxVol) maxVol = c.volume; }
  const volH = H * 0.15;

  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom - volH;
  const barW = Math.max(1, chartW / sorted.length);
  const gap = Math.max(0.5, barW * 0.2);

  const priceToY = (p: number) => pad.top + chartH * (1 - (p - lo) / (hi - lo));
  const volToH = (v: number) => maxVol > 0 ? (v / maxVol) * volH : 0;

  // Grid
  ctx.strokeStyle = GRID; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (chartH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const price = hi - ((hi - lo) / 5) * i;
    ctx.fillStyle = TEXT_DIM; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText(microPrice(price, ''), W - pad.right + 4, y + 3);
  }

  // Volume separator
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.moveTo(pad.left, pad.top + chartH + 4); ctx.lineTo(W - pad.right, pad.top + chartH + 4); ctx.stroke();

  // Candles + Volume
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const x = pad.left + i * barW + barW / 2;
    const isBull = c.close >= c.open;
    const color = isBull ? GREEN : RED;

    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, priceToY(c.high)); ctx.lineTo(x, priceToY(c.low)); ctx.stroke();

    const bodyTop = priceToY(Math.max(c.open, c.close));
    const bodyBot = priceToY(Math.min(c.open, c.close));
    ctx.fillStyle = color;
    ctx.fillRect(x - (barW - gap) / 2, bodyTop, barW - gap, Math.max(1, bodyBot - bodyTop));

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
  const mark = (idx: number, label: string, color: string, above: boolean) => {
    const x = pad.left + idx * barW + barW / 2;
    const y = above ? priceToY(sorted[idx].high) - 10 : priceToY(sorted[idx].low) + 14;
    ctx.fillStyle = color; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, x, y);
    ctx.beginPath(); ctx.arc(x, above ? priceToY(sorted[idx].high) - 3 : priceToY(sorted[idx].low) + 3, 2, 0, Math.PI * 2); ctx.fill();
  };
  mark(hiIdx, `H: ${microPrice(sorted[hiIdx].high, '')}`, '#a78bfa', true);
  mark(loIdx, `L: ${microPrice(sorted[loIdx].low, '')}`, '#60a5fa', false);

  // Current price line
  if (currentPrice != null && isFinite(currentPrice) && currentPrice >= lo && currentPrice <= hi) {
    const y = priceToY(currentPrice);
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(W - pad.right, y - 8, pad.right, 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillText(microPrice(currentPrice, ''), W - pad.right + 4, y + 3);
  }

  // Time labels
  const step = Math.max(1, Math.floor(sorted.length / 8));
  ctx.fillStyle = TEXT_DIM; ctx.font = '8px monospace'; ctx.textAlign = 'center';
  for (let i = 0; i < sorted.length; i += step) {
    const d = new Date(sorted[i].time * 1000);
    ctx.fillText(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`, pad.left + i * barW + barW / 2, H - pad.bottom + 14);
  }
}

// ── Main Component ─────────────────────────────────────────────────────
export default function AveLiveChart({ mint, fallbackCandles = [], currentPrice, onTimeframeChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
                parseFloat(best.priceUsd),
                best.priceChange?.h24 || 0,
                best.volume?.h24 || 0,
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

  // Subscribe to PumpPortal trade events for this specific mint (feeds real-time data)
  useEffect(() => {
    if (!mint) return;
    let unsubTrade: (() => void) | undefined;
    import('../../lib/engine/discovery/pumpportal-stream').then(({ subscribeTokenTrades, unsubscribeTokenTrades, onTokenTrade }) => {
      subscribeTokenTrades(mint);
      // Listen for PumpPortal trades and update candles in real-time
      unsubTrade = onTokenTrade((trade: any) => {
        if (trade.mint !== mint) return;
        const priceUsd = trade.priceUsd || 0;
        if (priceUsd <= 0) return;
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

  // Update candles when fallbackCandles changes (real-time trades)
  useEffect(() => {
    if (source.startsWith('local engine') && fallbackCandles.length > 0) {
      setCandles(fallbackCandles);
      setSource(`local engine (${fallbackCandles.length})`);
    }
  }, [fallbackCandles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current) return;
    drawChart(canvasRef.current, candles, currentPrice);
    if (candles.length > 0) {
      let hi = -Infinity, lo = Infinity;
      for (const c of candles) { if (c.high > hi) hi = c.high; if (c.low < lo) lo = c.low; }
      setHighPrice(isFinite(hi) ? hi : null);
      setLowPrice(isFinite(lo) ? lo : null);
    }
  }, [candles, currentPrice]);

  // Resize
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
          <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700, marginRight: 8 }}>H: {microPrice(highPrice, '')}</span>
        )}
        {lowPrice != null && (
          <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>L: {microPrice(lowPrice, '')}</span>
        )}
      </div>

      {/* Canvas Chart */}
      <canvas ref={canvasRef} style={{ width: '100%', height: 380, display: 'block' }} />

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