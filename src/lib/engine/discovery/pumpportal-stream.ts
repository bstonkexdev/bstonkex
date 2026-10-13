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
}>();

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
export function getLivePrice(mint: string): { spotPrice: number; lastTradeAt: number } | null {
  const entry = livePrices.get(mint);
  if (!entry) return null;
  return { spotPrice: entry.spotPrice, lastTradeAt: entry.lastTradeAt };
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

function buildTokenRecord(event: PumpPortalCreateEvent): TokenIndexRecord {
  const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
  const solUsd = _solUsd;

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
    bondingCurveProgress: 0,
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
    icon: event.uri ?? null,
    websites: null,
    socials: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as TokenIndexRecord;
}

// SOL/USD price — cached from enrichment or fallback
let _solUsd = 200; // fallback until sol-price module provides real value

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
      livePrices.set(event.mint, {
        sol: event.vSolInBondingCurve,
        tokens: event.vTokensInBondingCurve,
        spotPrice,
        lastTradeAt: Date.now(),
        lastTradeType: 'buy',
      });

      // Build token record and persist asynchronously (non-blocking)
      const record = buildTokenRecord(event);
      indexToken(record).catch(() => {});

      // Notify UI listeners
      for (const listener of createListeners) {
        try { listener(record); } catch { /* listener error shouldn't break stream */ }
      }

      stats.tokensCreated++;
      stats.lastCreateAt = Date.now();

    } else if (event.txType === 'buy' || event.txType === 'sell') {
      // Update live price for bonding curve tokens
      const spotPrice = event.vSolInBondingCurve / event.vTokensInBondingCurve;
      livePrices.set(event.mint, {
        sol: event.vSolInBondingCurve,
        tokens: event.vTokensInBondingCurve,
        spotPrice,
        lastTradeAt: Date.now(),
        lastTradeType: event.txType,
      });

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
      // Also subscribe to trades for live bonding curve price updates
      ws!.send(JSON.stringify({ method: 'subscribeTokenTrade' }));
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
