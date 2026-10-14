// Cupcak8 Swap — Unified Trade Stream
// Normalizes trades from PumpPortal WS + Solana Geyser into Universal Trade Payload (UTP).
// Matches the blueprint: [Blockchain Data Layer] → [Universal Trade Normalizer] → [Message Bus]

import { onTokenTrade } from './discovery/pumpportal-stream';

// ── Universal Trade Payload (UTP) ────────────────────────────

export interface UniversalTradePayload {
  txHash: string;
  time: string;          // HH:MM:SS
  timestamp: number;     // Unix ms
  mint: string;
  chain: string;
  symbol: string;
  priceUsd: number;
  volumeUsd: number;
  tokenAmount: number;
  side: 'buy' | 'sell';
  trader: string;        // Shortened address (e.g., "*1307")
  traderFull: string;    // Full address
  mcap: number;          // Market cap at time of trade
  tags: WalletTags;
  tradesCountForWalletOnToken: number;
}

export interface WalletTags {
  isSmartMoney: boolean;
  isKOL: boolean;
  isSniper: boolean;
  isCabal: boolean;
  isFollowed: boolean;
  isCreator: boolean;
}

// ── Trade Stream State ───────────────────────────────────────

type TradeListener = (trade: UniversalTradePayload) => void;
const listeners: TradeListener[] = [];
const tradeHistory = new Map<string, UniversalTradePayload[]>(); // key: mint
const MAX_HISTORY = 100;

// ── Wallet Trade Counter ─────────────────────────────────────

const walletTradeCount = new Map<string, number>(); // key: wallet:mint

function getWalletTradeCount(wallet: string, mint: string): number {
  const key = `${wallet}:${mint}`;
  const count = walletTradeCount.get(key) || 0;
  walletTradeCount.set(key, count + 1);
  return count + 1;
}

// ── Address Shortener ────────────────────────────────────────

function shortenAddress(address: string): string {
  if (!address || address.length < 8) return address || 'unknown';
  return `*${address.slice(-4)}`;
}

// ── Normalize PumpPortal Trade → UTP ─────────────────────────

function normalizePumpPortalTrade(data: any): UniversalTradePayload | null {
  try {
    const mint = data.mint || data.tokenAddress || '';
    if (!mint) return null;

    const solAmount = data.solAmount || 0;
    const tokenAmount = data.tokenAmount || 0;
    const priceUsd = data.priceUsd || 0;
    const volumeUsd = solAmount * 200; // Approximate SOL price
    const side = data.txType === 'buy' ? 'buy' : 'sell';
    const trader = data.trader || data.user || '';
    const timestamp = data.timestamp ? data.timestamp * 1000 : Date.now();

    return {
      txHash: data.signature || data.txHash || `pump_${Date.now()}`,
      time: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false }),
      timestamp,
      mint,
      chain: 'solana',
      symbol: data.symbol || 'TOKEN',
      priceUsd,
      volumeUsd,
      tokenAmount,
      side,
      trader: shortenAddress(trader),
      traderFull: trader,
      mcap: priceUsd * 1e9, // Approximate mcap
      tags: {
        isSmartMoney: false,
        isKOL: false,
        isSniper: false,
        isCabal: false,
        isFollowed: false,
        isCreator: false,
      },
      tradesCountForWalletOnToken: getWalletTradeCount(trader, mint),
    };
  } catch {
    return null;
  }
}

// ── Subscribe to Trade Stream ────────────────────────────────

export function subscribeTrades(callback: TradeListener): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** Get trade history for a specific mint. */
export function getTradeHistory(mint: string): UniversalTradePayload[] {
  return tradeHistory.get(mint) || [];
}

/** Get all recent trades across all mints. */
export function getAllRecentTrades(limit = 50): UniversalTradePayload[] {
  const all: UniversalTradePayload[] = [];
  for (const trades of tradeHistory.values()) {
    all.push(...trades);
  }
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all.slice(0, limit);
}

// ── Emit Trade ───────────────────────────────────────────────

function emitTrade(trade: UniversalTradePayload): void {
  // Store in history
  const history = tradeHistory.get(trade.mint) || [];
  history.push(trade);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  tradeHistory.set(trade.mint, history);

  // Notify listeners
  for (const listener of listeners) {
    try { listener(trade); } catch { /* swallow */ }
  }
}

// ── Initialize Stream ────────────────────────────────────────

let initialized = false;

export function initTradeStream(): void {
  if (initialized) return;
  initialized = true;

  // Subscribe to PumpPortal real-time trades
  onTokenTrade((data: any) => {
    const utp = normalizePumpPortalTrade(data);
    if (utp) emitTrade(utp);
  });

  console.log('[trade-stream] Initialized — listening for PumpPortal trades');
}

// ── Update Wallet Tags ───────────────────────────────────────

export function updateTradeTags(
  txHash: string,
  mint: string,
  tags: Partial<WalletTags>,
): void {
  const history = tradeHistory.get(mint);
  if (!history) return;
  const trade = history.find(t => t.txHash === txHash);
  if (trade) {
    trade.tags = { ...trade.tags, ...tags };
  }
}