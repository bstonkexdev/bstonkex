// BSTONKEX Transaction Tracker — Idempotent, deduped trade tracking
import type { ChainId } from '../config';
import { CHAINS, explorerTxUrl } from '../config';
import { gitlawb } from '../gitlawb';

// ── Persistent trade log (Gitlawb — per user, deduped by txHash) ──

const tradeLog = gitlawb.db.collection<{
  txHash: string;
  chainId: string;
  wallet: string;
  tokenSymbol: string;
  side: string;
  amountUsd: number;
  status: string;
  quoteId: string;
  tradeId: string;
  timestamp: string;
  referrerUsername: string | null;
}>('trade_log');

export interface TrackedTrade {
  id: string;
  txHash: string;
  chainId: ChainId;
  wallet: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amountUsd: number;
  status: 'pending' | 'confirmed' | 'failed';
  quoteId: string;
  tradeId: string;
  timestamp: number;
  explorerUrl: string;
  referrerUsername: string | null;
}

// In-memory map for fast lookups (backed by Gitlawb for persistence)
const trades = new Map<string, TrackedTrade>();

/** Record a new trade — idempotent by txHash. */
export async function recordTrade(t: Omit<TrackedTrade, 'id' | 'explorerUrl' | 'timestamp'>): Promise<TrackedTrade> {
  // Dedup: if we already have this txHash, return existing
  const existing = trades.get(t.txHash) || (await findTradeByHash(t.txHash));
  if (existing) return existing;

  const tracked: TrackedTrade = {
    ...t,
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    explorerUrl: explorerTxUrl(t.chainId, t.txHash),
  };
  trades.set(t.txHash, tracked);

  // Persist to Gitlawb (idempotent — won't re-add if exists)
  try {
    await tradeLog.create({
      txHash: t.txHash,
      chainId: t.chainId,
      wallet: t.wallet,
      tokenSymbol: t.tokenSymbol,
      side: t.side,
      amountUsd: t.amountUsd,
      status: t.status,
      quoteId: t.quoteId,
      tradeId: t.tradeId,
      timestamp: new Date().toISOString(),
      referrerUsername: t.referrerUsername,
    });
  } catch { /* non-critical — in-memory is sufficient */ }

  return tracked;
}

/** Update trade status. */
export function updateTradeStatus(txHash: string, status: TrackedTrade['status']): void {
  const t = trades.get(txHash);
  if (t) t.status = status;
}

/** Find trade by txHash. */
async function findTradeByHash(txHash: string): Promise<TrackedTrade | null> {
  try {
    const { records } = await tradeLog.list({ limit: 100 });
    const found = records.find(r => r.data.txHash === txHash);
    if (!found) return null;
    const d = found.data;
    const tracked: TrackedTrade = {
      id: found.id,
      txHash: d.txHash,
      chainId: d.chainId as ChainId,
      wallet: d.wallet,
      tokenSymbol: d.tokenSymbol,
      side: d.side as 'buy' | 'sell',
      amountUsd: d.amountUsd,
      status: d.status as TrackedTrade['status'],
      quoteId: d.quoteId,
      tradeId: d.tradeId,
      timestamp: new Date(d.timestamp).getTime(),
      explorerUrl: explorerTxUrl(d.chainId as ChainId, d.txHash),
      referrerUsername: d.referrerUsername,
    };
    trades.set(txHash, tracked);
    return tracked;
  } catch {
    return null;
  }
}

/** Get all tracked trades for display. */
export function getAllTrades(): TrackedTrade[] {
  return Array.from(trades.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/** Get trades for a specific wallet. */
export async function getWalletTrades(wallet: string): Promise<TrackedTrade[]> {
  try {
    const { records } = await tradeLog.list({ limit: 100 });
    return records
      .filter(r => r.data.wallet.toLowerCase() === wallet.toLowerCase())
      .map(r => ({
        id: r.id,
        txHash: r.data.txHash,
        chainId: r.data.chainId as ChainId,
        wallet: r.data.wallet,
        tokenSymbol: r.data.tokenSymbol,
        side: r.data.side as 'buy' | 'sell',
        amountUsd: r.data.amountUsd,
        status: r.data.status as TrackedTrade['status'],
        quoteId: r.data.quoteId,
        tradeId: r.data.tradeId,
        timestamp: new Date(r.data.timestamp).getTime(),
        explorerUrl: explorerTxUrl(r.data.chainId as ChainId, r.data.txHash),
        referrerUsername: r.data.referrerUsername,
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}