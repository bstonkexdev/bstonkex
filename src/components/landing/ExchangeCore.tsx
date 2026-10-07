// BSTONKEX — Pixel Exchange Core centerpiece animation
// A futuristic stock-exchange machine / market processor visualization
import { useState, useEffect, useRef } from 'react';
import { CHAINS, CONFIGURED_CHAINS } from '../../lib/config';
import type { MarketEvent } from '../../lib/engine/activity-engine';

interface Props {
  events: MarketEvent[];
  activeMarkets: number;
}

export default function ExchangeCore({ events, activeMarkets }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    let t = 0;
    const draw = () => {
      t += 0.016;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;

      // Background
      ctx.fillStyle = '#040810';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(22,40,72,0.12)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < w; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 24) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      // Outer ring
      const outerR = Math.min(w, h) * 0.38;
      ctx.strokeStyle = 'rgba(0,204,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating segments
      for (let i = 0; i < 4; i++) {
        const angle = t * 0.3 + (i * Math.PI / 2);
        const segLen = Math.PI * 0.15;
        ctx.strokeStyle = `rgba(0,204,255,${0.3 + Math.sin(t * 2 + i) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, angle, angle + segLen);
        ctx.stroke();
      }

      // Inner ring
      const innerR = outerR * 0.65;
      ctx.strokeStyle = 'rgba(0,255,136,0.1)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
      ctx.stroke();

      // Counter-rotating segments
      for (let i = 0; i < 3; i++) {
        const angle = -t * 0.5 + (i * Math.PI * 2 / 3);
        const segLen = Math.PI * 0.2;
        ctx.strokeStyle = `rgba(0,255,136,${0.25 + Math.sin(t * 1.5 + i) * 0.1})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, angle, angle + segLen);
        ctx.stroke();
      }

      // Core glow
      const coreR = 28 + Math.sin(t * 2) * 3;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2);
      grad.addColorStop(0, 'rgba(0,204,255,0.15)');
      grad.addColorStop(0.5, 'rgba(0,204,255,0.04)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - coreR * 2, cy - coreR * 2, coreR * 4, coreR * 4);

      // Core dot
      ctx.fillStyle = '#00ccff';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Chain nodes around the outer ring
      const chains = CONFIGURED_CHAINS;
      chains.forEach((chain, i) => {
        const angle = (i / chains.length) * Math.PI * 2 - Math.PI / 2 + t * 0.05;
        const nx = cx + Math.cos(angle) * outerR;
        const ny = cy + Math.sin(angle) * outerR;

        // Node dot
        ctx.fillStyle = chain.color;
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fill();

        // Node label
        ctx.fillStyle = chain.color;
        ctx.font = '700 8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(chain.shortName, nx, ny - 10);

        // Connection line to core
        ctx.strokeStyle = `${chain.color}20`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // BUY/SELL activity pulses
      const evts = eventsRef.current;
      if (evts.length > 0) {
        const pulseIdx = Math.floor(t * 2) % Math.min(evts.length, 8);
        const e = evts[pulseIdx];
        if (e) {
          const chain = chains.find(c => c.id === e.chainId);
          if (chain) {
            const ci = chains.indexOf(chain);
            const angle = (ci / chains.length) * Math.PI * 2 - Math.PI / 2 + t * 0.05;
            const nx = cx + Math.cos(angle) * outerR;
            const ny = cy + Math.sin(angle) * outerR;

            const isBuy = e.side === 'buy';
            const pulse = (t * 3) % 1;
            const px = cx + (nx - cx) * pulse;
            const py = cy + (ny - cy) * pulse;

            ctx.fillStyle = isBuy ? `rgba(0,255,136,${0.6 * (1 - pulse)})` : `rgba(255,48,96,${0.6 * (1 - pulse)})`;
            ctx.beginPath();
            ctx.arc(px, py, 2 + pulse * 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Data stream lines (subtle horizontal lines moving across)
      for (let i = 0; i < 3; i++) {
        const ly = cy - 20 + i * 20;
        const lx = ((t * 40 + i * 80) % (w + 40)) - 20;
        ctx.strokeStyle = 'rgba(0,204,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx - 15, ly);
        ctx.lineTo(lx + 15, ly);
        ctx.stroke();
      }

      // Market count at center
      ctx.fillStyle = 'rgba(0,204,255,0.5)';
      ctx.font = '800 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${activeMarkets} MARKETS`, cx, cy + 18);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [activeMarkets]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 280, minHeight: 200 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}