// BSTONKEX Price Engine — Real-time price management from blockchain data
import type { ChainId } from '../config';
import { CHAINS } from '../config';
import { getChainAdapter, getAllAdapters } from './chain-registry';
import { cacheGetOrCompute, cacheInvalidatePrefix, CACHE_KEYS, TTL } from './cache';
import { isSandboxed } from './sandbox';
import type { PriceUpdate } from './types';

// ── Price Storage ────────────────────────────────────────────
const prices = new Map<string, PriceUpdate>();
let priceListeners: ((update: PriceUpdate) => void)[] = [];
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function onPriceUpdate(cb: (update: PriceUpdate) => void): () => void {
  priceListeners.push(cb);
  return () => { priceListeners = priceListeners.filter(l => l !== cb); };
}

function emitPrice(update: PriceUpdate) {
  const key = `${update.chainId}:${update.address}`;
  prices.set(key, update);
  priceListeners.forEach(l => l(update));
}

/** Get cached price for a token. */
export function getCachedPrice(chainId: ChainId, address: string): PriceUpdate | null {
  return prices.get(`${chainId}:${address}`) || null;
}

/** Get native token price for a chain. */
export async function getNativePrice(chainId: ChainId): Promise<number> {
  const adapter = getChainAdapter(chainId);
  if (!adapter) return 0;
  return adapter.getNativePriceUsd();
}

/** Get all native prices. */
export async function getAllNativePrices(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const adapters = getAllAdapters();
  await Promise.allSettled(adapters.map(async (a) => {
    result[a.chainId] = await a.getNativePriceUsd();
  }));
  return result;
}

/** Fetch price for a specific token and emit update. */
export async function fetchTokenPrice(chainId: ChainId, address: string): Promise<number | null> {
  const adapter = getChainAdapter(chainId);
  if (!adapter) return null;
  const price = await adapter.getTokenPriceUsd(address);
  if (price !== null) {
    emitPrice({
      chainId,
      address,
      price,
      change24h: null, // Would need historical data
      volume24h: null,
      marketCap: null,
      timestamp: Date.now(),
    });
  }
  return price;
}

/** Start background price polling for tracked tokens. */
const trackedTokens = new Set<string>();

export function trackToken(chainId: ChainId, address: string): void {
  trackedTokens.add(`${chainId}:${address}`);
  // Immediately fetch price
  fetchTokenPrice(chainId, address).catch(() => {});
}

export function untrackToken(chainId: ChainId, address: string): void {
  trackedTokens.delete(`${chainId}:${address}`);
}

/** Start polling. Call once on app init. Skipped in sandboxed preview. */
export function startPricePolling(intervalMs = 30_000): void {
  if (pollingInterval) return;
  if (isSandboxed()) return; // External APIs blocked in preview
  pollingInterval = setInterval(async () => {
    // Poll native prices
    const adapters = getAllAdapters();
    await Promise.allSettled(adapters.map(async (a) => {
      try {
        const price = await a.getNativePriceUsd();
        emitPrice({
          chainId: a.chainId,
          address: 'native',
          price,
          change24h: null,
          volume24h: null,
          marketCap: null,
          timestamp: Date.now(),
        });
      } catch { /* skip */ }
    }));

    // Poll tracked token prices
    for (const key of trackedTokens) {
      const [chainId, address] = key.split(':');
      fetchTokenPrice(chainId as ChainId, address).catch(() => {});
    }
  }, intervalMs);
}

/** Stop polling. */
export function stopPricePolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/** Invalidate all cached prices (e.g. on chain switch). */
export function invalidatePrices(): void {
  cacheInvalidatePrefix('price:');
}