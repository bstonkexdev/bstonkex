// BSTONKEX P&L Engine — Cost basis, realized/unrealized P&L, position tracking
import type { ChainId } from '../config';
import { gitlawb } from '../gitlawb';

// ── Persistent collections ────────────────────────────────────
const positions = gitlawb.db.collection<{
  wallet: string; chainId: string; tokenAddress: string; tokenSymbol: string;
  quantity: number; costBasisUsd: number; avgEntryPrice: number;
  realizedPnl: number; realizedSales: number;
  lastUpdated: string;
}>('positions');

const pnlLedger = gitlawb.db.collection<{
  wallet: string; tradeId: string; txHash: string; chainId: string;
  tokenSymbol: string; side: string; quantity: number; priceUsd: number;
  valueUsd: number; costBasisUsd: number; realizedPnl: number;
  timestamp: string;
}>('pnl_ledger');

// ── Types ────────────────────────────────────────────────────

export interface Position {
  wallet: string;
  chainId: ChainId;
  tokenAddress: string;
  tokenSymbol: string;
  quantity: number;
  costBasisUsd: number;
  avgEntryPrice: number;
  currentValueUsd: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  realizedPnl: number;
  totalPnl: number;
  lastUpdated: number;
}

export interface TradeRecord {
  id: string;
  wallet: string;
  tradeId: string;
  txHash: string;
  chainId: ChainId;
  tokenSymbol: string;
  side: 'buy' | 'sell' | 'swap_in' | 'swap_out' | 'transfer_in' | 'transfer_out';
  quantity: number;
  priceUsd: number;
  valueUsd: number;
  costBasisUsd: number;
  realizedPnl: number;
  timestamp: number;
}

// ── Record a buy ─────────────────────────────────────────────

export async function recordBuy(params: {
  wallet: string; chainId: ChainId; tokenAddress: string; tokenSymbol: string;
  quantity: number; priceUsd: number; valueUsd: number; txHash: string; tradeId: string;
}): Promise<void> {
  const { wallet, chainId, tokenAddress, tokenSymbol, quantity, priceUsd, valueUsd, txHash, tradeId } = params;
  const existing = await getRawPosition(wallet, chainId, tokenAddress);

  if (existing) {
    const newQty = existing.quantity + quantity;
    const newCost = existing.costBasisUsd + valueUsd;
    const avgEntry = newQty > 0 ? newCost / newQty : 0;
    await positions.update(existing.recordId, {
      quantity: newQty, costBasisUsd: newCost, avgEntryPrice: avgEntry,
      lastUpdated: new Date().toISOString(),
    });
  } else {
    await positions.create({
      wallet, chainId, tokenAddress, tokenSymbol,
      quantity, costBasisUsd: valueUsd, avgEntryPrice: priceUsd,
      realizedPnl: 0, realizedSales: 0,
      lastUpdated: new Date().toISOString(),
    });
  }

  await pnlLedger.create({
    wallet, tradeId, txHash, chainId: chainId, tokenSymbol,
    side: 'buy', quantity, priceUsd, valueUsd,
    costBasisUsd: valueUsd, realizedPnl: 0,
    timestamp: new Date().toISOString(),
  });
}

// ── Record a sell ────────────────────────────────────────────

export async function recordSell(params: {
  wallet: string; chainId: ChainId; tokenAddress: string; tokenSymbol: string;
  quantity: number; priceUsd: number; valueUsd: number; txHash: string; tradeId: string;
}): Promise<{ realizedPnl: number }> {
  const { wallet, chainId, tokenAddress, tokenSymbol, quantity, priceUsd, valueUsd, txHash, tradeId } = params;
  const existing = await getRawPosition(wallet, chainId, tokenAddress);

  let realizedPnl = 0;
  let costBasisSold = 0;

  if (existing && existing.quantity > 0) {
    const sellRatio = Math.min(1, quantity / existing.quantity);
    costBasisSold = existing.costBasisUsd * sellRatio;
    realizedPnl = valueUsd - costBasisSold;

    const newQty = Math.max(0, existing.quantity - quantity);
    const newCost = existing.costBasisUsd - costBasisSold;
    const avgEntry = newQty > 0 ? newCost / newQty : existing.avgEntryPrice;

    await positions.update(existing.recordId, {
      quantity: newQty, costBasisUsd: Math.max(0, newCost), avgEntryPrice: avgEntry,
      realizedPnl: existing.realizedPnl + realizedPnl,
      realizedSales: existing.realizedSales + 1,
      lastUpdated: new Date().toISOString(),
    });
  }

  await pnlLedger.create({
    wallet, tradeId, txHash, chainId: chainId, tokenSymbol,
    side: 'sell', quantity, priceUsd, valueUsd,
    costBasisUsd: costBasisSold, realizedPnl,
    timestamp: new Date().toISOString(),
  });

  return { realizedPnl };
}

// ── Query positions ──────────────────────────────────────────

async function getRawPosition(wallet: string, chainId: ChainId, tokenAddress: string) {
  try {
    const { records } = await positions.list({ limit: 200 });
    const found = records.find(r =>
      r.data.wallet.toLowerCase() === wallet.toLowerCase() &&
      r.data.chainId === chainId &&
      r.data.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!found) return null;
    return { recordId: found.id, ...found.data };
  } catch {
    return null;
  }
}

/** Get all positions for a wallet, with current market values. */
export async function getPositions(wallet: string): Promise<Position[]> {
  try {
    const { records } = await positions.list({ limit: 200 });
    return records
      .filter(r => r.data.wallet.toLowerCase() === wallet.toLowerCase() && r.data.quantity > 0)
      .map(r => {
        const d = r.data;
        const currentValueUsd = d.quantity * d.avgEntryPrice; // Fallback; real price from portfolio-engine
        const unrealizedPnl = currentValueUsd - d.costBasisUsd;
        const unrealizedPct = d.costBasisUsd > 0 ? (unrealizedPnl / d.costBasisUsd) * 100 : 0;
        return {
          wallet: d.wallet, chainId: d.chainId as ChainId, tokenAddress: d.tokenAddress,
          tokenSymbol: d.tokenSymbol, quantity: d.quantity, costBasisUsd: d.costBasisUsd,
          avgEntryPrice: d.avgEntryPrice, currentValueUsd, currentPrice: d.avgEntryPrice,
          unrealizedPnl, unrealizedPct, realizedPnl: d.realizedPnl,
          totalPnl: unrealizedPnl + d.realizedPnl,
          lastUpdated: new Date(d.lastUpdated).getTime(),
        };
      });
  } catch {
    return [];
  }
}

/** Enrich positions with live market prices from portfolio engine. */
export function enrichPositionsWithPrices(
  positions: Position[],
  liveBalances: { address: string; symbol: string; priceUsd: number | null }[],
): Position[] {
  return positions.map(p => {
    const live = liveBalances.find(b =>
      b.address.toLowerCase() === p.tokenAddress.toLowerCase() && b.priceUsd != null
    );
    if (live && live.priceUsd != null) {
      const currentValue = p.quantity * live.priceUsd;
      const unrealizedPnl = currentValue - p.costBasisUsd;
      const unrealizedPct = p.costBasisUsd > 0 ? (unrealizedPnl / p.costBasisUsd) * 100 : 0;
      return {
        ...p, currentPrice: live.priceUsd, currentValueUsd: currentValue,
        unrealizedPnl, unrealizedPct, totalPnl: unrealizedPnl + p.realizedPnl,
      };
    }
    return p;
  });
}

/** Get trade history for a wallet. */
export async function getTradeHistory(wallet: string): Promise<TradeRecord[]> {
  try {
    const { records } = await pnlLedger.list({ limit: 200 });
    return records
      .filter(r => r.data.wallet.toLowerCase() === wallet.toLowerCase())
      .map(r => ({
        id: r.id, wallet: r.data.wallet, tradeId: r.data.tradeId, txHash: r.data.txHash,
        chainId: r.data.chainId as ChainId, tokenSymbol: r.data.tokenSymbol,
        side: r.data.side as TradeRecord['side'], quantity: r.data.quantity,
        priceUsd: r.data.priceUsd, valueUsd: r.data.valueUsd,
        costBasisUsd: r.data.costBasisUsd, realizedPnl: r.data.realizedPnl,
        timestamp: new Date(r.data.timestamp).getTime(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/** Get aggregate P&L summary. */
export async function getPnlSummary(wallet: string): Promise<{
  totalRealized: number; totalUnrealized: number; totalPnl: number;
  totalCostBasis: number; totalCurrentValue: number;
}> {
  const pos = await getPositions(wallet);
  const totalRealized = pos.reduce((s, p) => s + p.realizedPnl, 0);
  const totalUnrealized = pos.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalCostBasis = pos.reduce((s, p) => s + p.costBasisUsd, 0);
  const totalCurrentValue = pos.reduce((s, p) => s + p.currentValueUsd, 0);
  return { totalRealized, totalUnrealized, totalPnl: totalRealized + totalUnrealized, totalCostBasis, totalCurrentValue };
}