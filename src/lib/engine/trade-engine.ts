// BSTONKEX Trade Engine — Unified execution with tx-tracker integration
import type { ChainId } from '../config';
import { explorerTxUrl } from '../config';
import { getChainAdapter } from './chain-registry';
import { calculateFeeAllocation } from './fee-engine';
import { recordTrade, updateTradeStatus } from './tx-tracker';
import type { TxStatus } from './types';

export type TradeStatus = 'preparing' | 'awaiting_approval' | 'approving' | 'awaiting_signature' | 'signing' | 'submitting' | 'pending' | 'confirmed' | 'failed';

export interface TradeExecution {
  id: string;
  chainId: ChainId;
  status: TradeStatus;
  hash: string | null;
  error: string | null;
  startedAt: number;
  confirmedAt: number | null;
  amountUsd: number;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  explorerUrl: string | null;
}

const activeTrades = new Map<string, TradeExecution>();
let tradeListeners: ((trade: TradeExecution) => void)[] = [];

export function onTradeUpdate(cb: (trade: TradeExecution) => void): () => void {
  tradeListeners.push(cb);
  return () => { tradeListeners = tradeListeners.filter(l => l !== cb); };
}

function emitUpdate(trade: TradeExecution) {
  tradeListeners.forEach(l => l(trade));
}

export async function executeTrade(params: {
  chainId: ChainId;
  side: 'buy' | 'sell';
  tokenAddress: string;
  tokenSymbol: string;
  amountUsd: number;
  slippagePct: number;
  walletAddress: string;
  swapParams: import('./types').SwapParams;
  swapQuote: import('./types').SwapQuote;
  referrerUsername?: string | null;
  quoteId?: string;
}): Promise<TradeExecution> {
  const tradeId = `${params.chainId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const trade: TradeExecution = {
    id: tradeId, chainId: params.chainId, status: 'preparing',
    hash: null, error: null, startedAt: Date.now(), confirmedAt: null,
    amountUsd: params.amountUsd, tokenSymbol: params.tokenSymbol, side: params.side,
    explorerUrl: null,
  };
  activeTrades.set(tradeId, trade);
  emitUpdate(trade);

  const adapter = getChainAdapter(params.chainId);
  if (!adapter) {
    trade.status = 'failed';
    trade.error = 'CHAIN ADAPTER NOT AVAILABLE';
    emitUpdate(trade);
    return trade;
  }

  try {
    const unsignedTx = await adapter.buildSwapTransaction(params.swapParams, params.swapQuote);

    // Check if approval needed (EVM)
    if (adapter.isEvm && unsignedTx.data?.startsWith('0x095ea7b3')) {
      trade.status = 'awaiting_approval';
      trade.error = 'APPROVAL_REQUIRED';
      (trade as any)._txData = { ...unsignedTx, from: params.walletAddress };
      emitUpdate(trade);
      return trade;
    }

    trade.status = 'awaiting_signature';
    (trade as any)._txData = { ...unsignedTx, from: params.walletAddress };
    (trade as any)._quoteId = params.quoteId;
    (trade as any)._walletAddress = params.walletAddress;
    (trade as any)._referrerUsername = params.referrerUsername;
    emitUpdate(trade);
    return trade;

  } catch (e: any) {
    trade.status = 'failed';
    trade.error = e.message || 'TRADE FAILED';
    emitUpdate(trade);
    return trade;
  }
}

export async function confirmTradeSubmission(
  tradeId: string,
  txHash: string,
  referrerUsername?: string | null,
): Promise<TradeExecution> {
  const trade = activeTrades.get(tradeId);
  if (!trade) throw new Error('Trade not found');

  trade.hash = txHash;
  trade.status = 'pending';
  trade.explorerUrl = explorerTxUrl(trade.chainId, txHash);
  emitUpdate(trade);

  // Record in tx-tracker (idempotent by txHash)
  const wallet = (trade as any)._walletAddress || '';
  const quoteId = (trade as any)._quoteId || '';
  await recordTrade({
    txHash, chainId: trade.chainId, wallet,
    tokenSymbol: trade.tokenSymbol, side: trade.side,
    amountUsd: trade.amountUsd, status: 'pending',
    quoteId, tradeId: trade.id, referrerUsername: referrerUsername || null,
  });

  const adapter = getChainAdapter(trade.chainId);
  if (!adapter) {
    trade.status = 'failed';
    trade.error = 'ADAPTER LOST';
    updateTradeStatus(txHash, 'failed');
    emitUpdate(trade);
    return trade;
  }

  // Poll for confirmation
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    let status: TxStatus;
    try {
      status = await adapter.getTransactionStatus(txHash);
    } catch {
      continue; // RPC error — retry
    }

    if (status.status === 'confirmed') {
      trade.status = 'confirmed';
      trade.confirmedAt = Date.now();
      updateTradeStatus(txHash, 'confirmed');
      emitUpdate(trade);

      // Fee/referral accounting (idempotent by tradeId)
      if (referrerUsername && trade.amountUsd > 0) {
        await calculateFeeAllocation(trade.amountUsd, referrerUsername, tradeId);
      }
      break;
    }
    if (status.status === 'failed') {
      trade.status = 'failed';
      trade.error = 'TRANSACTION FAILED ON-CHAIN';
      updateTradeStatus(txHash, 'failed');
      emitUpdate(trade);
      break;
    }
  }

  if (trade.status === 'pending') {
    trade.status = 'failed';
    trade.error = 'CONFIRMATION TIMEOUT';
    updateTradeStatus(txHash, 'failed');
    emitUpdate(trade);
  }

  return trade;
}

export function getTradeTxData(tradeId: string): any | null {
  const trade = activeTrades.get(tradeId);
  return trade ? (trade as any)._txData || null : null;
}

export function getActiveTrades(): TradeExecution[] {
  return Array.from(activeTrades.values());
}

export function getTrade(tradeId: string): TradeExecution | undefined {
  return activeTrades.get(tradeId);
}