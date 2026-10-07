// BSTONKEX System Health — Monitors all services
import { getAllAdapters } from './chain-registry';
import { cacheGetOrCompute, cacheStats, CACHE_KEYS, TTL } from './cache';
import { isSandboxed } from './sandbox';
import type { HealthStatus } from './types';

// ── External API Health (skipped in sandbox) ─────────────────

function offlineStatus(service: string): HealthStatus {
  return { service, status: 'offline', latencyMs: 0, lastCheck: Date.now(), error: 'Network unavailable in preview' };
}

async function checkUrl(service: string, url: string): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return {
      service,
      status: res.ok ? 'online' : 'degraded',
      latencyMs: Date.now() - start,
      lastCheck: Date.now(),
    };
  } catch {
    return { service, status: 'offline', latencyMs: Date.now() - start, lastCheck: Date.now(), error: 'unreachable' };
  }
}

// ── Full System Health ───────────────────────────────────────

export async function getSystemHealth(): Promise<HealthStatus[]> {
  return cacheGetOrCompute(CACHE_KEYS.health, async () => {
    const sandbox = isSandboxed();
    const results: HealthStatus[] = [];

    if (sandbox) {
      // In preview sandbox — external network is blocked, report all as offline
      results.push(offlineStatus('DexScreener API'));
      results.push(offlineStatus('GeckoTerminal API'));
      results.push(offlineStatus('Jupiter (Solana)'));
      results.push(offlineStatus('BNB RPC'));
      results.push(offlineStatus('Base RPC'));
      results.push(offlineStatus('Solana RPC'));
      results.push(offlineStatus('Robinhood RPC'));
    } else {
      // Production — check real endpoints
      const adapters = getAllAdapters();
      const chainHealth = await Promise.allSettled(adapters.map(a => a.healthCheck()));
      for (const r of chainHealth) {
        if (r.status === 'fulfilled') results.push(r.value);
      }

      const [dex, gecko, jup] = await Promise.allSettled([
        checkUrl('DexScreener API', 'https://api.dexscreener.com/latest/dex/search?q=PEPE'),
        checkUrl('GeckoTerminal API', 'https://api.geckoterminal.com/api/v2/networks'),
        checkUrl('Jupiter (Solana)', 'https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=50'),
      ]);
      if (dex.status === 'fulfilled') results.push(dex.value);
      if (gecko.status === 'fulfilled') results.push(gecko.value);
      if (jup.status === 'fulfilled') results.push(jup.value);
    }

    // Cache stats (always available)
    const cs = cacheStats();
    results.push({
      service: 'Cache',
      status: cs.hitRate > 0.5 ? 'online' : cs.hitRate > 0.2 ? 'degraded' : 'online',
      latencyMs: 0,
      lastCheck: Date.now(),
    });

    return results;
  }, TTL.HEALTH);
}