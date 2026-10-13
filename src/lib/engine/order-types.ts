// Cupcak8 Swap — Client-side SL/TP order types
// These orders are managed locally and require the app to be open to monitor.
// No backend SL/TP API exists — this is a client-side only feature.

import type { ChainId } from '../config';

export type OrderType = 'stop_loss' | 'take_profit';
export type TriggerType = 'price' | 'percentage';
export type PositionSize = 'full' | 'partial';
export type OrderStatus = 'pending' | 'active' | 'triggered' | 'completed' | 'failed' | 'cancelled';

export interface TradingOrder {
  id: string;
  type: OrderType;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: ChainId;
  side: 'sell';
  triggerType: TriggerType;
  /** Price target (if triggerType === 'price') */
  targetPrice: number | null;
  /** Percentage trigger (if triggerType === 'percentage') — e.g. -5 for 5% loss, 10 for 10% gain */
  percentage: number | null;
  /** Entry price when order was created */
  entryPrice: number;
  positionSize: PositionSize;
  /** Percentage of position to sell (if partial) */
  partialPct: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  /** Set when order transitions to triggered/completed/failed */
  executedAt: number | null;
  txHash: string | null;
  error: string | null;
}

export interface CreateOrderParams {
  type: OrderType;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: ChainId;
  triggerType: TriggerType;
  targetPrice: number | null;
  percentage: number | null;
  entryPrice: number;
  positionSize: PositionSize;
  partialPct: number;
}

/** Generate a unique order ID */
export function generateOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Calculate the trigger price for an order */
export function getTriggerPrice(order: TradingOrder): number {
  if (order.triggerType === 'price' && order.targetPrice != null) {
    return order.targetPrice;
  }
  if (order.triggerType === 'percentage' && order.percentage != null) {
    if (order.type === 'stop_loss') {
      return order.entryPrice * (1 + order.percentage / 100); // percentage is negative
    }
    return order.entryPrice * (1 + order.percentage / 100);
  }
  return 0;
}

/** Check if current price triggers an order */
export function shouldTrigger(order: TradingOrder, currentPrice: number): boolean {
  if (order.status !== 'active') return false;
  const trigger = getTriggerPrice(order);
  if (trigger <= 0) return false;
  
  if (order.type === 'stop_loss') {
    return currentPrice <= trigger;
  }
  return currentPrice >= trigger;
}

/** Get human-readable trigger description */
export function getOrderTriggerLabel(order: TradingOrder): string {
  if (order.triggerType === 'price' && order.targetPrice != null) {
    return `Price ${order.type === 'stop_loss' ? '≤' : '≥'} $${order.targetPrice.toFixed(6)}`;
  }
  if (order.triggerType === 'percentage' && order.percentage != null) {
    const pct = Math.abs(order.percentage);
    return `${order.type === 'stop_loss' ? 'Drop' : 'Rise'} ${pct.toFixed(1)}%`;
  }
  return 'Invalid';
}

/** Get status display info */
export function getOrderStatusInfo(status: OrderStatus): { label: string; color: string } {
  switch (status) {
    case 'pending': return { label: 'PENDING', color: 'var(--amber, #FFD700)' };
    case 'active': return { label: 'ACTIVE', color: 'var(--green)' };
    case 'triggered': return { label: 'TRIGGERED', color: 'var(--cyan, #0088FF)' };
    case 'completed': return { label: 'COMPLETED', color: 'var(--green)' };
    case 'failed': return { label: 'FAILED', color: 'var(--red)' };
    case 'cancelled': return { label: 'CANCELLED', color: 'var(--text-muted)' };
  }
}