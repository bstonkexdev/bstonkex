import { useState, useCallback } from 'react';
import type { ChainId } from '../lib/config';
import { CHAINS } from '../lib/config';

interface ChainIconProps {
  chainId: ChainId | 'all';
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// ─────────────────────────────────────────────────────────────────────
// Real chain logos — same sources used by MetaMask, Rabby, Rainbow,
// and most DeFi terminals.  TrustWallet's open-source asset repo is
// the de-facto standard.  Each entry has a remote CDN URL (primary)
// and a tiny local SVG (fallback if CDN is unreachable).
// ─────────────────────────────────────────────────────────────────────

const REMOTE_LOGOS: Record<string, string> = {
  // TrustWallet open-source assets (raw.githubusercontent.com)
  bsc:      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
  solana:   'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  base:     'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
  robinhood:`data:image/png;base64,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`,
};

// Minimal local SVG fallbacks — only shown if remote CDN fails
const FALLBACK_SVG: Record<string, string> = {
  bsc: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#F0B90B"/><path d="M20 7.5L14.5 10.5v6L20 19.5l5.5-3v-6L20 7.5zM14.5 16.5L20 19.5v6l-5.5-3v-6zm11 0L20 19.5v6l5.5-3v-6z" fill="#fff"/><path d="M9 14.5L3.5 17.5v6L9 26.5l5.5-3v-6L9 14.5zM3.5 23.5L9 26.5v6l-5.5-3v-6zm11 0L9 26.5v6l5.5-3v-6z" fill="#fff" opacity=".85"/><path d="M31 14.5l-5.5 3v6L31 26.5l5.5-3v-6L31 14.5zm-5.5 9L31 26.5v6l-5.5-3v-6zm11 0L31 26.5v6l5.5-3v-6z" fill="#fff" opacity=".85"/></svg>')}`,
  solana: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="s1" x1="10" y1="25" x2="30" y2="20"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient><linearGradient id="s2" x1="10" y1="21" x2="30" y2="16"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient><linearGradient id="s3" x1="10" y1="17" x2="30" y2="12"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="#141420"/><path d="M10 25h17l3-3H13l-3 3z" fill="url(#s1)"/><path d="M10 21h17l3-3H13l-3 3z" fill="url(#s2)"/><path d="M10 17h17l3-3H13l-3 3z" fill="url(#s3)"/></svg>')}`,
  base: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0052FF"/><circle cx="20" cy="20" r="13" fill="none" stroke="#fff" stroke-width="5"/><circle cx="20" cy="20" r="7.8" fill="#0052FF"/></svg>')}`,
  robinhood: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#00C805"/><circle cx="20" cy="20" r="12" fill="none" stroke="#fff" stroke-width="3.5" opacity=".95"/><circle cx="20" cy="20" r="3.2" fill="#fff"/></svg>')}`,
};

// ─────────────────────────────────────────────────────────────────────
// Chain metadata registry
// ─────────────────────────────────────────────────────────────────────
export interface ChainMeta {
  id: ChainId;
  name: string;
  symbol: string;
  chainIdDecimal: number;
  chainIdHex: string;
  explorer: string;
  nativeCurrency: string;
}

export const CHAIN_REGISTRY: Record<ChainId, ChainMeta> = {
  bsc: {
    id: 'bsc', name: 'BNB Chain', symbol: 'BNB',
    chainIdDecimal: 56, chainIdHex: '0x38',
    explorer: 'https://bscscan.com', nativeCurrency: 'BNB',
  },
  solana: {
    id: 'solana', name: 'Solana', symbol: 'SOL',
    chainIdDecimal: 0, chainIdHex: '',
    explorer: 'https://solscan.io', nativeCurrency: 'SOL',
  },
  base: {
    id: 'base', name: 'Base', symbol: 'ETH',
    chainIdDecimal: 8453, chainIdHex: '0x2105',
    explorer: 'https://basescan.org', nativeCurrency: 'ETH',
  },
  robinhood: {
    id: 'robinhood', name: 'Robinhood Chain', symbol: 'ETH',
    chainIdDecimal: 4663, chainIdHex: '0x1237',
    explorer: 'https://explorer.robinhood.com', nativeCurrency: 'ETH',
  },
};

// ─────────────────────────────────────────────────────────────────────
// All-chains composite — inline SVG
// ─────────────────────────────────────────────────────────────────────
function AllChainsSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#0D1117" stroke="#2a3a5c" strokeWidth="1"/>
      <circle cx="14" cy="16" r="5" fill="#F0B90B" opacity="0.9"/>
      <circle cx="26" cy="16" r="5" fill="#14F195" opacity="0.85"/>
      <circle cx="20" cy="27" r="5" fill="#0052FF" opacity="0.9"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single chain logo — tries remote CDN first, falls back to local SVG
// ─────────────────────────────────────────────────────────────────────
function ChainLogoImg({ chainId, size, className, style }: {
  chainId: ChainId; size: number; className?: string; style?: React.CSSProperties;
}) {
  const [src, setSrc] = useState(REMOTE_LOGOS[chainId] ?? FALLBACK_SVG[chainId] ?? '');
  const [triedFallback, setTriedFallback] = useState(false);

  const handleError = useCallback(() => {
    if (!triedFallback) {
      setTriedFallback(true);
      setSrc(FALLBACK_SVG[chainId] ?? '');
    }
  }, [chainId, triedFallback]);

  if (!src) {
    // No logo at all — render initials fallback
    const chain = CHAINS[chainId];
    return (
      <span className={className} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: size * 0.25,
        background: chain?.color ?? '#444', fontSize: size * 0.38, fontWeight: 800,
        color: '#fff', flexShrink: 0, lineHeight: 1, fontFamily: 'var(--font)', ...style,
      }}>
        {chain?.shortName?.slice(0, 2) ?? '?'}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={CHAIN_REGISTRY[chainId]?.name ?? chainId}
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-flex', flexShrink: 0, lineHeight: 0,
        width: size, height: size, objectFit: 'contain',
        borderRadius: size * 0.22, ...style,
      }}
      draggable={false}
      onError={handleError}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function ChainIcon({ chainId, size = 16, className, style }: ChainIconProps) {
  // "All chains" composite
  if (chainId === 'all') {
    return (
      <span className={className} style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0, width: size, height: size, ...style }}>
        <AllChainsSvg size={size} />
      </span>
    );
  }

  return <ChainLogoImg chainId={chainId} size={size} className={className} style={style} />;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
export function getChainMeta(chainId: ChainId): ChainMeta | undefined {
  return CHAIN_REGISTRY[chainId];
}

export function getAllChainsMeta(): ChainMeta[] {
  return Object.values(CHAIN_REGISTRY);
}