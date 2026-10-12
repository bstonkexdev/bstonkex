// Cupcak8 Swap — Discovery Pipeline Initializer (Step 4 Rewrite)
//
// EXECUTION MODEL: On-demand, bounded, lock-protected.
// - Does NOT run autonomous background loops per browser session.
// - Registers the discovery pipeline for use by refresh-controller.ts.
// - Frontend triggers discovery via requestRefresh() when user visits market pages.
// - Advisory lock (discovery-lock.ts) ensures one worker across all sessions.
//
// WHY: Running global setIntervals in AppProvider spawns N concurrent workers
// (one per visitor). The Gitlawb Data SDK is shared/persistent, so a lock-based
// on-demand model is correct without requiring a dedicated server process.

import { runDiscoveryCycle } from './discovery-service';
import { enrichPendingTokens } from './market-enrichment';

let registered = false;

/**
 * Register the discovery pipeline (idempotent).
 * Call this once on app mount. Does NOT start any background loops.
 * Use requestRefresh() from refresh-controller.ts to trigger actual scanning.
 */
export function initDiscoveryPipeline(): void {
  if (registered) return;
  registered = true;
  // Pipeline is now available for on-demand triggers via refresh-controller.
  // No timers, no intervals, no autonomous loops.
}

/**
 * Trigger a bounded discovery + enrichment pass.
 * Safe to call from UI event handlers (page navigation, pull-to-refresh, etc.)
 */
export async function triggerDiscoveryPass(): Promise<{
  totalNew: number;
  totalScanned: number;
  errors: string[];
  enriched: number;
  awaiting: number;
}> {
  const disc = await runDiscoveryCycle();
  const enrich = await enrichPendingTokens();
  return {
    totalNew: disc.totalNew,
    totalScanned: disc.totalScanned,
    errors: disc.errors,
    enriched: enrich.enriched,
    awaiting: enrich.awaiting,
  };
}

/** Check if pipeline is registered and ready. */
export function isPipelineReady(): boolean {
  return registered;
}
