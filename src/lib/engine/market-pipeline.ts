// BSTONKEX Market Pipeline — Upgraded market data pipeline
// Integrates: DexScreener polling + blockchain event streaming + candle generation
// Flow: Source → Normalize → Cache → EventBus → Frontend

import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS, DEXSCREENER_API } from '../config';
import { cacheSet, CACHE_KEYS, TTL } from './cache';
import { normalizeDexScreenerTrade, normalizeDexScreenerPool, normalizeDexScreenerToken, type NormalizedTrade, type NormalizedPool, type NormalizedTokenMeta } from './data-normalizer';
import { reportChainRpc, reportChainRpcError, reportMarketDataFreshness, reportError } from './infra-health';
import { processTrade as feedCandleTrade, type TradeEvent } from './candle-engine';

// ── Types ────────────────────────────────────────────────────

export interface MarketSnapshot {
  chainId: ChainId;
  tokens: NormalizedTokenMeta[];
  pools: NormalizedPool[];
  trades: NormalizedTrade[];
  lastUpdate: number;
}

export type MarketEventType = 'price' | 'trade' | 'pool' | 'token' | 'error';

export interface MarketPipelineEvent {
  type: MarketEventType;
  chainId: ChainId;
  data: any;
  timestamp: number;
}

// ── State ────────────────────────────────────────────────────

let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let error: string | null = null;
const POLL_INTERVAL = 30_000; // 30s per chain rotation
let lastPollByChain = new Map<ChainId, number>();
let currentPollChain = 0;

type Listener = (event: MarketPipelineEvent) => void;
let listeners: Listener[] = [];

function emit(event: MarketPipelineEvent) {
  listeners.forEach(l => { try { l(event); } catch {} });
}

// ── DexScreener Fetchers ─────────────────────────────────────

async function fetchDexScreenerTokens(chainId: ChainId): Promise<any[]> {
  const chain = CHAINS[chainId];
  if (!chain?.dexScreenerId) return [];
  try {
    const start = Date.now();
    const resp = await fetch(`${DEXSCREENER_API}/token-profiles/latest/v1`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const latency = Date.now() - start;
    reportChainRpc(chainId, latency);
    return Array.isArray(data) ? data.filter((t: any) => t.chainId === chain.dexScreenerId).slice(0, 50) : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reportChainRpcError(chainId, msg);
    return [];
  }
}

async function fetchDexScreenerPairs(chainId: ChainId, tokenAddress?: string): Promise<any[]> {
  const chain = CHAINS[chainId];
  if (!chain) return [];
  try {
    const url = tokenAddress
      ? `${DEXSCREENER_API}/tokens/v1/${chain.dexScreenerId}/${tokenAddress}`
      : `${DEXSCREENER_API}/token-boosts/top/v1`;
    const start = Date.now();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const latency = Date.now() - start;
    reportChainRpc(chainId, latency);
    return Array.isArray(data) ? data.slice(0, 100) : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reportChainRpcError(chainId, msg);
    return [];
  }
}

async function fetchDexScreenerTrades(chainId: ChainId, pairAddress: string): Promise<any[]> {
  const chain = CHAINS[chainId];
  if (!chain) return [];
  try {
    const url = `${DEXSCREENER_API}/trades/v1/${chain.dexScreenerId}/${pairAddress}`;
    const start = Date.now();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const latency = Date.now() - start;
    reportChainRpc(chainId, latency);
    return Array.isArray(data) ? data.slice(0, 50) : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reportChainRpcError(chainId, msg);
    return [];
  }
}

// ── Pipeline Polling ─────────────────────────────────────────

async function pollChain(chainId: ChainId) {
  try {
    // Fetch top pairs/tokens for this chain
    const pairs = await fetchDexScreenerPairs(chainId);
    const pools = pairs.map(p => normalizeDexScreenerPool(p, chainId)).filter(Boolean) as NormalizedPool[];

    // Emit pool updates
    if (pools.length > 0) {
      emit({ type: 'pool', chainId, data: pools, timestamp: Date.now() });
      // Cache
      cacheSet(CACHE_KEYS.pairs(chainId), pools, TTL.PRICE);
    }

    // Fetch trades for top-volume pairs (limit to top 5 to avoid rate limits)
    const topPairs = pairs
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 5);

    for (const pair of topPairs) {
      if (!pair.pairAddress) continue;
      const rawTrades = await fetchDexScreenerTrades(chainId, pair.pairAddress);
      const trades = rawTrades.map(t => normalizeDexScreenerTrade({ ...t, dex: pair.dexId }, chainId)).filter(Boolean) as NormalizedTrade[];

      if (trades.length > 0) {
        emit({ type: 'trade', chainId, data: trades, timestamp: Date.now() });
        // Feed to candle engine
        for (const t of trades) {
          feedCandleTrade(chainId, t.pair.baseAddress, {
            price: t.priceUsd,
            amountUsd: t.amountUsd,
            timestamp: t.timestamp,
            side: t.side,
          });
        }
      }
    }

    lastPollByChain.set(chainId, Date.now());
    reportMarketDataFreshness(chainId, 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error = msg;
    reportError(`market-pipeline:${chainId}`, msg);
  }
}

function pollNext() {
  if (!running) return;
  const chains = CONFIGURED_CHAINS;
  if (chains.length === 0) return;

  const chainId = chains[currentPollChain % chains.length].id;
  currentPollChain++;
  pollChain(chainId);
}

// ── Public API ────────────────────────────────────────────────

export function startMarketPipeline() {
  if (running) return;
  running = true;
  error = null;
  // Initial poll all chains
  CONFIGURED_CHAINS.forEach(c => pollChain(c.id));
  // Then rotate
  pollTimer = setInterval(pollNext, POLL_INTERVAL / CONFIGURED_CHAINS.length);
}

export function stopMarketPipeline() {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function getMarketPipelineStatus() {
  return {
    running,
    error,
    lastPollByChain: Object.fromEntries(lastPollByChain),
  };
}

export function onMarketPipelineEvent(cb: Listener): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

// ── Token-Specific Pipeline ───────────────────────────────────

export async function subscribeToken(chainId: ChainId, address: string, symbol: string) {
  const pairs = await fetchDexScreenerPairs(chainId, address);
  const normalized = pairs.map(p => normalizeDexScreenerPool(p, chainId)).filter(Boolean) as NormalizedPool[];
  if (normalized.length > 0) {
    emit({ type: 'pool', chainId, data: normalized, timestamp: Date.now() });
    cacheSet(`token:${chainId}:${address}`, normalized, TTL.PRICE);
  }
  return normalized;
}

export async function fetchTokenTrades(chainId: ChainId, pairAddress: string): Promise<NormalizedTrade[]> {
  const raw = await fetchDexScreenerTrades(chainId, pairAddress);
  return raw.map(t => normalizeDexScreenerTrade(t, chainId)).filter(Boolean) as NormalizedTrade[];
}