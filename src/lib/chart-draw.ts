// Cupcak8 Swap Chart Renderer — pure canvas drawing for the existing price chart engine.
// Renders only real candle data passed in; never synthesizes candles or movement.
import type { CandleData } from './market';

export interface ChartTradeMarker { time: number; price: number; side: 'buy' | 'sell'; }

export interface DrawOpts {
  candles: CandleData[];
  /** Visible window over `candles` (pan/zoom). */
  start: number;
  count: number;
  mode: 'candles' | 'line';
  showVolume: boolean;
  showRsi: boolean;
  rsi: (number | null)[] | null;
  trades?: ChartTradeMarker[];
  /** true → date axis labels (daily or coarser candles), false → clock labels. */
  dateAxis: boolean;
  emptyLabel?: string;
}

export const PAD = { top: 16, right: 64, bottom: 22, left: 8 };

const GRID = '#1D263B';
const TEXT = '#555E72';
const GREEN = '#00E676';
const RED = '#FF5252';
const CYAN = '#0088FF';

/** Clamp a pan/zoom window to a valid range over `n` candles. */
export function clampView(n: number, start: number, count: number): { start: number; count: number } {
  if (n <= 0) return { start: 0, count: 0 };
  let c = Math.max(5, Math.min(count || n, n));
  let s = Math.max(0, Math.min(start, n - c));
  return { start: s, count: c };
}

/** Index (into full series) of the candle at canvas x — used by the crosshair. */
export function indexAtX(x: number, w: number, start: number, count: number, n: number): number {
  const cw = w - PAD.left - PAD.right;
  const rel = (x - PAD.left) / cw;
  return Math.max(0, Math.min(n - 1, start + Math.floor(rel * count)));
}

function fmtPrice(p: number): string {
  return p < 0.01 ? p.toExponential(2) : p.toFixed(4);
}

export function drawChart(canvas: HTMLCanvasElement, w: number, h: number, o: DrawOpts): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  // Background + subtle pixel grid
  ctx.fillStyle = '#0B0E14';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(35, 45, 63, 0.3)';
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx < w; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
  for (let gy = 0; gy < h; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

  const n = o.candles.length;
  if (n === 0) {
    ctx.fillStyle = TEXT;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(o.emptyLabel || 'NO HISTORICAL DATA', w / 2, h / 2);
    return;
  }

  const { start, count } = clampView(n, o.start, o.count);
  const view = o.candles.slice(start, start + count);
  const lastFull = o.candles[n - 1];

  const pad = PAD;
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  const rsiH = o.showRsi ? ch * 0.18 : 0;
  const volH = o.showVolume ? ch * 0.14 : 0;
  const gap = 4;
  const chartH = ch - rsiH - volH - (o.showRsi ? gap : 0) - (o.showVolume ? gap : 0);

  let minP = Infinity, maxP = -Infinity, maxV = 0;
  for (const c of view) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
    if (c.volume > maxV) maxV = c.volume;
  }
  const priceRange = (maxP - minP) || maxP * 0.01 || 1;
  const padAmt = priceRange * 0.05;
  minP -= padAmt; maxP += padAmt;
  const r = maxP - minP;
  const toY = (p: number) => pad.top + (1 - (p - minP) / r) * chartH;
  const toX = (i: number) => pad.left + (i + 0.5) * (cw / view.length);
  const candleW = Math.max(1, (cw / view.length) * 0.55);

  // Grid + price axis
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.5;
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(fmtPrice(maxP - (i / 4) * r), w - pad.right + 4, y + 3);
  }

  // Volume bars (only real volume — reference OHLC has none and renders without bars)
  if (o.showVolume && maxV > 0) {
    const vTop = pad.top + chartH + gap;
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const x = toX(i);
      const barH = (c.volume / maxV) * volH;
      ctx.fillStyle = c.close >= c.open ? 'rgba(27, 122, 43, 0.35)' : 'rgba(192, 36, 58, 0.35)';
      ctx.fillRect(x - candleW / 2, vTop + volH - barH, candleW, barH);
    }
    ctx.strokeStyle = 'rgba(35, 45, 63, 0.4)';
    ctx.beginPath(); ctx.moveTo(pad.left, vTop); ctx.lineTo(w - pad.right, vTop); ctx.stroke();
  }

  // Price series
  if (o.mode === 'line') {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < view.length; i++) {
      const x = toX(i), y = toY(view[i].close);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(toX(view.length - 1), pad.top + chartH);
    ctx.lineTo(toX(0), pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 136, 255, 0.06)';
    ctx.fill();
  } else {
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const x = toX(i);
      const col = c.close >= c.open ? GREEN : RED;
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, toY(c.high)); ctx.lineTo(x, toY(c.low)); ctx.stroke();
      const bTop = toY(Math.max(c.open, c.close));
      const bBot = toY(Math.min(c.open, c.close));
      ctx.fillStyle = col;
      ctx.fillRect(x - candleW / 2, bTop, candleW, Math.max(1, bBot - bTop));
    }
  }

  // Trade markers within the visible window
  if (o.trades && o.trades.length > 0) {
    for (const t of o.trades) {
      let closestIdx = -1, closestDiff = Infinity;
      for (let i = 0; i < view.length; i++) {
        const diff = Math.abs(view[i].time - t.time);
        if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
      }
      if (closestIdx < 0) continue;
      const x = toX(closestIdx);
      const y = toY(t.price);
      const isBuy = t.side === 'buy';
      ctx.fillStyle = isBuy ? GREEN : RED;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isBuy ? '▲' : '▼', x, y + (isBuy ? 11 : -4));
    }
  }

  // Current price line + label (from the full series — the actual last price)
  const curY = Math.max(pad.top, Math.min(pad.top + chartH, toY(lastFull.close)));
  const pCol = lastFull.close >= lastFull.open ? GREEN : RED;
  ctx.strokeStyle = pCol; ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(w - pad.right, curY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = pCol;
  ctx.fillRect(w - pad.right, curY - 7, pad.right, 14);
  ctx.fillStyle = '#0B0E14';
  ctx.font = 'bold 8px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(fmtPrice(lastFull.close), w - pad.right + 3, curY + 3);

  // Time axis
  ctx.fillStyle = TEXT;
  ctx.font = '8px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(view.length / 5));
  for (let i = 0; i < view.length; i += step) {
    const d = new Date(view[i].time * 1000);
    const lbl = o.dateAxis
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    ctx.fillText(lbl, toX(i), h - 6);
  }

  // RSI sub-panel (derived from real closes only)
  if (o.showRsi && o.rsi && rsiH > 0) {
    const top = pad.top + chartH + (o.showVolume ? volH + gap : 0) + gap;
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(pad.left, top, cw, rsiH);
    // 30 / 70 guides
    const rsiY = (v: number) => top + (1 - v / 100) * rsiH;
    ctx.setLineDash([2, 3]);
    for (const lvl of [30, 70]) {
      ctx.beginPath(); ctx.moveTo(pad.left, rsiY(lvl)); ctx.lineTo(w - pad.right, rsiY(lvl)); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < view.length; i++) {
      const v = o.rsi[start + i];
      if (v == null) continue;
      const x = toX(i), y = rsiY(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    if (started) ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.font = '7px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    const lastRsi = o.rsi[start + view.length - 1];
    ctx.fillText(`RSI 14 ${lastRsi != null ? lastRsi.toFixed(1) : 'N/A'}`, pad.left + 3, top + 9);
  }
}
