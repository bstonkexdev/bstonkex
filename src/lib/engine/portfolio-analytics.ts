// BSTONKEX Portfolio Analytics — Trading performance, allocation, fee analytics
import type { ChainId } from '../config';
import { getWalletTrades, type TrackedTrade } from './tx-tracker';
import { getTradeHistory, type TradeRecord } from './pnl-engine';
import type { WalletBalance } from './types';

// ── Trading Performance ──────────────────────────────────────

export interface TradingPerformance {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  avgTradeValue: number;
  bestTrade: { token: string; pnl: number } | null;
  worstTrade: { token: string; pnl: number } | null;
  totalVolume: number;
  realizedPnl: number;
}

export async function getTradingPerformance(wallet: string): Promise<TradingPerformance> {
  const trades = await getTradeHistory(wallet);
  const sells = trades.filter(t => t.side === 'sell');
  const buys = trades.filter(t => t.side === 'buy');

  const wins = sells.filter(t => t.realizedPnl > 0);
  const losses = sells.filter(t => t.realizedPnl < 0);

  const totalVolume = trades.reduce((s, t) => s + t.valueUsd, 0);
  const realizedPnl = sells.reduce((s, t) => s + t.realizedPnl, 0);

  let bestTrade: TradingPerformance['bestTrade'] = null;
  let worstTrade: TradingPerformance['worstTrade'] = null;
  for (const t of sells) {
    if (!bestTrade || t.realizedPnl > bestTrade.pnl) bestTrade = { token: t.tokenSymbol, pnl: t.realizedPnl };
    if (!worstTrade || t.realizedPnl < worstTrade.pnl) worstTrade = { token: t.tokenSymbol, pnl: t.realizedPnl };
  }

  return {
    totalTrades: trades.length,
    buyCount: buys.length,
    sellCount: sells.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : null,
    avgTradeValue: trades.length > 0 ? totalVolume / trades.length : 0,
    bestTrade, worstTrade, totalVolume, realizedPnl,
  };
}

// ── Fee Analytics ────────────────────────────────────────────

export interface FeeAnalytics {
  bstonkexFees: number;
  dexFees: number;
  networkFees: number;
  totalFees: number;
}

export async function getFeeAnalytics(wallet: string): Promise<FeeAnalytics> {
  // BSTONKEX fee = 0.40% of all trade volume
  const trades = await getTradeHistory(wallet);
  const totalVolume = trades.reduce((s, t) => s + t.valueUsd, 0);
  const bstonkexFees = totalVolume * 0.004;
  // DEX and network fees are estimated per-trade from quote data
  // For now, these come from the fee_engine collection or are estimated
  return { bstonkexFees, dexFees: 0, networkFees: 0, totalFees: bstonkexFees };
}

// ── Allocation ───────────────────────────────────────────────

export interface AllocationItem {
  label: string;
  valueUsd: number;
  pct: number;
  color?: string;
  count?: number;
}

export function getTokenAllocation(chains: WalletBalance[]): AllocationItem[] {
  const allTokens: { symbol: string; valueUsd: number }[] = [];
  for (const c of chains) {
    allTokens.push({ symbol: c.nativeSymbol, valueUsd: c.nativeBalanceUsd });
    for (const t of c.tokens) {
      if (t.valueUsd != null && t.valueUsd > 0) allTokens.push({ symbol: t.symbol, valueUsd: t.valueUsd });
    }
  }
  const total = allTokens.reduce((s, t) => s + t.valueUsd, 0) || 1;
  const grouped = new Map<string, number>();
  for (const t of allTokens) grouped.set(t.symbol, (grouped.get(t.symbol) || 0) + t.valueUsd);

  const items: AllocationItem[] = [];
  for (const [symbol, value] of grouped) items.push({ label: symbol, valueUsd: value, pct: (value / total) * 100 });
  items.sort((a, b) => b.valueUsd - a.valueUsd);
  return items;
}

export function getChainAllocation(chains: WalletBalance[]): AllocationItem[] {
  const total = chains.reduce((s, c) => s + c.totalUsd, 0) || 1;
  return chains.map(c => ({
    label: c.chainId, valueUsd: c.totalUsd,
    pct: (c.totalUsd / total) * 100,
    count: c.tokens.length + 1,
  })).sort((a, b) => b.valueUsd - a.valueUsd);
}