// Cupcak8 Swap — PumpPortal Real-Time Token Creation Stream
// WebSocket connection to PumpPortal's real-time Pump.fun event stream.
// Captures EVERY new token creation instantly (no polling, no RPC latency).
//
// Endpoint: wss://pumpportal.fun/api/data
// Methods: subscribeNewToken (creates), subscribeTokenTrade (buy/sell)
//
// This is the primary real-time discovery source — replaces polling adapters
// for Pump.fun new token detection. Other adapters handle non-Pump.fun DEXes.

import { indexToken } from '../token-index';
import type { TokenIndexRecord } from './types';

const WS_URL = 'wss://pumpportal.fun/api/data';
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;

interface PumpPortalCreateEvent {
  txType: 'create';
  mint: string;
  name: string;
  symbol: string;
  traderPublicKey: string;      // creator
  bondingCurveKey: string;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  solAmount?: number;
  tokenAmount?: number;
  initialBuy?: number;
  uri?: string;
  timestamp?: number;
}

interface PumpPortalTradeEvent {
  txType: 'buy' | 'sell';
  mint: string;
  symbol: string;
  name: string;
  traderPublicKey: string;
  solAmount: number;
  tokenAmount: number;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  bondingCurveKey: string;
  timestamp?: number;
}

type PumpPortalEvent = PumpPortalCreateEvent | PumpPortalTradeEvent;

// ── Stream State ─────────────────────────────────────────────

let ws: WebSocket | null = null;
let isRunning = false;
let reconnectDelay = RECONNECT_DELAY_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Dedup within session
const seenMints = new Set<string>();
const MAX_SEEN = 10000;

// Live price cache for bonding curve tokens (updated by trade events)
const livePrices = new Map<string, {
  sol: number;
  tokens: number;
  spotPrice: number;
  lastTradeAt: number;
  lastTradeType: 'buy' | 'sell';
  bondingCurveProgress: number;
}>();

// Bonding curve graduation threshold (Pump.fun migrates at ~85 SOL virtual reserves)
const BONDING_CURVE_SOL_THRESHOLD = 85;

// In-memory sorted views (replaces Redis sorted sets)
// Sorted by creation time (newest first)
const newestTokens: string[] = [];
const MAX_NEWEST = 500;
// Sorted by bonding curve progress (highest first)
const bondingProgress = new Map<string, number>(); // mint → progress%

// Stats for health display
let stats = {
  connected: false,
  createdAt: 0,
  tokensCreated: 0,
  tradesProcessed: 0,
  lastCreateAt: 0,
  lastTradeAt: 0,
  reconnects: 0,
  lastError: null as string | null,
};

// Event callbacks for UI
type CreateListener = (token: TokenIndexRecord) => void;
const createListeners = new Set<CreateListener>();

// ── Public API ───────────────────────────────────────────────

/** Subscribe to real-time new token creation events. */
export function onTokenCreate(listener: CreateListener): () => void {
  createListeners.add(listener);
  return () => createListeners.delete(listener);
}

/** Get live bonding curve price for a token (updated by trade events). */
export function getLivePrice(mint: string): { spotPrice: number; lastTradeAt: number; bondingCurveProgress: number } | null {
  const entry = livePrices.get(mint);
  if (!entry) return null;
  return { spotPrice: entry.spotPrice, lastTradeAt: entry.lastTradeAt, bondingCurveProgress: entry.bondingCurveProgress };
}

/** Get newest token mint addresses (newest first). */
export function getNewestTokenMints(limit = 20): string[] {
  return newestTokens.slice(0, limit);
}

/** Get tokens sorted by bonding curve progress (highest first). */
export function getTopBondingProgressMints(limit = 20): { mint: string; progress: number }[] {
  return [...bondingProgress.entries()]
    .map(([mint, progress]) => ({ mint, progress }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit);
}

/** Get tokens close to graduation (bonding curve progress ≥ threshold%). */
export function getNearGraduationMints(minProgress = 80, limit = 20): { mint: string; progress: number }[] {
  return [...bondingProgress.entries()]
    .map(([mint, progress]) => ({ mint, progress }))
    .filter(t => t.progress >= minProgress)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit);
}

/** Get stream health stats. */
export function getStreamStats() {
  return { ...stats };
}

/** Check if the stream is connected. */
export function isStreamConnected(): boolean {
  return stats.connected;
}

// ── Core Stream Logic ────────────────────────────────────────

function calcBondingProgress(virtualSol: number): number {
  return Math.min(100, Math.round((virtualSol / BONDING_CURVE_SOL_THRESHOLD) * 100 * 100) / 100);
}

function buildTokenRecord(event: PumpPortalCreateEvent): TokenIndexRecord {
  const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
  const solUsd = _solUsd;
  const progress = calcBondingProgress(event.vSolInBondingCurve);

  return {
    chainId: 'solana',
    address: event.mint,
    launchpadId: 'pumpfun',
    launchpadName: 'Pump.fun',
    creator: event.traderPublicKey,
    launchTimestamp: event.timestamp ?? Date.now(),
    blockNumber: null,
    solanaSlot: null,
    sourceTxHash: `pumpportal:${event.bondingCurveKey}`,
    sourceLogIndex: 0,
    discoverySource: 'pumpportal_websocket',
    discoveryStatus: 'verified',
    marketDataStatus: 'enriched',
    lastEnrichedAt: Date.now(),
    // Bonding curve state = immediate price (no external enrichment needed)
    price: spotPrice * solUsd,
    priceSource: 'bonding_curve',
    volume24h: null,
    liquidity: event.vSolInBondingCurve * solUsd,
    liquidityType: 'virtual',
    marketCap: spotPrice * 1e9 * solUsd,
    marketState: 'bonding_curve',
    tradeCount24h: 1,
    buys24h: 1,
    sells24h: 0,
    holdersEstimate: null,
    bondingCurveProgress: progress,
    routeVerified: false,
    routeVerifiedAt: null,
    routeProvider: null,
    routeDirection: null,
    routeError: null,
    routeBuyVerified: false,
    routeSellVerified: false,
    routeBothVerified: false,
    name: event.name || null,
    symbol: event.symbol || null,
    icon: null, // Resolved async from metadataUri — don't store JSON URI as icon
    websites: null,
    socials: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as TokenIndexRecord;
}

// SOL/USD price — cached from enrichment or fallback
let _solUsd = 200; // fallback until sol-price module provides real value

// ── Async Metadata Resolution (IPFS → image URL) ─────────────
const IPFS_GATEWAYS = [
  'https://cf-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
];

function extractIpfsHash(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', '').replace(/^ipfs\//, '');
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function gatewayUrls(uri: string): string[] {
  const hash = extractIpfsHash(uri);
  if (!hash) return [uri];
  return IPFS_GATEWAYS.map(gw => gw + hash);
}

/**
 * Fetch token metadata JSON from URI (with gateway rotation),
 * extract the image URL, and notify listeners with the resolved icon.
 */
async function resolveTokenMetadata(mint: string, metadataUri: string, baseRecord: TokenIndexRecord): Promise<void> {
  try {
    const urls = gatewayUrls(metadataUri);
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const meta = await res.json();
        const rawImage = meta.image || meta.image_uri || meta.image_url || '';
        if (!rawImage) return;

        // Convert ipfs:// image URLs to HTTPS gateway URLs
        const imgHash = extractIpfsHash(rawImage);
        const imageUrl = imgHash ? IPFS_GATEWAYS[0] + imgHash : rawImage;

        // Build updated record and notify listeners
        const socials: { platform: string; url: string }[] = [];
        const tw = meta.twitter || meta.extensions?.twitter || '';
        const tg = meta.telegram || meta.extensions?.telegram || '';
        if (tw) socials.push({ platform: 'twitter', url: tw });
        if (tg) socials.push({ platform: 'telegram', url: tg });

        const updated: TokenIndexRecord = {
          ...baseRecord,
          icon: imageUrl,
          websites: meta.website || meta.extensions?.website || null,
          socials: socials.length ? socials : null,
          updatedAt: Date.now(),
        };

        for (const listener of createListeners) {
          try { listener(updated); } catch { /* listener error */ }
        }
        return; // Success — stop trying gateways
      } catch { /* try next gateway */ }
    }
  } catch { /* metadata resolution is best-effort */ }
}

function handleMessage(data: string): void {
  try {
    const event: PumpPortalEvent = JSON.parse(data);

    if (event.txType === 'create') {
      // Dedup within session
      if (seenMints.has(event.mint)) return;
      seenMints.add(event.mint);

      // Evict old entries
      if (seenMints.size > MAX_SEEN) {
        const iter = seenMints.values();
        for (let i = 0; i < 1000; i++) {
          const { value, done } = iter.next();
          if (done) break;
          seenMints.delete(value);
        }
      }

      // Update live price cache
      const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
      const progress = calcBondingProgress(event.vSolInBondingCurve);
      livePrices.set(event.mint, {
        sol: event.vSolInBondingCurve,
        tokens: event.vTokensInBondingCurve,
        spotPrice,
        lastTradeAt: Date.now(),
        lastTradeType: 'buy',
        bondingCurveProgress: progress,
      });

      // Maintain sorted views (replaces Redis sorted sets)
      newestTokens.unshift(event.mint); // newest first
      if (newestTokens.length > MAX_NEWEST) newestTokens.length = MAX_NEWEST;
      bondingProgress.set(event.mint, progress);

      // Build token record and persist asynchronously (non-blocking)
      const record = buildTokenRecord(event);
      indexToken(record).catch(() => {});

      // Notify UI listeners (immediate — image pending)
      for (const listener of createListeners) {
        try { listener(record); } catch { /* listener error shouldn't break stream */ }
      }

      // Resolve metadata URI → real image URL (async, non-blocking)
      if (event.uri) {
        resolveTokenMetadata(event.mint, event.uri, record);
      }

      stats.tokensCreated++;
      stats.lastCreateAt = Date.now();

    } else if (event.txType === 'buy' || event.txType === 'sell') {
      // Update live price and bonding curve progress
      const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
      const progress = calcBondingProgress(event.vSolInBondingCurve);
      livePrices.set(event.mint, {
        sol: event.vSolInBondingCurve,
        tokens: event.vTokensInBondingCurve,
        spotPrice,
        lastTradeAt: Date.now(),
        lastTradeType: event.txType,
        bondingCurveProgress: progress,
      });
      bondingProgress.set(event.mint, progress);

      stats.tradesProcessed++;
      stats.lastTradeAt = Date.now();
    }
  } catch {
    // Ignore malformed messages
  }
}

function connect(): void {
  if (typeof WebSocket === 'undefined') return; // SSR / non-browser

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      stats.connected = true;
      stats.lastError = null;
      reconnectDelay = RECONNECT_DELAY_MS; // Reset backoff on success

      // Subscribe to new token creation events
      ws!.send(JSON.stringify({ method: 'subscribeNewToken' }));
      // Note: subscribeTokenTrade requires specific token keys.
      // Trade updates for tracked tokens are received via the create event's
      // bonding curve data, plus periodic enrichment. Avoid subscribing to
      // ALL trades (no keys) — it floods the connection and causes disconnects.
    };

    ws.onmessage = (e: MessageEvent) => {
      handleMessage(typeof e.data === 'string' ? e.data : '');
    };

    ws.onerror = () => {
      stats.lastError = 'WebSocket error';
    };

    ws.onclose = () => {
      stats.connected = false;
      ws = null;

      if (!isRunning) return; // Intentionally stopped

      // Exponential backoff reconnect
      stats.reconnects++;
      reconnectTimer = setTimeout(() => {
        if (isRunning) connect();
      }, reconnectDelay);

      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
    };
  } catch (e: any) {
    stats.connected = false;
    stats.lastError = e.message;

    if (isRunning) {
      reconnectTimer = setTimeout(() => {
        if (isRunning) connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY_MS);
    }
  }
}

/** Start the PumpPortal real-time stream. */
export function startPumpPortalStream(solUsdPrice?: number): void {
  if (isRunning) return;
  isRunning = true;
  if (solUsdPrice) _solUsd = solUsdPrice;
  connect();
}

/** Stop the stream and clean up. */
export function stopPumpPortalStream(): void {
  isRunning = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  stats.connected = false;
}

/** Update the SOL/USD price used for converting virtual SOL to USD. */
export function setSolUsdPrice(price: number): void {
  _solUsd = price;
}

/** Get stream health for diagnostics / UI status display. */
export function getStreamHealth() {
  return {
    ...stats,
    trackedMints: seenMints.size,
    livePriceEntries: livePrices.size,
    isRunning,
    wsUrl: WS_URL,
  };
}
