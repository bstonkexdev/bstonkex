import { useState, useEffect, useRef } from 'react';

interface TokenAvatarProps {
  src: string | null | undefined;
  symbol: string;
  size?: number;
}

// IPFS gateway fallback chain — try each before letter badge
const IPFS_FALLBACKS = [
  'https://cf-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

function extractIpfsHash(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', '').replace(/^ipfs\//, '');
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function buildFallbackUrls(src: string): string[] {
  const hash = extractIpfsHash(src);
  if (!hash) return [src];
  return IPFS_FALLBACKS.map(gw => gw + hash);
}

/**
 * Token avatar with multi-gateway IPFS fallback.
 * Tries original src, then cf-ipfs.com, then gateway.pinata.cloud,
 * before falling back to purple letter-circle badge.
 */
export default function TokenAvatar({ src, symbol, size = 36 }: TokenAvatarProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const urlRef = useRef<string>('');

  // Compute URLs and reset when src changes
  useEffect(() => {
    setGatewayIndex(0);
    setHasError(false);
  }, [src]);

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

  const fallbackUrls = buildFallbackUrls(src);
  const currentUrl = fallbackUrls[Math.min(gatewayIndex, fallbackUrls.length - 1)];

  function handleError() {
    if (gatewayIndex < fallbackUrls.length - 1) {
      setGatewayIndex(prev => prev + 1); // Try next gateway
    } else {
      setHasError(true); // All gateways failed — show letter badge
    }
  }

  return (
    <img
      src={currentUrl}
      alt={symbol}
      style={{
        width: size, height: size, borderRadius: size / 2,
        objectFit: 'cover', flexShrink: 0,
        border: '1px solid rgba(31,41,55,0.8)',
      }}
      onError={handleError}
    />
  );
}
