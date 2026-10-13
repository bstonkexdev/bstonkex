// Cupcak8 Swap — Real-Time Token Broadcast Layer
// Browser-side equivalent of Socket.io broadcast — pushes new tokens to all
// subscribed React components instantly via the PumpPortal WebSocket stream.
//
// Pattern (adapts the Socket.io concept to browser-only architecture):
//   1. INITIAL_TRENCHES_LOAD → initial batch from token index on mount
//   2. NEW_LAUNCHPAD_TOKEN → live push from PumpPortal WS on each creation
//   3. Trade events update bonding curve progress in real-time
//
// No external server needed — the PumpPortal WS IS the event source,
// and React state IS the broadcast mechanism.

import { onTokenCreate, getLivePrice } from './pumpportal-stream';
import type { TokenIndexRecord } from './types';

// ── Live Token Store ─────────────────────────────────────────

export interface LiveToken {
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  bondingCurveKey: string;
  virtualSol: number;
  virtualTokens: number;
  spotPrice: number;        // USD price
  bondingCurveProgress: number; // 0-100%
  createdAt: number;
  source: 'pumpportal' | 'index';
}

// In-memory store (sorted by creation time, newest first)
const tokenStore = new Map<string, LiveToken>();
const listeners = new Set<(tokens: LiveToken[]) => void>();
const singleListeners = new Set<(token: LiveToken) => void>();

// Trade event listeners (for live price updates)
const tradeListeners = new Set<(mint: string, progress: number, price: number) => void>();

const MAX_STORE = 500;

// ── Public API ───────────────────────────────────────────────

/**
 * Subscribe to the full token list (INITIAL_TRENCHES_LOAD + live updates).
 * Returns an unsubscribe function.
 */
export function subscribeTokenList(callback: (tokens: LiveToken[]) => void): () => void {
  listeners.add(callback);
  // Immediately send current state (equivalent to INITIAL_TRENCHES_LOAD)
  callback(getCurrentTokens());
  return () => { listeners.delete(callback); };
}

/**
 * Subscribe to individual new token events (NEW_LAUNCHPAD_TOKEN).
 * Returns an unsubscribe function.
 */
export function subscribeNewToken(callback: (token: LiveToken) => void): () => void {
  singleListeners.add(callback);
  return () => { singleListeners.delete(callback); };
}

/**
 * Subscribe to bonding curve progress updates (trade events).
 * Returns an unsubscribe function.
 */
export function subscribeTradeUpdate(callback: (mint: string, progress: number, price: number) => void): () => void {
  tradeListeners.add(callback);
  return () => { tradeListeners.delete(callback); };
}

/** Get current token list (newest first). */
export function getCurrentTokens(): LiveToken[] {
  return [...tokenStore.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Get tokens sorted by bonding curve progress (highest first). */
export function getTokensByProgress(): LiveToken[] {
  return [...tokenStore.values()].sort((a, b) => b.bondingCurveProgress - a.bondingCurveProgress);
}

/** Get tokens near graduation (≥80% bonding curve progress). */
export function getNearGraduation(): LiveToken[] {
  return getTokensByProgress().filter(t => t.bondingCurveProgress >= 80);
}

/** Get a single token by mint. */
export function getTokenByMint(mint: string): LiveToken | undefined {
  return tokenStore.get(mint);
}

/** Get total tokens tracked. */
export function getTokenCount(): number {
  return tokenStore.size;
}

// ── Event Handling ───────────────────────────────────────────

function handleNewToken(record: TokenIndexRecord): void {
  const liveToken: LiveToken = {
    mint: record.address,
    name: record.name || 'Unknown',
    symbol: record.symbol || '???',
    creator: record.creator || '',
    bondingCurveKey: (record.sourceTxHash || '').replace('pumpportal:', ''),
    virtualSol: (record.liquidity || 0) / 200, // approximate from USD liquidity
    virtualTokens: 1e9,
    spotPrice: record.price || 0,
    bondingCurveProgress: record.bondingCurveProgress ?? 0,
    createdAt: record.createdAt || Date.now(),
    source: 'pumpportal',
  };

  // Add to store (evict oldest if full)
  tokenStore.set(liveToken.mint, liveToken);
  if (tokenStore.size > MAX_STORE) {
    const oldest = [...tokenStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest) tokenStore.delete(oldest[0]);
  }

  // Broadcast to all listeners (equivalent to io.emit('NEW_LAUNCHPAD_TOKEN'))
  for (const listener of singleListeners) {
    try { listener(liveToken); } catch { /* listener error */ }
  }
  broadcastList();
}

function broadcastList(): void {
  const tokens = getCurrentTokens();
  for (const listener of listeners) {
    try { listener(tokens); } catch { /* listener error */ }
  }
}

// ── Initialization ───────────────────────────────────────────

let initialized = false;

/**
 * Initialize the real-time token broadcast layer.
 * Connects to the PumpPortal WebSocket stream and broadcasts events to UI.
 * Call once on app mount.
 */
export function initLiveTokenBroadcast(): void {
  if (initialized) return;
  initialized = true;

  // Subscribe to PumpPortal new token events
  onTokenCreate(handleNewToken);

  // Periodically check for trade updates to broadcast progress changes
  setInterval(() => {
    let hasUpdates = false;
    for (const [mint, token] of tokenStore.entries()) {
      const live = getLivePrice(mint);
      if (live && live.lastTradeAt > token.createdAt) {
        token.bondingCurveProgress = live.bondingCurveProgress;
        token.spotPrice = live.spotPrice;
        hasUpdates = true;

        // Notify trade listeners
        for (const tl of tradeListeners) {
          try { tl(mint, live.bondingCurveProgress, live.spotPrice); } catch { /* */ }
        }
      }
    }
    if (hasUpdates) broadcastList();
  }, 2000); // Check every 2 seconds
}

/**
 * Load initial tokens from the token index (INITIAL_TRENCHES_LOAD).
 * Call after initLiveTokenBroadcast() to populate the UI.
 */
export async function loadInitialTokens(): Promise<LiveToken[]> {
  try {
    const { listIndexedTokens } = await import('../token-index');
    const indexed = await listIndexedTokens({ limit: 50 });

    for (const record of indexed) {
      if (tokenStore.has(record.address)) continue;

      const liveToken: LiveToken = {
        mint: record.address,
        name: record.name || 'Unknown',
        symbol: record.symbol || '???',
        creator: record.creator || '',
        bondingCurveKey: (record.sourceTxHash || '').replace('pumpportal:', ''),
        virtualSol: (record.liquidity || 0) / 200,
        virtualTokens: 1e9,
        spotPrice: record.price || 0,
        bondingCurveProgress: record.bondingCurveProgress ?? 0,
        createdAt: record.createdAt || record.launchTimestamp,
        source: 'index',
      };
      tokenStore.set(record.address, liveToken);
    }

    broadcastList();
    return getCurrentTokens();
  } catch {
    return [];
  }
}
