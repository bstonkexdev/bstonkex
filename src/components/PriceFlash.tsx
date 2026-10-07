import { useState, useEffect, useRef } from 'react';

interface Props {
  price: number | null;
  prefix?: string;
  suffix?: string;
  style?: React.CSSProperties;
  precision?: number;
}

/** Price display with subtle flash animation on real changes. */
export default function PriceFlash({ price, prefix = '$', suffix, style, precision = 2 }: Props) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPrice = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (price == null || prevPrice.current == null) {
      prevPrice.current = price;
      return;
    }
    if (price !== prevPrice.current) {
      const direction = price > prevPrice.current ? 'up' : 'down';
      setFlash(direction);
      prevPrice.current = price;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(null), 800);
    }
  }, [price]);

  const flashColor = flash === 'up' ? 'var(--green)' : flash === 'down' ? 'var(--red)' : undefined;
  const bgColor = flash === 'up' ? 'rgba(0,255,136,0.08)' : flash === 'down' ? 'rgba(255,48,96,0.08)' : 'transparent';

  const formatted = price != null ? `${prefix}${formatPrice(price, precision)}` : 'N/A';

  return (
    <span style={{
      transition: 'background 0.2s, color 0.2s',
      background: bgColor,
      padding: '0 2px',
      color: flashColor || style?.color,
      ...style,
    }}>
      {formatted}
      {suffix && <span style={{ fontSize: '0.75em', color: 'var(--text-dim)', marginLeft: 2 }}>{suffix}</span>}
    </span>
  );
}

function formatPrice(n: number, precision: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(precision);
  if (n >= 0.001) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(6);
  return n.toExponential(4);
}