// Cupcak8 Swap — useTrenches Hook
// React hook exposing tab-filtered real-time token lists from the trenches feed.

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { TrenchesToken, TrenchesTab, SecurityFlags } from './engine/trenches-types';
import { computePhase } from './engine/trenches-types';

// In-memory token store (fed by PumpPortal + BSC listeners)
const tokenMap = new Map<string, TrenchesToken>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** Push a token into the store (called by PumpPortal/BSC event handlers). */
export function ingestToken(token: TrenchesToken): void {
  tokenMap.set(token.address, token);
  notify();
}

/** Update bonding curve progress + price for a token. */
export function updateTokenPrice(address: string, spotPriceUsd: number, bondingCurveProgress: number): void {
  const token = tokenMap.get(address);
  if (!token) return;
  token.spotPriceUsd = spotPriceUsd;
  token.bondingCurveProgress = bondingCurveProgress;
  token.phase = computePhase(bondingCurveProgress);
  notify();
}

/** Update security flags for a token. */
export function updateTokenSecurity(address: string, security: SecurityFlags): void {
  const token = tokenMap.get(address);
  if (!token) return;
  token.security = security;
  notify();
}

/** Get all tokens. */
export function getAllTrenchesTokens(): TrenchesToken[] {
  return [...tokenMap.values()].sort((a, b) => b.createdAt - a.createdAt);
}

// ── React Hook ──────────────────────────────────────────────

export function useTrenches(tab: TrenchesTab) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const tokens = useMemo((): TrenchesToken[] => {
    const all = getAllTrenchesTokens();
    switch (tab) {
      case 'launchpads': return all.filter(t => t.phase === 'inner');
      case 'migrating': return all.filter(t => t.phase === 'migrating');
      case 'graduated': return all.filter(t => t.phase === 'graduated');
      default: return all;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tick]);

  const stats = useMemo(() => {
    const all = getAllTrenchesTokens();
    return {
      total: all.length,
      inner: all.filter(t => t.phase === 'inner').length,
      migrating: all.filter(t => t.phase === 'migrating').length,
      graduated: all.filter(t => t.phase === 'graduated').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { tokens, stats };
}

/** Quick-buy state management. */
export function useQuickBuy() {
  const [selectedToken, setSelectedToken] = useState<TrenchesToken | null>(null);
  const [amount, setAmount] = useState('0.1');
  const [slippage, setSlippage] = useState(1.0);
  const [priorityLevel, setPriorityLevel] = useState<'low' | 'medium' | 'high' | 'max'>('medium');

  const open = useCallback((token: TrenchesToken) => setSelectedToken(token), []);
  const close = useCallback(() => setSelectedToken(null), []);

  return {
    selectedToken, amount, slippage, priorityLevel,
    setAmount, setSlippage, setPriorityLevel, open, close,
  };
}
