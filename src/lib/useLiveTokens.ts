// Cupcak8 Swap — useLiveTokens Hook
// React hook for consuming the real-time token broadcast layer.
// Provides live token list, new token events, and bonding curve progress updates.
//
// Usage:
//   const { tokens, newTokens, nearGraduation } = useLiveTokens();
//   const { tokens } = useLiveTokens({ sortBy: 'progress' });

import { useState, useEffect, useRef } from 'react';
import {
  subscribeTokenList,
  subscribeNewToken,
  subscribeTradeUpdate,
  getNearGraduation,
  initLiveTokenBroadcast,
  loadInitialTokens,
  type LiveToken,
} from './engine/discovery/live-tokens';

export interface UseLiveTokensOptions {
  /** Sort order: 'newest' (default) or 'progress' */
  sortBy?: 'newest' | 'progress';
  /** Only show tokens near graduation (≥80% progress) */
  nearGraduationOnly?: boolean;
  /** Max tokens to return */
  limit?: number;
}

export interface UseLiveTokensResult {
  /** Token list (sorted per options) */
  tokens: LiveToken[];
  /** Tokens with bonding curve progress ≥ 80% */
  nearGraduation: LiveToken[];
  /** Latest new token event (flips on each new launch) */
  latestNewToken: LiveToken | null;
  /** Total tokens tracked */
  count: number;
  /** Whether initial data has loaded */
  isLoading: boolean;
}

export function useLiveTokens(options: UseLiveTokensOptions = {}): UseLiveTokensResult {
  const { sortBy = 'newest', nearGraduationOnly = false, limit = 50 } = options;

  const [allTokens, setAllTokens] = useState<LiveToken[]>([]);
  const [latestNewToken, setLatestNewToken] = useState<LiveToken | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Initialize the broadcast layer (idempotent)
    initLiveTokenBroadcast();

    // Subscribe to list updates
    const unsubList = subscribeTokenList((tokens) => {
      if (mountedRef.current) {
        setAllTokens(tokens);
        setIsLoading(false);
      }
    });

    // Subscribe to new token events
    const unsubNew = subscribeNewToken((token) => {
      if (mountedRef.current) {
        setLatestNewToken(token);
      }
    });

    // Load initial batch from token index
    loadInitialTokens().then(() => {
      if (mountedRef.current) setIsLoading(false);
    });

    return () => {
      mountedRef.current = false;
      unsubList();
      unsubNew();
    };
  }, []);

  // Compute derived lists
  const filtered = nearGraduationOnly
    ? allTokens.filter(t => t.bondingCurveProgress >= 80)
    : allTokens;

  const sorted = sortBy === 'progress'
    ? [...filtered].sort((a, b) => b.bondingCurveProgress - a.bondingCurveProgress)
    : [...filtered].sort((a, b) => b.createdAt - a.createdAt);

  const tokens = sorted.slice(0, limit);
  const nearGraduation = getNearGraduation();

  return {
    tokens,
    nearGraduation,
    latestNewToken,
    count: allTokens.length,
    isLoading,
  };
}

/**
 * Hook for real-time bonding curve progress updates.
 * Re-renders on every trade event for the specified mint.
 */
export function useBondingCurveProgress(mint: string | null): {
  progress: number;
  price: number;
  lastUpdate: number;
} {
  const [state, setState] = useState({ progress: 0, price: 0, lastUpdate: 0 });

  useEffect(() => {
    if (!mint) return;

    const unsub = subscribeTradeUpdate((updatedMint, progress, price) => {
      if (updatedMint === mint) {
        setState({ progress, price, lastUpdate: Date.now() });
      }
    });

    return unsub;
  }, [mint]);

  return state;
}

/**
 * Hook for subscribing to individual new token events (NEW_LAUNCHPAD_TOKEN).
 * Callback fires on every new launch in real-time.
 */
export function useOnNewToken(callback: (token: LiveToken) => void): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    return subscribeNewToken((token) => {
      try { cbRef.current(token); } catch { /* */ }
    });
  }, []);
}
