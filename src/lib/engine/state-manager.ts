// BSTONKEX State Manager — Separated state domains with selective subscriptions
// Prevents unnecessary rerenders: wallet update does NOT rerender Markets page.
// Domains: market, trade, portfolio, wallet, activity, notification, health

import { useCallback, useSyncExternalStore } from 'react';

// ── Domain Definitions ───────────────────────────────────────

interface DomainState<T> {
  data: T;
  lastUpdate: number;
  loading: boolean;
  error: string | null;
}

type DomainKey = 'market' | 'trade' | 'portfolio' | 'wallet' | 'activity' | 'notification' | 'health';

const domains = new Map<DomainKey, DomainState<any>>();
const listeners = new Map<DomainKey, Set<() => void>>();

function getDomain<T>(key: DomainKey): DomainState<T> {
  if (!domains.has(key)) {
    domains.set(key, { data: null, lastUpdate: 0, loading: false, error: null });
    listeners.set(key, new Set());
  }
  return domains.get(key)!;
}

function notify(key: DomainKey) {
  listeners.get(key)?.forEach(fn => fn());
}

// ── Public API ────────────────────────────────────────────────

export function setDomainData<T>(key: DomainKey, data: T) {
  const domain = getDomain<T>(key);
  domain.data = data;
  domain.lastUpdate = Date.now();
  domain.loading = false;
  domain.error = null;
  notify(key);
}

export function setDomainLoading(key: DomainKey, loading: boolean) {
  const domain = getDomain(key);
  domain.loading = loading;
  notify(key);
}

export function setDomainError(key: DomainKey, error: string) {
  const domain = getDomain(key);
  domain.error = error;
  domain.loading = false;
  notify(key);
}

export function getDomainSnapshot<T>(key: DomainKey): DomainState<T> {
  return { ...getDomain<T>(key) };
}

// ── React Hook ────────────────────────────────────────────────

export function useDomain<T>(key: DomainKey): DomainState<T> {
  const subscribe = useCallback((cb: () => void) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(cb);
    return () => { listeners.get(key)?.delete(cb); };
  }, [key]);

  const getSnapshot = useCallback(() => getDomain<T>(key), [key]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}