// Cupcak8 Swap — Route Verification (Step 14)
// Verifies executable swap routes by requesting REAL quotes from chain providers.
// Tests BOTH buy (native→token) and sell (token→native) directions.
// A token is `execution_verified` ONLY when at least one direction returns a valid quote.
//
// Provider API status:
//   Solana   → Jupiter Swap API v1  GET https://lite-api.jup.ag/swap/v1/quote (free tier)
//              Params: inputMint, outputMint, amount, slippageBps
//              Response: outAmount, routePlan[], priceImpactPct
//              Auth: none (keyless free tier)
//
//   BSC      → 0x Swap API v2  via backend proxy at /api/quote
//              Chain 56 supported by 0x. Auth: ZERO_EX_API_KEY (server-side).
//
//   Base     → 0x Swap API v2  via backend proxy at /api/quote
//              Chain 8453 supported by 0x. Auth: ZERO_EX_API_KEY (server-side).
//
//   Robinhood → NOT supported by 0x Swap API. Chain 4663 returns 501.
import type { ChainId } from '../../config';
import { getQuoteProxyUrl } from '../provider-config';

// ── Result types ────────────────────────────────────────────

export type QuoteDirection = 'buy' | 'sell';

export interface RouteVerificationResult {
  verified: boolean;                // at least one direction succeeded
  bothDirectionsVerified: boolean;  // both buy AND sell succeeded
  chainId: ChainId;
  tokenAddress: string;
  provider: string;
  direction: QuoteDirection | null;
  quoteAmountOut: string | null;
  routeSteps: number;
  error: string | null;
  verifiedAt: number | null;
  latencyMs: number;
  buyVerified: boolean;
  sellVerified: boolean;
  buyError: string | null;
  sellError: string | null;
}

// ── Provider configuration ──────────────────────────────────

// Jupiter Swap API v1 — Quote endpoint
// Official docs: https://dev.jup.ag/docs/api/swap-api
// Free tier:   https://lite-api.jup.ag/swap/v1/quote  (no auth, lower rate limits)
// Keyed tier:  https://api.jup.ag/swap/v1/quote       (requires x-api-key header)
// Params: inputMint, outputMint, amount, slippageBps
// Response: outAmount, routePlan[], priceImpactPct
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1';

// 1inch Swap API v6.0
// Official docs: https://portal.1inch.dev/documentation/apis/swap/introduction
// IMPORTANT: api.1inch.dev requires an API key (Authorization: Bearer <key>).
//   Unauthenticated requests return HTTP 401.
//   For browser use, deploy backend/ proxy with ONEINCH_API_KEY.
const ONEINCH_API = 'https://api.1inch.dev/swap/v6.0';

// Solana native mint (WSOL) — used for Jupiter routing
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// 1inch chain IDs — per official 1inch documentation
const ONEINCH_CHAIN_ID: Record<string, number> = {
  bsc: 56,
  base: 8453,
  robinhood: 4663,
};

// Wrapped native tokens (used as quote counter-asset)
// BSC WBNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c (official BSC contract)
// Base WETH: 0x4200000000000000000000000000000000000006 (official Base contract)
// Robinhood WETH: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 (per 1inch Robinhood docs)
const WRAPPED_NATIVE: Record<string, string> = {
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',     // WBNB (verified)
  base: '0x4200000000000000000000000000000000000006',     // WETH on Base (verified)
  robinhood: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', // WETH on Robinhood (per 1inch docs)
};

// ── Rate limiting ───────────────────────────────────────────

const COOLDOWN_MS = 1500;
let lastCall = 0;

async function rateGate(): Promise<void> {
  const wait = COOLDOWN_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
}

// ── Jupiter quote (Solana) ──────────────────────────────────

interface JupiterQuoteResponse {
  outAmount: string;
  routePlan: Array<{ swapInfo?: { label?: string; ammKey?: string } }>;
  priceImpactPct?: string;
  error?: string;
}

async function jupiterQuote(
  inputMint: string, outputMint: string, amount: string
): Promise<{ success: boolean; outAmount: string | null; routeSteps: number; error: string | null }> {
  const url = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=100`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { success: false, outAmount: null, routeSteps: 0, error: `HTTP ${res.status}: ${body.error || ''}` };
  }

  const data: JupiterQuoteResponse = await res.json();
  if (data.error) {
    return { success: false, outAmount: null, routeSteps: 0, error: data.error };
  }

  const out = data.outAmount;
  const steps = (data.routePlan || []).length;

  if (!out || out === '0' || BigInt(out) <= 0n) {
    return { success: false, outAmount: out || null, routeSteps: steps, error: 'Zero output amount' };
  }

  return { success: true, outAmount: out, routeSteps: steps, error: null };
}

// ── 0x quote (EVM) ──────────────────────────────────────────

interface QuoteResponse {
  dstAmount: string;
  protocols: Array<Array<Array<{ name?: string }>>>;
  description?: string;
  error?: string;
}

async function oneInchQuote(
  chainId: ChainId, srcToken: string, dstToken: string, amount: string
): Promise<{ success: boolean; outAmount: string | null; routeSteps: number; error: string | null }> {
  const oneInchChainId = ONEINCH_CHAIN_ID[chainId];
  if (!oneInchChainId) {
    return { success: false, outAmount: null, routeSteps: 0, error: `Chain ${chainId} not configured for EVM quotes` };
  }

  // SECURITY: EVM quotes MUST go through the backend proxy.
  // Direct browser calls to 0x API are NOT allowed (API key must stay server-side).
  const proxyUrl = getQuoteProxyUrl();
  if (!proxyUrl) {
    return {
      success: false, outAmount: null, routeSteps: 0,
      error: `Backend proxy not configured. Set VITE_WS_URL to enable EVM quotes for ${chainId}. Direct 0x calls from browser are disabled.`,
    };
  }

  const url = `${proxyUrl}?chainId=${oneInchChainId}&src=${srcToken}&dst=${dstToken}&amount=${amount}`;

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Distinguish auth errors from routing errors
    if (isOneInchAuthError(res.status, body)) {
      return {
        success: false, outAmount: null, routeSteps: 0,
        error: `0x API key required (HTTP ${res.status}). Set ZERO_EX_API_KEY in backend environment.`,
      };
    }
    return {
      success: false, outAmount: null, routeSteps: 0,
      error: `HTTP ${res.status}: ${body.description || body.error || ''}`,
    };
  }

  const data: QuoteResponse = await res.json();
  const out = data.dstAmount;
  const protocols = data.protocols || [];
  const steps = protocols.length > 0 ? protocols[0].length : 0;

  if (!out || out === '0' || BigInt(out) <= 0n) {
    return { success: false, outAmount: out || null, routeSteps: steps, error: 'Zero output amount' };
  }

  return { success: true, outAmount: out, routeSteps: steps, error: null };
}

// ── Token decimals lookup ───────────────────────────────────

/** EVM on-chain decimals() read via eth_call. Returns null if unavailable. */
async function getEvmTokenDecimals(rpcUrl: string, tokenAddress: string): Promise<number | null> {
  try {
    const data = '0x313ce567'; // decimals() selector
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: tokenAddress, data }, 'latest'] }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const hex = json?.result;
    if (!hex || hex === '0x') return null;
    const decimals = parseInt(hex, 16);
    if (isNaN(decimals) || decimals < 0 || decimals > 30) return null;
    return decimals;
  } catch { return null; }
}

/** Solana mint decimals via getAccountInfo. Returns null if unavailable. */
async function getSolanaMintDecimals(rpcUrl: string, mintAddress: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [mintAddress, { encoding: 'base64' }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const data = json?.result?.value?.data?.[0];
    if (!data) return null;
    // SPL Mint layout: decimals is at byte offset 44
    const buf = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const decimals = buf[44];
    if (decimals === undefined || decimals > 30) return null;
    return decimals;
  } catch { return null; }
}

// ── Test amounts ────────────────────────────────────────────

function getBuyTestAmount(chainId: ChainId): string {
  // Buy: native → token. Amount in native token raw units.
  if (chainId === 'solana') return '10000000';       // 0.01 SOL (9 decimals)
  return '10000000000000000';                         // 0.01 native (18 decimals)
}

function getSellTestAmount(tokenDecimals: number): string {
  // Sell: token → native. Amount in token raw units = 0.01 token.
  // REQUIRES known decimals. Returns empty string if invalid.
  if (tokenDecimals < 1 || tokenDecimals > 30) return '';
  const exp = Math.max(tokenDecimals - 2, 0);
  return (10n ** BigInt(exp)).toString();
}

// ── Auth error detection ─────────────────────────────────────

function isOneInchAuthError(status: number, body: any): boolean {
  // 0x returns 401 when API key is missing or invalid.
  if (status === 401) return true;
  const msg = (body?.description || body?.error || '').toLowerCase();
  return msg.includes('unauthorized') || msg.includes('api key') || msg.includes('invalid key');
}

// ── Direction-specific verification ─────────────────────────

async function verifyBuyDirection(chainId: ChainId, tokenAddress: string): Promise<{
  success: boolean; outAmount: string | null; routeSteps: number; error: string | null;
}> {
  const amount = getBuyTestAmount(chainId);

  if (chainId === 'solana') {
    // Buy: SOL → token
    return jupiterQuote(SOL_MINT, tokenAddress, amount);
  }

  // EVM: wrappedNative → token
  const wrappedNative = WRAPPED_NATIVE[chainId];
  if (!wrappedNative) {
    return { success: false, outAmount: null, routeSteps: 0, error: `No wrapped native for ${chainId}` };
  }
  return oneInchQuote(chainId, wrappedNative, tokenAddress, amount);
}

async function verifySellDirection(chainId: ChainId, tokenAddress: string, tokenDecimals?: number): Promise<{
  success: boolean; outAmount: string | null; routeSteps: number; error: string | null;
}> {
  // Sell verification REQUIRES known token decimals to compute a correct raw amount.
  // If decimals are unknown, reject with a clear reason (do NOT guess).
  let decimals = tokenDecimals;
  if (decimals === undefined || decimals < 1 || decimals > 30) {
    // Try to fetch decimals from chain
    if (chainId === 'solana') {
      decimals = await getSolanaMintDecimals('https://api.mainnet-beta.solana.com', tokenAddress) ?? undefined;
    } else {
      const rpcUrl = chainId === 'bsc' ? 'https://rpc.ankr.com/bsc'
        : chainId === 'base' ? 'https://rpc.ankr.com/base'
        : 'https://rpc.mainnet.chain.robinhood.com';
      decimals = await getEvmTokenDecimals(rpcUrl, tokenAddress) ?? undefined;
    }
  }

  if (decimals === undefined || decimals < 1 || decimals > 30) {
    return {
      success: false, outAmount: null, routeSteps: 0,
      error: 'Sell verification unavailable: token decimals could not be determined. Cannot compute valid sell amount.',
    };
  }

  const amount = getSellTestAmount(decimals);
  if (!amount) {
    return {
      success: false, outAmount: null, routeSteps: 0,
      error: `Sell verification unavailable: invalid token decimals (${decimals}).`,
    };
  }

  if (chainId === 'solana') {
    // Sell: token → SOL
    return jupiterQuote(tokenAddress, SOL_MINT, amount);
  }

  // EVM: token → wrappedNative
  const wrappedNative = WRAPPED_NATIVE[chainId];
  if (!wrappedNative) {
    return { success: false, outAmount: null, routeSteps: 0, error: `No wrapped native for ${chainId}` };
  }
  return oneInchQuote(chainId, tokenAddress, wrappedNative, amount);
}

// ── Full verification (both directions) ─────────────────────

/**
 * Verify that a token has executable swap routes by requesting REAL quotes.
 * Tests both buy (native→token) and sell (token→native) directions.
 *
 * Returns verified=true when at least ONE direction returns a valid non-zero quote.
 * Records which direction(s) succeeded.
 */
export async function verifyTokenRoute(
  chainId: ChainId,
  tokenAddress: string,
  tokenDecimals?: number
): Promise<RouteVerificationResult> {
  const base = {
    chainId,
    tokenAddress,
    provider: chainId === 'solana' ? 'jupiter' : '0x',
    quoteAmountOut: null,
    routeSteps: 0,
    error: null,
    verifiedAt: null,
    latencyMs: 0,
    buyVerified: false,
    sellVerified: false,
    bothDirectionsVerified: false,
    buyError: null,
    sellError: null,
  };

  if (!tokenAddress || tokenAddress === 'native') {
    return { ...base, verified: false, direction: null, error: 'Invalid token address' };
  }

  const address = chainId === 'solana' ? tokenAddress : tokenAddress.toLowerCase();
  const start = Date.now();

  // Verify BUY direction: native → token
  await rateGate();
  const buyResult = await verifyBuyDirection(chainId, address).catch(e => ({
    success: false, outAmount: null, routeSteps: 0, error: `Buy quote failed: ${e.message}`,
  }));

  // Verify SELL direction: token → native
  await rateGate();
  const sellResult = await verifySellDirection(chainId, address, tokenDecimals).catch(e => ({
    success: false, outAmount: null, routeSteps: 0, error: `Sell quote failed: ${e.message}`,
  }));

  const latencyMs = Date.now() - start;
  const buyOk = buyResult.success;
  const sellOk = sellResult.success;
  const anyOk = buyOk || sellOk;

  // Determine which direction to report as the primary
  let direction: QuoteDirection | null = null;
  let primaryOut: string | null = null;
  let primarySteps = 0;

  if (buyOk) {
    direction = 'buy';
    primaryOut = buyResult.outAmount;
    primarySteps = buyResult.routeSteps;
  } else if (sellOk) {
    direction = 'sell';
    primaryOut = sellResult.outAmount;
    primarySteps = sellResult.routeSteps;
  }

  // Build error message from failed directions
  const errors: string[] = [];
  if (!buyOk && buyResult.error) errors.push(`Buy: ${buyResult.error}`);
  if (!sellOk && sellResult.error) errors.push(`Sell: ${sellResult.error}`);

  return {
    verified: anyOk,
    bothDirectionsVerified: buyOk && sellOk,
    chainId,
    tokenAddress: address,
    provider: chainId === 'solana' ? 'jupiter' : '0x',
    direction,
    quoteAmountOut: primaryOut,
    routeSteps: primarySteps,
    error: anyOk ? null : errors.join('; ') || 'Both directions failed',
    verifiedAt: anyOk ? Date.now() : null,
    latencyMs,
    buyVerified: buyOk,
    sellVerified: sellOk,
    buyError: buyOk ? null : buyResult.error || 'Buy quote failed',
    sellError: sellOk ? null : sellResult.error || 'Sell quote failed',
  };
}

// ── Batch verification ──────────────────────────────────────

export async function verifyTokenRoutes(
  tokens: Array<{ chainId: ChainId; address: string }>,
  maxBatch: number = 5
): Promise<Map<string, RouteVerificationResult>> {
  const results = new Map<string, RouteVerificationResult>();
  for (const token of tokens.slice(0, maxBatch)) {
    const result = await verifyTokenRoute(token.chainId, token.address);
    results.set(`${token.chainId}:${token.address.toLowerCase()}`, result);
  }
  return results;
}

// ── Provider support matrix ─────────────────────────────────

export function getProviderSupportMatrix(): Array<{
  chainId: ChainId;
  provider: string;
  supported: boolean;
  apiKeyRequired: boolean;
  authMethod: string;
  reason?: string;
}> {
  return [
    { chainId: 'solana', provider: 'jupiter-v6', supported: true, apiKeyRequired: false, authMethod: 'None (keyless free tier)' },
    { chainId: 'bsc', provider: '0x-swap-v2', supported: true, apiKeyRequired: true, authMethod: 'ZERO_EX_API_KEY via backend proxy' },
    { chainId: 'base', provider: '0x-swap-v2', supported: true, apiKeyRequired: true, authMethod: 'ZERO_EX_API_KEY via backend proxy' },
    { chainId: 'robinhood', provider: 'none', supported: false, apiKeyRequired: false, authMethod: 'Not supported by 0x' },
  ];
}

/** Get wrapped native token for a chain. */
export function getWrappedNative(chainId: ChainId): string | null {
  return WRAPPED_NATIVE[chainId] ?? null;
}

/** Check if chain has a verified quote provider. */
export function hasVerifiedQuoteProvider(chainId: ChainId): boolean {
  return chainId in ONEINCH_CHAIN_ID || chainId === 'solana';
}
