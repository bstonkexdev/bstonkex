// Cupcak8 Swap — Discovery Refresh Controller
// SAFE entry point for triggering discovery + enrichment from the frontend.
// - Rate-limited (minimum interval between runs)
// - Lock-protected (one worker at a time across all sessions)
// - Bounded (single cycle, not a persistent loop)
// - Observable (returns status for UI health panels)
//
// The frontend calls requestRefresh() when the user visits Markets/Launchpad pages.
// This is NOT a background loop — it is an on-demand, bounded scan.
import { runDiscoveryCycle } from './discovery-service';
import { enrichPendingTokens } from './market-enrichment';
import { acquireLock, releaseLock, isLocked, getLockInfo } from './discovery-lock';

const MIN_REFRESH_INTERVAL_MS = 45_000; // Minimum 45s between discovery cycles per session

let lastRefreshAt = 0;
let isRefreshing = false;

export interface RefreshStatus {
  didRun: boolean;
  skipped: boolean;
  reason?: string;
  discovery?: { totalNew: number; totalScanned: number; errors: string[] };
  enrichment?: { enriched: number; awaiting: number };
  durationMs: number;
}

/**
 * Request a discovery + enrichment refresh.
 * Safe to call frequently — respects rate limits and locking.
 */
export async function requestRefresh(): Promise<RefreshStatus> {
  // Rate limit: don't run more than once per MIN_REFRESH_INTERVAL_MS
  const now = Date.now();
  if (now - lastRefreshAt < MIN_REFRESH_INTERVAL_MS) {
    return {
      didRun: false, skipped: true,
      reason: `Rate limited — next refresh in ${Math.ceil((MIN_REFRESH_INTERVAL_MS - (now - lastRefreshAt)) / 1000)}s`,
      durationMs: 0,
    };
  }

  // Concurrency: if we're already refreshing, skip
  if (isRefreshing) {
    return { didRun: false, skipped: true, reason: 'Already refreshing', durationMs: 0 };
  }

  // Cross-session lock
  const locked = await acquireLock();
  if (!locked) {
    return { didRun: false, skipped: true, reason: 'Another session is running discovery', durationMs: 0 };
  }

  isRefreshing = true;
  const start = Date.now();

  try {
    // Run discovery cycle
    const discResult = await runDiscoveryCycle();

    // Run enrichment cycle
    const enrichResult = await enrichPendingTokens();

    lastRefreshAt = Date.now();

    return {
      didRun: true,
      skipped: false,
      discovery: { totalNew: discResult.totalNew, totalScanned: discResult.totalScanned, errors: discResult.errors },
      enrichment: { enriched: enrichResult.enriched, awaiting: enrichResult.awaiting },
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      didRun: true, skipped: false,
      discovery: { totalNew: 0, totalScanned: 0, errors: [`Refresh failed: ${e.message}`] },
      durationMs: Date.now() - start,
    };
  } finally {
    isRefreshing = false;
    await releaseLock();
  }
}

/** Check if a refresh is currently in progress (in this session). */
export function isRefreshInProgress(): boolean {
  return isRefreshing;
}

/** Get when the next refresh will be allowed. */
export function getNextRefreshTime(): number {
  return lastRefreshAt + MIN_REFRESH_INTERVAL_MS;
}

/** Get lock status for health display. */
export async function getRefreshLockStatus(): Promise<{ locked: boolean; holder: string | null }> {
  const info = await getLockInfo();
  return {
    locked: await isLocked(),
    holder: info?.lockedBy ?? null,
  };
}

/** Force reset rate limiter (for admin/testing). */
export function resetRefreshRateLimit(): void {
  lastRefreshAt = 0;
}
