// Cupcak8 Swap — SOL/USD Price Feed
// Uses Pyth Hermes public API (no authentication required).
// Includes staleness protection — returns null if price is too old.
// Reference: https://hermes.pyth.com/docs/
// SOL/USD price feed ID: ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d

const PYTH_HERMES_URL = 'https://hermes.pyth.com/v2/updates/price/latest';
// SOL/USD price feed ID (hex, 32 bytes)
const SOL_USD_FEED_ID = 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

// Max age before price is considered stale (5 minutes)
const MAX_PRICE_AGE_MS = 5 * 60 * 1000;

// Cache to avoid hammering the API
const CACHE_TTL_MS = 30_000; // 30 seconds

interface PriceCache {
  price: number;
  confidence: number;
  publishTime: number; // Unix seconds from Pyth
  fetchedAt: number;   // Local timestamp
}

let cache: PriceCache | null = null;

export interface SolPriceResult {
  /** SOL price in USD, or null if unavailable/stale */
  priceUsd: number | null;
  /** Confidence interval (±) in USD */
  confidenceUsd: number | null;
  /** Pyth publish time (Unix seconds) */
  publishTime: number | null;
  /** Whether the price is considered fresh (< 5 min old) */
  isFresh: boolean;
  /** Error message if fetch failed */
  error: string | null;
}

/**
 * Fetch current SOL/USD price from Pyth Hermes.
 * Returns null price if the API is unreachable or the data is stale.
 */
export async function getSolUsdPrice(): Promise<SolPriceResult> {
  const now = Date.now();

  // Return cached if fresh
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    const isFresh = now - cache.publishTime * 1000 < MAX_PRICE_AGE_MS;
    return {
      priceUsd: isFresh ? cache.price : null,
      confidenceUsd: cache.confidence,
      publishTime: cache.publishTime,
      isFresh,
      error: isFresh ? null : 'Price data is stale (>5 min old)',
    };
  }

  try {
    const url = `${PYTH_HERMES_URL}?ids[]=${SOL_USD_FEED_ID}`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' },
    });

    if (!resp.ok) {
      return {
        priceUsd: cache?.price ?? null,
        confidenceUsd: cache?.confidence ?? null,
        publishTime: cache?.publishTime ?? null,
        isFresh: false,
        error: `Pyth API error: HTTP ${resp.status}`,
      };
    }

    const data = await resp.json();
    const parsed = data?.parsed?.[0];

    if (!parsed?.price) {
      return {
        priceUsd: null, confidenceUsd: null, publishTime: null,
        isFresh: false, error: 'Invalid Pyth response format',
      };
    }

    // Pyth returns price as integer with expo (exponent)
    const priceInt = BigInt(parsed.price.price);
    const expo = parsed.price.expo; // e.g., -8
    const confInt = BigInt(parsed.price.conf);
    const publishTime = parsed.price.publish_time; // Unix seconds

    // Convert to decimal: price * 10^expo
    const priceUsd = Number(priceInt) * Math.pow(10, expo);
    const confidenceUsd = Number(confInt) * Math.pow(10, expo);

    // Validate
    if (!isFinite(priceUsd) || priceUsd <= 0) {
      return {
        priceUsd: null, confidenceUsd: null, publishTime,
        isFresh: false, error: 'Pyth returned invalid price value',
      };
    }

    const isFresh = now - publishTime * 1000 < MAX_PRICE_AGE_MS;

    cache = { price: priceUsd, confidence: confidenceUsd, publishTime, fetchedAt: now };

    return {
      priceUsd: isFresh ? priceUsd : null,
      confidenceUsd,
      publishTime,
      isFresh,
      error: isFresh ? null : 'Price data is stale (>5 min old)',
    };
  } catch (e: any) {
    return {
      priceUsd: cache?.price ?? null,
      confidenceUsd: cache?.confidence ?? null,
      publishTime: cache?.publishTime ?? null,
      isFresh: false,
      error: `Pyth fetch failed: ${e.message}`,
    };
  }
}

/**
 * Convert a SOL amount to USD.
 * Returns null if no fresh SOL/USD price is available.
 */
export async function solToUsd(solAmount: number): Promise<number | null> {
  const result = await getSolUsdPrice();
  if (result.priceUsd === null) return null;
  return solAmount * result.priceUsd;
}

/**
 * Convert a USD amount to SOL.
 * Returns null if no fresh SOL/USD price is available.
 */
export async function usdToSol(usdAmount: number): Promise<number | null> {
  const result = await getSolUsdPrice();
  if (result.priceUsd === null || result.priceUsd <= 0) return null;
  return usdAmount / result.priceUsd;
}

/**
 * Get the current SOL/USD price, or null if unavailable.
 * Convenience wrapper for synchronous-looking code.
 */
export async function getSolUsdPriceOrNull(): Promise<number | null> {
  const result = await getSolUsdPrice();
  return result.isFresh ? result.priceUsd : null;
}

/** Clear the price cache (for testing) */
export function clearSolPriceCache(): void {
  cache = null;
}