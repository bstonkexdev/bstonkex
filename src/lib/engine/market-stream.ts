// BSTONKEX Market Stream — Unified real-time market event bus
// Polls DexScreener for real data. Emits price/trade/volume events.
// Connects to WebSocket when available. Dedup by event ID. Sequence tracking.

import { DEXSCREENER_API, type ChainId } from '../config';
import { isSandboxed } from './sandbox';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import { wsManager, type WsState } from './realtime-ws';

// ── Event Types ──────────────────────────────────────────────

export type MarketEventType = 'price' | 'trade' | 'volume' | 'liquidity' | 'stats';

export interface MarketStreamEvent {
  id: string;
  type: MarketEventType;
  chainId: ChainId;
  tokenAddress: string;
  tokenSymbol: string;
  timestamp: number;
  sequence: number;
  data: Record<string, any>;
}

// ── State ────────────────────────────────────────────────────

type Listener = (event: MarketStreamEvent) => void;
let listeners: Listener[] = [];
let streamState: WsState = 'disconnected';
let sequence = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTime = 0;
const processedIds = new Set<string>();
const MAX_PROCESSED = 500;

// Track active subscriptions for polling
const activeTokens = new Map<string, { chainId: ChainId; address: string; symbol: string }>();

// ── Public API ───────────────────────────────────────────────

export function onMarketEvent(cb: Listener): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

export function getStreamState(): WsState { return streamState; }
export function getStreamLatency(): number { return wsManager.getLatency(); }
export function getLastPollTime(): number { return lastPollTime; }

/** Subscribe to real-time updates for a specific token. */
export function subscribeToken(chainId: ChainId, address: string, symbol: string): () => void {
  const key = `${chainId}:${address}`;
  activeTokens.set(key, { chainId, address, symbol });

  // Ensure polling is active
  if (!pollTimer) startPolling(15000);

  return () => {
    activeTokens.delete(key);
    if (activeTokens.size === 0) stopPolling();
  };
}

// ── Event Bus ────────────────────────────────────────────────

function emit(event: MarketStreamEvent): void {
  if (processedIds.has(event.id)) return; // Dedup
  processedIds.add(event.id);
  if (processedIds.size > MAX_PROCESSED) {
    const arr = [...processedIds];
    for (let i = 0; i < 100; i++) processedIds.delete(arr[i]);
  }
  listeners.forEach(l => l(event));
}

// ── Data Source Tracking ─────────────────────────────────────

/** Whether real-time data comes from WebSocket (LIVE) or polling (DELAYED). */
let dataSource: 'ws' | 'polling' = 'polling';
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_OFFLINE = 3;

export function getDataSource(): 'ws' | 'polling' { return dataSource; }
export function isLiveData(): boolean { return dataSource === 'ws' && streamState === 'connected'; }

/** Get human-readable freshness status. */
export function getDataFreshness(): 'LIVE' | 'DELAYED' | 'RECONNECTING' | 'OFFLINE' {
  if (streamState === 'disconnected') return 'OFFLINE';
  if (streamState === 'reconnecting') return 'RECONNECTING';
  if (dataSource === 'ws' && streamState === 'connected') return 'LIVE';
  // Polling provides real data but not instantaneous — show DELAYED
  if (streamState === 'connected' || streamState === 'degraded') return 'DELAYED';
  return 'RECONNECTING';
}

// ── Polling Engine ───────────────────────────────────────────

function startPolling(intervalMs: number): void {
  if (pollTimer) return;
  streamState = 'connecting';
  pollTimer = setInterval(pollMarketData, intervalMs);
  pollMarketData(); // Immediate first poll
}

function stopPolling(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  streamState = 'disconnected';
  consecutiveFailures = 0;
}

async function pollMarketData(): Promise<void> {
  if (isSandboxed() || activeTokens.size === 0) return;

  const tokens = [...activeTokens.values()];
  if (tokens.length === 0) return;

  try {
    // Batch fetch — get data for all active tokens
    const results = await Promise.allSettled(
      tokens.map(async (t) => {
        const cacheKey = `rt:${t.chainId}:${t.address}`;
        return cacheGetOrCompute(cacheKey, async () => {
          const res = await fetch(`${DEXSCREENER_API}/latest/dex/tokens/${t.address}`);
          if (!res.ok) return null;
          const data = await res.json();
          return data.pairs?.[0] || null;
        }, TTL.PRICE);
      })
    );

    const now = Date.now();
    lastPollTime = now;
    consecutiveFailures = 0;
    // Only set to 'connected' if not already connected via WS
    if (streamState !== 'connected' || dataSource !== 'ws') {
      streamState = 'connected';
      dataSource = 'polling'; // Polling provides real DexScreener data — not instantaneous but genuine
    }

    for (let i = 0; i < tokens.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const pair = result.value;
      const token = tokens[i];
      const price = pair.priceUsd ? parseFloat(pair.priceUsd) : null;
      const change = pair.priceChange?.h24 != null ? parseFloat(pair.priceChange.h24) : null;
      const volume = pair.volume?.h24 || null;
      const liquidity = pair.liquidity?.usd || null;
      const txns = pair.txns?.h24 || {};

      // Emit price event
      if (price != null) {
        emit({
          id: `price:${token.chainId}:${token.address}:${now}`,
          type: 'price',
          chainId: token.chainId,
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          timestamp: now,
          sequence: ++sequence,
          data: { price, change24h: change, volume24h: volume, liquidity },
        });
      }

      // Emit volume event
      if (volume != null) {
        emit({
          id: `vol:${token.chainId}:${token.address}:${now}`,
          type: 'volume',
          chainId: token.chainId,
          tokenAddress: token.address,
          tokenSymbol: token.symbol,
          timestamp: now,
          sequence: ++sequence,
          data: { volume24h: volume, buys24h: txns.buys, sells24h: txns.sells },
        });
      }

      // Emit stats event
      emit({
        id: `stats:${token.chainId}:${token.address}:${now}`,
        type: 'stats',
        chainId: token.chainId,
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        timestamp: now,
        sequence: ++sequence,
        data: {
          price, change24h: change, volume24h: volume, liquidity,
          marketCap: pair.marketCap ?? pair.fdv ?? null,
          fdv: pair.fdv ?? null,
          buys24h: txns.buys, sells24h: txns.sells,
          txns24h: (txns.buys ?? 0) + (txns.sells ?? 0),
          dexId: pair.dexId, pairAddress: pair.pairAddress,
        },
      });
    }
  } catch {
    consecutiveFailures++;
    streamState = consecutiveFailures >= MAX_FAILURES_BEFORE_OFFLINE ? 'disconnected' : 'degraded';
  }
}

// ── WebSocket Integration ────────────────────────────────────

// Listen for WS state changes
wsManager.onStateChange((state, latency) => {
  if (state === 'connected') {
    dataSource = 'ws';
    streamState = 'connected';
    consecutiveFailures = 0;
    // Subscribe to all active tokens via WS
    activeTokens.forEach((token) => {
      wsManager.subscribe(`token:${token.chainId}:${token.address}`, (msg) => {
        // WS events processed here when backend is deployed
        // Polling continues as fallback for real DexScreener data
      });
    });
  } else if (state === 'reconnecting') {
    streamState = 'reconnecting';
    dataSource = 'polling'; // Fall back to polling during WS reconnect
  } else if (state === 'degraded') {
    streamState = 'degraded';
    dataSource = 'polling';
  } else if (state === 'disconnected') {
    dataSource = 'polling';
    // Don't override streamState — polling may still be active
  }
});

// ── Helpers ──────────────────────────────────────────────────

export function formatStreamLatency(): string {
  const lat = wsManager.getLatency();
  if (lat === 0) return '';
  if (lat < 1000) return `${lat}ms`;
  return `${(lat / 1000).toFixed(1)}s`;
}