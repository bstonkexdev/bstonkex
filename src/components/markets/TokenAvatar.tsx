import { useState } from 'react';

interface TokenAvatarProps {
  src: string | null | undefined;
  symbol: string;
  size?: number;
}

/**
 * Ave.ai-style dynamic token avatar with letter fallback.
 * Shows the token image if available and valid; falls back to a
 * purple circle with the first letter of the symbol on error/missing.
 */
export default function TokenAvatar({ src, symbol, size = 36 }: TokenAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // No image or broken → letter circle fallback
  if (!src || hasError) {
    const letter = symbol ? symbol.charAt(0).toUpperCase() : '?';
    return (
      <div
        style={{
          width: size, height: size, borderRadius: size / 2,
          background: '#2D1B69', border: '1.5px solid rgba(88,28,135,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: size * 0.33, color: '#C4B5FD',
          flexShrink: 0,
        }}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={symbol}
      style={{
        width: size, height: size, borderRadius: size / 2,
        objectFit: 'cover', flexShrink: 0,
        border: '1px solid rgba(31,41,55,0.8)',
      }}
      onError={() => setHasError(true)}
    />
  );
}
