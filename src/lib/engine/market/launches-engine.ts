// Cupcak8 Swap — Launches Engine
// Reads launches from the backend /api/v1/market/launches endpoint.
// No browser-side scanning — all discovery runs in the backend discovery-worker.
// The engine polls the backend and emits updates to subscribed React components.

import type { LaunchToken, LaunchFilter, LaunchSort } from './types';
import { DEFAULT_FILTER } from './types';

// ── In-memory token store ─────────────────────────────────────

const tokenMap = new Map<string, LaunchToken>();
const listeners = new Set<(tokens: LaunchToken[]) => void>();
const MAX_TOKENS = 2000;
let isInitialized = false;

function tokenKey(chainId: string, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

// ── Backend URL ─────────────────────────────────────────────

const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || 'https://api.bstonkex.xyz';

// ── Initialization ────────────────────────────────────────────
// Reads launches from the backend /api/v1/market/launches endpoint.
// No browser-side scanning — all discovery runs in the backend discovery-worker.

export async function initLaunchesEngine(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  // Load initial launches from the backend
  await fetchLaunchesFromBackend();

  // Poll backend every 15 seconds for new launches
  setInterval(fetchLaunchesFromBackend, 15_000);
}

let fetchConsecutiveErrors = 0;

async function fetchLaunchesFromBackend(): Promise<void> {
  const url = `${BACKEND_URL}/api/v1/market/launches?limit=100`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[launches-engine] HTTP ${resp.status} from ${url}: ${body.slice(0, 200)}`);
      fetchConsecutiveErrors++;
      return;
    }
    const data = await resp.json() as any;
    const launches = data.launches || [];

    if (fetchConsecutiveErrors > 0) {
      console.info(`[launches-engine] Recovered after ${fetchConsecutiveErrors} errors. Got ${launches.length} launches.`);
      fetchConsecutiveErrors = 0;
    }

    for (const row of launches) {
      const key = tokenKey(row.chain || 'solana', row.token);
      if (!tokenMap.has(key)) {
        tokenMap.set(key, {
          chainId: row.chain || 'solana',
          address: row.token,
          name: row.name || 'Unknown',
          symbol: row.symbol || '???',
          logo: row.image || null,
          launchpadId: row.launchpad || 'unknown',
          launchpadName: row.launchpad || 'unknown',
          factoryId: '',
          creator: row.creator || '',
          createdAt: row.earliest_seen ? new Date(row.earliest_seen).getTime() : Date.now(),
          price: row.spot_price || null,
          priceUsd: row.spot_price || null,
          marketCap: null,
          fdv: null,
          liquidity: row.liquidity || null,
          change5m: null,
          change1h: null,
          change24h: null,
          volume5m: null,
          volume1h: null,
          volume24h: row.volume_24h || null,
          txns24h: null,
          buys24h: null,
          sells24h: null,
          holders: row.holders || null,
          bondingCurveProgress: row.bonding_curve_progress || null,
          devHoldingPct: null,
          top10Pct: null,
          riskLevel: null,
          marketState: 'unknown' as const,
          website: null,
          twitter: null,
          telegram: null,
          sourceTxHash: row.first_tx_hash || '',
          discoverySource: (row.sources || []).join(','),
        });
      }
    }

    trimStore();
    emit();
  } catch (e: any) {
    fetchConsecutiveErrors++;
    if (fetchConsecutiveErrors <= 3) {
      console.error(`[launches-engine] Fetch failed (${fetchConsecutiveErrors}): ${e.message} | url=${url}`);
    }
  }
}

// pollNewAdapters removed — all scanning now runs in the backend discovery-worker.
// The LaunchesTab reads from /api/v1/market/launches via fetchLaunchesFromBackend().

function trimStore(): void {
  if (tokenMap.size <= MAX_TOKENS) return;
  // Remove oldest tokens
  const sorted = Array.from(tokenMap.entries())
    .sort((a, b) => b[1].createdAt - a[1].createdAt);
  tokenMap.clear();
  for (const [key, val] of sorted.slice(0, MAX_TOKENS)) {
    tokenMap.set(key, val);
  }
}

// ── Query API ─────────────────────────────────────────────────

export function getLaunches(
  filter: LaunchFilter = DEFAULT_FILTER,
  sort: LaunchSort = { field: 'createdAt', direction: 'desc' },
  offset = 0,
  limit = 50,
): { tokens: LaunchToken[]; total: number } {
  let tokens = Array.from(tokenMap.values());

  // Apply filters
  if (filter.chains.length > 0) {
    tokens = tokens.filter(t => filter.chains.includes(t.chainId));
  }
  if (filter.launchpads.length > 0) {
    tokens = tokens.filter(t => filter.launchpads.includes(t.launchpadId));
  }
  if (filter.ageMaxHours != null) {
    const cutoff = Date.now() - filter.ageMaxHours * 3600_000;
    tokens = tokens.filter(t => t.createdAt >= cutoff);
  }
  if (filter.mcapMin != null) {
    tokens = tokens.filter(t => t.marketCap != null && t.marketCap >= filter.mcapMin!);
  }
  if (filter.mcapMax != null) {
    tokens = tokens.filter(t => t.marketCap != null && t.marketCap <= filter.mcapMax!);
  }
  if (filter.liquidityMin != null) {
    tokens = tokens.filter(t => t.liquidity != null && t.liquidity >= filter.liquidityMin!);
  }
  if (filter.volumeMin != null) {
    tokens = tokens.filter(t => t.volume24h != null && t.volume24h >= filter.volumeMin!);
  }
  if (filter.holdersMin != null) {
    tokens = tokens.filter(t => t.holders != null && t.holders >= filter.holdersMin!);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    tokens = tokens.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  }

  // Sort
  tokens.sort((a, b) => {
    const av = getSortValue(a, sort.field);
    const bv = getSortValue(b, sort.field);
    const dir = sort.direction === 'asc' ? 1 : -1;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });

  const total = tokens.length;
  return { tokens: tokens.slice(offset, offset + limit), total };
}

function getSortValue(t: LaunchToken, field: LaunchSort['field']): number | null {
  switch (field) {
    case 'createdAt': return t.createdAt;
    case 'price': return t.price;
    case 'marketCap': return t.marketCap;
    case 'volume24h': return t.volume24h;
    case 'change24h': return t.change24h;
    case 'holders': return t.holders;
    case 'liquidity': return t.liquidity;
    case 'txns24h': return t.txns24h;
    default: return null;
  }
}

export function getTokenCount(): number {
  return tokenMap.size;
}

// ── Subscription ──────────────────────────────────────────────

export function onLaunchesUpdate(cb: (tokens: LaunchToken[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(): void {
  const sorted = Array.from(tokenMap.values())
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const cb of listeners) {
    try { cb(sorted); } catch { /* listener error */ }
  }
}

// ── Single token lookup ───────────────────────────────────────

export function getLaunchToken(chainId: string, address: string): LaunchToken | null {
  return tokenMap.get(tokenKey(chainId, address)) || null;
}