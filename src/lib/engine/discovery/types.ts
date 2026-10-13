// Cupcak8 Swap — Discovery Pipeline Types
// Shared interfaces for token index records, discovery adapters, and health tracking.

import type { ChainId } from '../../config';

// ── Token Index Record ──────────────────────────────────────

export interface TokenIndexRecord {
  // Identity (unique: chainId + address)
  chainId: ChainId;
  address: string;            // Normalized token/mint address (lowercase for EVM)

  // Launchpad attribution
  launchpadId: string;        // e.g. 'openlaunch-base', 'pumpfun', 'stonkfun'
  launchpadName: string;      // Display name

  // Creator & launch metadata
  creator: string | null;
  launchTimestamp: number;    // ms epoch
  blockNumber: number | null; // EVM block number
  solanaSlot: number | null;  // Solana slot

  // Source evidence
  sourceTxHash: string;       // EVM tx hash or Solana signature
  sourceLogIndex: number;     // EVM log index (0 for Solana)

  // Discovery tracking
  discoverySource: string;    // e.g. 'eth_getLogs', 'bags_api', 'solana_program'
  discoveryStatus: 'verified' | 'pending' | 'unverified';

  // Market data status (updated by enrichment)
  marketDataStatus: 'awaiting' | 'enriched' | 'no_data' | 'data_only';
  lastEnrichedAt: number | null;
  price: number | null;
  priceSource: 'bonding_curve' | 'dex_pair' | 'none';
  volume24h: number | null;
  liquidity: number | null;
  liquidityType: 'real' | 'virtual' | null;
  marketCap: number | null;

  // Market lifecycle state
  marketState: 'bonding_curve' | 'migrating' | 'launched' | 'inactive' | 'unknown';

  // On-chain metrics (from event indexing)
  tradeCount24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holdersEstimate: number | null;
  bondingCurveProgress: number | null; // 0-100 percent
  // Route verification (Step 8) — independent direction states
  routeVerified: boolean;           // at least one direction verified
  routeProvider: string | null;
  routeDirection: 'buy' | 'sell' | null;
  routeVerifiedAt: number | null;
  routeError: string | null;
  routeBuyVerified: boolean;
  routeSellVerified: boolean;
  routeBothVerified: boolean;       // both buy AND sell directions verified

  // Token metadata (from discovery or enrichment)
  name: string | null;
  symbol: string | null;
  icon: string | null;

  // Bookkeeping
  createdAt: number;
  updatedAt: number;
}

// ── Discovery Adapter Interface ─────────────────────────────

export interface DiscoveryAdapter {
  id: string;
  launchpadId: string;
  launchpadName: string;
  chainId: ChainId;
  method: 'eth_getLogs' | 'solana_program' | 'bags_api' | 'dexscreener_fallback';

  /** Scan for new tokens since the given cursor. Returns new records + updated cursor. */
  scan(cursor: DiscoveryCursor): Promise<DiscoveryScanResult>;

  /** Get adapter health status. */
  getHealth(): AdapterHealth;
}

export interface DiscoveryCursor {
  chainId: ChainId;
  adapterId: string;
  blockNumber: number | null;  // EVM: last processed block
  solanaSlot: number | null;   // Solana: last processed slot
  lastRunAt: number | null;
  lastSuccessAt: number | null;
}

export interface DiscoveryScanResult {
  tokens: Partial<TokenIndexRecord>[];
  cursor: DiscoveryCursor;
  scanned: number;             // blocks/slots scanned
  errors: string[];
}

export interface AdapterHealth {
  adapterId: string;
  status: 'active' | 'delayed' | 'error' | 'not_configured';
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  tokensDiscovered: number;
  cursorPosition: string | null;  // human-readable cursor
  latencyMs: number | null;
}

// ── Market Enrichment ───────────────────────────────────────

export interface EnrichmentResult {
  address: string;
  chainId: ChainId;
  price: number | null;
  volume24h: number | null;
  liquidity: number | null;
  marketCap: number | null;
  name: string | null;
  symbol: string | null;
  icon: string | null;
  source: string;              // which provider enriched this
  enrichedAt: number;
}
