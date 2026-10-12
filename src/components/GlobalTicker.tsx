// Cupcak8 Swap — Global Market Ticker Bar
import { useState, useEffect, useRef } from 'react';
import { CHAINS, formatUsd, formatPct } from '../lib/config';
import type { ChainId } from '../lib/config';
import type { MarketToken } from '../lib/market-discovery';
import ChainIcon from './ChainIcon';

interface Props { tokens: MarketToken[]; }

export default function GlobalTicker({ tokens }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (tokens.length === 0) return;
    let raf: number;
    const animate = () => {
      setOffset(prev => {
        const track = trackRef.current;
        if (!track) return prev;
        const half = track.scrollWidth / 2;
        const next = prev - 0.5;
        return next <= -half ? 0 : next;
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [tokens.length]);

  if (tokens.length === 0) {
    return (
      <div className="ticker-bar" style={{ justifyContent: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
        LOADING MARKET DATA...
      </div>
    );
  }

  const items = [...tokens.slice(0, 15), ...tokens.slice(0, 15)];

  return (
    <div className="ticker-bar">
      <div ref={trackRef} style={{
        display: 'flex', alignItems: 'center', height: '100%',
        transform: `translateX(${offset}px)`, willChange: 'transform',
      }}>
        {items.map((t, i) => {
          const chain = CHAINS[t.chainId];
          const isUp = (t.priceChange24h ?? 0) >= 0;
          return (
            <div key={`${t.symbol}-${i}`} className="ticker-item">
              <ChainIcon chainId={t.chainId as ChainId} size={14} />
              <span className="ticker-sym">{t.symbol}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>{chain?.shortName}</span>
              <span className="ticker-price">{formatUsd(t.price)}</span>
              <span style={{ color: isUp ? 'var(--lime-dim)' : 'var(--red)', fontWeight: 700, fontSize: 11 }}>
                {isUp ? '+' : ''}{formatPct(t.priceChange24h)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}