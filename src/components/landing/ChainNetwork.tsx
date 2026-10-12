// Cupcak8 Swap — Pixel network map visualization
import { useRef, useEffect } from 'react';
import { CONFIGURED_CHAINS } from '../../lib/config';

interface Props {
  chainStatuses: Record<string, 'live' | 'delayed' | 'offline'>;
}

export default function ChainNetwork({ chainStatuses }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    let t = 0;
    let raf: number;
    const draw = () => {
      t += 0.016;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;

      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(35,45,63,0.2)';
      ctx.lineWidth = 0.5;
      for (let gx = 0; gx < w; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 20) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      // Center Cupcak8 Swap node
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
      coreGrad.addColorStop(0, 'var(--cyan-bg)');
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - 30, cy - 30, 60, 60);

      ctx.fillStyle = '#0088FF';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#E8547C';
      ctx.font = '800 7px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Cupcak8', cx, cy - 14);

      // Chain nodes
      const chains = CONFIGURED_CHAINS;
      const radius = Math.min(w, h) * 0.35;

      chains.forEach((chain, i) => {
        const angle = (i / chains.length) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(angle) * radius;
        const ny = cy + Math.sin(angle) * radius;

        const status = chainStatuses[chain.id] || 'offline';
        const statusColor = status === 'live' ? '#00E676' : status === 'delayed' ? '#FFD700' : '#FF5252';

        // Connection line
        ctx.strokeStyle = `${statusColor}30`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        ctx.setLineDash([]);

        // Data packet animation
        const packet = ((t * 0.5 + i * 0.7) % 1);
        if (status === 'live') {
          const px = cx + (nx - cx) * packet;
          const py = cy + (ny - cy) * packet;
          ctx.fillStyle = `${statusColor}80`;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Node
        ctx.fillStyle = statusColor;
        ctx.beginPath();
        ctx.arc(nx, ny, 8, 0, Math.PI * 2);
        ctx.fill();

        // Node inner
        ctx.fillStyle = '#0B0E14';
        ctx.beginPath();
        ctx.arc(nx, ny, 5, 0, Math.PI * 2);
        ctx.fill();

        // Chain color dot
        ctx.fillStyle = chain.color;
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = chain.color;
        ctx.font = '800 9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(chain.shortName, nx, ny - 14);

        // Status label
        ctx.fillStyle = statusColor;
        ctx.font = '700 6px JetBrains Mono, monospace';
        ctx.fillText(status.toUpperCase(), nx, ny + 18);
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [chainStatuses]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 240, minHeight: 180 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}