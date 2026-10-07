// BSTONKEX API Gateway — Clean internal API between engines and frontend
// All frontend data requests go through this layer.
// Backed by cache + engine data + pipeline events.

import type { ChainId } from '../config';
import { CHAINS, CONFIGURED_CHAINS } from '../config';
import { cacheGetOrCompute, cacheSet, CACHE_KEYS, TTL } from './cache';
import type { NormalizedTrade, NormalizedPool, NormalizedTokenMeta } from './data-normalizer';
import { subscribeToken, fetchTokenTrades } from './market-pipeline';
import { getCandles, type Candle, type CandleInterval } from './candle-engine';
import { searchTokens, type SearchResult } from './search-engine';
import { getHealthReport, type InfraHealthReport } from './infra-health';
import { getPipelineState, type PipelineState } from './pipeline-orchestrator';

// ── Markets ──────────────────────────────────────────────────

export async function getMarkets(chainId?: ChainId): Promise<NormalizedPool[]> {
  const chains = chainId ? [chainId] : CONFIGURED_CHAINS.map(c => c.id);
  const allPools: NormalizedPool[] = [];
  for (const cid of chains) {
    const cached = await cacheGetOrCompute<NormalizedPool[]>(
      CACHE_KEYS.pairs(cid),
      async () => {
        const chain = CHAINS[cid];
        if (!chain?.dexScreenerId) return [];
        try {
          const resp = await fetch(`https://api.dexscreener.com/token-boosts/top/v1`);
          if (!resp.ok) return [];
          const data = await resp.json();
          return Array.isArray(data) ? data.slice(0, 100).map((p: any) => ({
            chainId: cid,
            address: p.pairAddress || '',
            dex: p.dexId || 'unknown',
            baseToken: { address: p.baseToken?.address || '', symbol: p.baseToken?.symbol || '???' },
            quoteToken: { address: p.quoteToken?.address || '', symbol: p.quoteToken?.symbol || '???' },
            liquidityUsd: p.liquidity?.usd || 0,
            volume24h: p.volume?.h24 || 0,
            priceUsd: parseFloat(p.priceUsd || '0'),
            priceChange24h: p.priceChange?.h24 || 0,
            createdAt: p.pairCreatedAt || Date.now(),
          })) : [];
        } catch { return []; }
      },
      TTL.PRICE,
    );
    if (cached) allPools.push(...cached);
  }
  return allPools;
}

// ── Token Detail ──────────────────────────────────────────────

export async function getToken(chainId: ChainId, address: string): Promise<NormalizedPool[]> {
  return cacheGetOrCompute<NormalizedPool[]>(
    `token:${chainId}:${address}`,
    async () => subscribeToken(chainId, address, ''),
    TTL.PRICE,
  );
}

export async function getTokenCandles(chainId: ChainId, address: string, interval: CandleInterval): Promise<Candle[]> {
  return getCandles(chainId, address, interval);
}

export async function getTokenTrades(chainId: ChainId, pairAddress: string): Promise<NormalizedTrade[]> {
  return fetchTokenTrades(chainId, pairAddress);
}

// ── Search ────────────────────────────────────────────────────

export async function search(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];
  return cacheGetOrCompute(
    CACHE_KEYS.search(query),
    () => searchTokens(query),
    TTL.SEARCH,
  );
}

// ── Health / Pipeline ─────────────────────────────────────────

export function getHealth(): InfraHealthReport {
  return getHealthReport();
}

export function getPipeline(): PipelineState {
  return getPipelineState();
}