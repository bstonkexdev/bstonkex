// Cupcak8 Swap — On-Chain Metrics
// Calculates trade counts, volume, holders from event indexing.
// Only reports metrics when indexing coverage is sufficient.

// ── Metrics Types ──────────────────────────────────────────

export interface OnChainMetrics {
  /** Trade counts (24h window) */
  tradeCount24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  /** Volume (24h) */
  volumeSol24h: number | null;
  volumeUsd24h: number | null;
  /** Price history */
  priceChange1h: number | null;
  priceChange24h: number | null;
  /** Holder estimates */
  holdersEstimate: number | null;
  /** Fee totals (24h) — from verified TradeEvent fee fields */
  feesSol24h: number | null;
  /** Data quality indicators */
  indexingCoverage: number; // 0-1, how much of the token's history is indexed
  isReliable: boolean;
}

export interface TradeEvent {
  timestamp: number;
  signature: string;
  slot: number;
  mint: string;
  isBuy: boolean;
  solAmount: number; // SOL (not lamports)
  tokenAmount: number;
  priceUsd: number | null;
  blockTime: number | null;
  /** Verified fee fields from Pump.fun TradeEvent (null when unknown) */
  feeBasisPoints?: number | null;
  feeSol?: number | null;
  creatorFeeBasisPoints?: number | null;
}

// ── In-Memory Trade Cache ──────────────────────────────────

const tradeCache = new Map<string, TradeEvent[]>();
const maxTradesPerToken = 1000;
const metricsCache = new Map<string, { metrics: OnChainMetrics; computedAt: number }>();
const METRICS_TTL = 60_000; // 1 minute

/** Record a trade event */
export function recordTradeEvent(event: TradeEvent): void {
  const key = event.mint;
  const trades = tradeCache.get(key) || [];
  trades.push(event);

  // Keep only recent trades (limit by count)
  if (trades.length > maxTradesPerToken) {
    trades.splice(0, trades.length - maxTradesPerToken);
  }

  tradeCache.set(key, trades);
  metricsCache.delete(key); // Invalidate metrics cache
}

/** Record multiple trades */
export function recordTradeEvents(events: TradeEvent[]): void {
  for (const event of events) recordTradeEvent(event);
}

/**
 * Record a Pump.fun stream event (structural typing — no coupling to pumpfun-ws).
 * Only buy/sell events with complete trade data are recorded.
 * Duplicate signatures are ignored by recordTradeEvent's cache invalidation idempotence
 * (the stream layer dedupes before calling).
 */
export function recordPumpFunTrade(e: {
  type: string;
  signature: string;
  slot: number;
  timestamp: number;
  mint: string;
  isBuy: boolean | null;
  solAmount: number | null;
  tokenAmount: number | null;
  feeBasisPoints?: number | null;
  feeSol?: number | null;
  creatorFeeBasisPoints?: number | null;
}): void {
  if (e.type !== 'buy' && e.type !== 'sell') return;
  if (e.isBuy == null || e.solAmount == null || e.tokenAmount == null) return;
  // Skip trades that are not SOL-denominated (e.g. quote-mint curves, post-complete
  // PumpSwap trades carry amounts in quote_amount, not sol_amount). Recording them
  // as 0-SOL volume would silently misreport volume — verified live at slot 456298163
  // where a TradeEvent had solAmount=0 with fee=0.2998 in the quote asset.
  if (e.solAmount <= 0) return;
  recordTradeEvent({
    timestamp: e.timestamp,
    signature: e.signature,
    slot: e.slot,
    mint: e.mint,
    isBuy: e.isBuy,
    solAmount: e.solAmount,
    tokenAmount: e.tokenAmount,
    priceUsd: null,
    blockTime: null,
    feeBasisPoints: e.feeBasisPoints ?? null,
    feeSol: e.feeSol ?? null,
    creatorFeeBasisPoints: e.creatorFeeBasisPoints ?? null,
  });
}

/** Get trades for a token */
export function getTrades(mint: string): TradeEvent[] {
  return tradeCache.get(mint) || [];
}

// ── Metrics Calculation ────────────────────────────────────

/** Calculate on-chain metrics for a token */
export function calculateMetrics(mint: string): OnChainMetrics {
  // Check cache
  const cached = metricsCache.get(mint);
  if (cached && Date.now() - cached.computedAt < METRICS_TTL) {
    return cached.metrics;
  }

  const trades = tradeCache.get(mint) || [];
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const h1 = now - 60 * 60 * 1000;

  if (trades.length === 0) {
    return {
      tradeCount24h: 0,
      buys24h: 0,
      sells24h: 0,
      volumeSol24h: 0,
      volumeUsd24h: 0,
      priceChange1h: null,
      priceChange24h: null,
      holdersEstimate: null,
      feesSol24h: 0,
      indexingCoverage: 0,
      isReliable: false,
    };
  }

  // Filter by time windows
  const trades24h = trades.filter(t => t.timestamp >= h24);
  const trades1h = trades.filter(t => t.timestamp >= h1);

  // Count trades
  const buys24h = trades24h.filter(t => t.isBuy).length;
  const sells24h = trades24h.filter(t => !t.isBuy).length;

  // Calculate volume
  const volumeSol24h = trades24h.reduce((sum, t) => sum + t.solAmount, 0);
  const volumeUsd24h = trades24h.reduce((sum, t) => sum + (t.priceUsd !== null ? t.solAmount * t.priceUsd : 0), 0);

  // Price change calculation
  let priceChange1h: number | null = null;
  let priceChange24h: number | null = null;

  if (trades1h.length >= 2) {
    const oldest = trades1h[0];
    const newest = trades1h[trades1h.length - 1];
    if (oldest.priceUsd && newest.priceUsd && oldest.priceUsd > 0) {
      priceChange1h = ((newest.priceUsd - oldest.priceUsd) / oldest.priceUsd) * 100;
    }
  }

  if (trades24h.length >= 2) {
    const oldest = trades24h[0];
    const newest = trades24h[trades24h.length - 1];
    if (oldest.priceUsd && newest.priceUsd && oldest.priceUsd > 0) {
      priceChange24h = ((newest.priceUsd - oldest.priceUsd) / oldest.priceUsd) * 100;
    }
  }

  // Indexing coverage estimate
  // If we have trades spanning >24h, we have good coverage
  const oldestTrade = trades[0];
  const coverage = oldestTrade ? Math.min(1, (now - oldestTrade.timestamp) / (24 * 60 * 60 * 1000)) : 0;

  // Reliability: need minimum trades and coverage
  const isReliable = trades24h.length >= 5 && coverage >= 0.5;

  // Fees from verified TradeEvent fields — null when no trade carries fee data
  const tradesWithFee = trades24h.filter(t => t.feeSol != null);
  const feesSol24h = tradesWithFee.length > 0
    ? tradesWithFee.reduce((sum, t) => sum + (t.feeSol ?? 0), 0)
    : null;

  const metrics: OnChainMetrics = {
    tradeCount24h: trades24h.length,
    buys24h,
    sells24h,
    volumeSol24h: isReliable ? volumeSol24h : null,
    volumeUsd24h: isReliable ? volumeUsd24h : null,
    priceChange1h: isReliable ? priceChange1h : null,
    priceChange24h: isReliable ? priceChange24h : null,
    holdersEstimate: null, // Would need token account indexing
    feesSol24h: isReliable ? feesSol24h : null,
    indexingCoverage: coverage,
    isReliable,
  };

  metricsCache.set(mint, { metrics, computedAt: Date.now() });
  return metrics;
}

/** Get volume in native asset (SOL for Solana tokens) */
export function getVolumeNative(mint: string): number | null {
  const metrics = calculateMetrics(mint);
  return metrics.volumeSol24h;
}

/** Get volume in USD */
export function getVolumeUsd(mint: string): number | null {
  const metrics = calculateMetrics(mint);
  return metrics.volumeUsd24h;
}

/** Get trade counts */
export function getTradeCounts(mint: string): { total: number; buys: number; sells: number } | null {
  const metrics = calculateMetrics(mint);
  if (!metrics.isReliable) return null;
  return {
    total: metrics.tradeCount24h || 0,
    buys: metrics.buys24h || 0,
    sells: metrics.sells24h || 0,
  };
}

// ── Holder Estimation (Stub) ───────────────────────────────

/**
 * Estimate holder count from token account state.
 * NOTE: Complete holder count requires indexing all token accounts.
 * This is a stub that returns null until we implement full token account scanning.
 */
export async function estimateHolders(_mint: string): Promise<number | null> {
  // Would:
  // 1. GetProgramAccounts for SPL Token program filtered by mint
  // 2. Count unique token accounts with non-zero balance
  // 3. Group by owner to get unique holders
  //
  // This is NOT implemented — returns null to avoid fabricating data.
  return null;
}

// ── Price History ──────────────────────────────────────────

export interface PricePoint {
  timestamp: number;
  priceUsd: number;
}

/** Get price history for charting */
export function getPriceHistory(mint: string, windowMs: number = 24 * 60 * 60 * 1000): PricePoint[] {
  const trades = tradeCache.get(mint) || [];
  const now = Date.now();
  const cutoff = now - windowMs;

  return trades
    .filter(t => t.timestamp >= cutoff && t.priceUsd !== null)
    .map(t => ({ timestamp: t.timestamp, priceUsd: t.priceUsd! }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ── Clear Cache (for testing) ──────────────────────────────

export function clearMetricsCache(): void {
  tradeCache.clear();
  metricsCache.clear();
}