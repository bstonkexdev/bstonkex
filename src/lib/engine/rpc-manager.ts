// BSTONKEX RPC Manager — Multi-chain RPC health, failover, rate limiting
import type { ChainId } from '../config';
import { CHAINS } from '../config';
import { getCredential } from './credential-store';

export interface RpcHealth {
  chainId: ChainId;
  url: string;
  status: 'online' | 'degraded' | 'offline';
  blockNumber: number | null;
  latencyMs: number;
  lastCheck: number;
  error: string | null;
}

type RpcListener = (health: RpcHealth[]) => void;
const healthMap = new Map<ChainId, RpcHealth>();
const listeners: RpcListener[] = [];
let checkTimer: ReturnType<typeof setInterval> | null = null;

export function onRpcHealthChange(cb: RpcListener): () => void {
  listeners.push(cb);
  return () => { listeners.splice(listeners.indexOf(cb), 1); };
}

function emit() { listeners.forEach(l => l(Array.from(healthMap.values()))); }

export function getRpcHealth(chainId: ChainId): RpcHealth | null {
  return healthMap.get(chainId) || null;
}

export function getAllRpcHealth(): RpcHealth[] {
  return Array.from(healthMap.values());
}

/** Get the best RPC URL for a chain (credential override > config default). */
export function getRpcUrl(chainId: ChainId): string {
  // Check credential overrides first
  const credMap: Record<string, string> = {
    bsc: 'BSC_RPC_URL', base: 'BASE_RPC_URL',
    solana: 'SOLANA_RPC_URL', robinhood: 'RH_RPC_PRIMARY',
  };
  const cred = getCredential(credMap[chainId] || '');
  if (cred) return cred;
  return CHAINS[chainId]?.rpcUrl || '';
}

/** Check health of a single chain's RPC. */
export async function checkChainRpc(chainId: ChainId): Promise<RpcHealth> {
  const url = getRpcUrl(chainId);
  const chain = CHAINS[chainId];
  const start = Date.now();
  try {
    const method = chain.isEvm ? 'eth_blockNumber' : 'getSlot';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const latencyMs = Date.now() - start;
    if (data.result) {
      const block = chain.isEvm ? parseInt(data.result, 16) : Number(data.result);
      const health: RpcHealth = { chainId, url, status: latencyMs < 2000 ? 'online' : 'degraded', blockNumber: block, latencyMs, lastCheck: Date.now(), error: null };
      healthMap.set(chainId, health);
      emit();
      return health;
    }
    const health: RpcHealth = { chainId, url, status: 'offline', blockNumber: null, latencyMs, lastCheck: Date.now(), error: data.error?.message || 'No result' };
    healthMap.set(chainId, health);
    emit();
    return health;
  } catch (e: any) {
    const health: RpcHealth = { chainId, url, status: 'offline', blockNumber: null, latencyMs: Date.now() - start, lastCheck: Date.now(), error: e.message };
    healthMap.set(chainId, health);
    emit();
    return health;
  }
}

/** Check all configured chains. Skips Robinhood if no credential configured (public endpoint returns 403). */
export async function checkAllChains(): Promise<RpcHealth[]> {
  const chains: ChainId[] = ['bsc', 'base', 'solana'];
  // Only check Robinhood if a credential override is configured (public Ankr endpoint returns 403)
  const rhCred = getCredential('RH_RPC_PRIMARY');
  if (rhCred) chains.push('robinhood');
  else {
    // Set Robinhood as offline without making a failing request
    healthMap.set('robinhood', {
      chainId: 'robinhood', url: 'https://rpc.ankr.com/robinhood',
      status: 'offline', blockNumber: null, latencyMs: 0, lastCheck: Date.now(),
      error: 'API key required — set RH_RPC_PRIMARY in CREDENTIALS tab',
    });
  }
  const results = await Promise.allSettled(chains.map(c => checkChainRpc(c)));
  return results.filter((r): r is PromiseFulfilledResult<RpcHealth> => r.status === 'fulfilled').map(r => r.value);
}

/** Start periodic health checks. */
export function startRpcMonitoring(intervalMs = 60_000): void {
  if (checkTimer) return;
  checkAllChains();
  checkTimer = setInterval(checkAllChains, intervalMs);
}

export function stopRpcMonitoring(): void {
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
}

// ── Rate Limiter ─────────────────────────────────────────────

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW = 60_000; // 1 minute
const RATE_MAX: Record<string, number> = {
  default: 100,
  dexscreener: 300,
  '1inch': 30,
  jupiter: 100,
};

export function checkRateLimit(service: string): boolean {
  const key = service.toLowerCase();
  const limit = RATE_MAX[key] || RATE_MAX.default;
  const entry = rateLimits.get(key);
  const now = Date.now();
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}