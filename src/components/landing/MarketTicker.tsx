// BSTONKEX — Continuously scrolling market ticker
import { useState, useEffect, useRef } from 'react';
import { CHAINS, formatUsd, formatPct } from '../../lib/config';
import type { ChainId } from '../../lib/config';
import type { MarketToken } from '../../lib/market-discovery';
import ChainIcon from '../ChainIcon';

interface Props {
  tokens: MarketToken[];
}

export default function MarketTicker({ tokens }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (tokens.length === 0) return;
    let raf: number;
    const speed = 0.4;
    const animate = () => {
      setOffset(prev => {
        const track = trackRef.current;
        if (!track) return prev;
        const half = track.scrollWidth / 2;
        const next = prev - speed;
        return next <= -half ? 0 : next;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [tokens.length]);

  if (tokens.length === 0) {
    return (
      <div style={{
        height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em',
      }}>
        LOADING MARKET DATA...
      </div>
    );
  }

  // Duplicate items for seamless loop
  const items = [...tokens.slice(0, 20), ...tokens.slice(0, 20)];

  return (
    <div style={{
      height: 28, overflow: 'hidden',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      borderTop: '1px solid var(--border)',
    }}>
      <div ref={trackRef} style={{
        display: 'flex', alignItems: 'center', height: '100%',
        transform: `translateX(${offset}px)`,
        willChange: 'transform',
      }}>
        {items.map((t, i) => {
          const chain = CHAINS[t.chainId];
          const isUp = (t.priceChange24h ?? 0) >= 0;
          return (
            <div key={`${t.symbol}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 16px', whiteSpace: 'nowrap', flexShrink: 0,
              fontSize: 9, borderRight: '1px solid var(--border)',
            }}>
              <ChainIcon chainId={t.chainId as ChainId} size={10} />
              <span style={{ fontWeight: 800, color: 'var(--text-bright)' }}>{t.symbol}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 8 }}>{chain?.shortName}</span>
              <span style={{ color: 'var(--text)' }}>{formatUsd(t.price)}</span>
              <span style={{ fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)', fontSize: 8 }}>
                {isUp ? '↑' : '↓'} {formatPct(t.priceChange24h)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}