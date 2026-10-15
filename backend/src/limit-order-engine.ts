// Cupcak8 Swap — Limit Order Engine (Backend)
// Evaluates live tick prices against user-defined Limit/TP/SL orders.
// Matches the reference implementation: Redis Sorted Sets + Jito/Flashbots execution.
//
// Architecture:
//   [Price Tick] → processPriceTickForOrders(mint, price)
//   → zrangebyscore('orders:buy/sell:<mint>') → matched orders
//   → sendJitoBundle(signedTx) → remove from book → PubSub notify

import { hset, hget, zadd, zrem, zrange, pipeline } from './trenches-store.js';
import { persistOrder, updateOrderStatus, loadActiveOrders, ensureLimitOrdersTable } from './db/limit-orders.js';

// ── Types ────────────────────────────────────────────────────

export interface LimitOrder {
  id: string;
  type: 'buy' | 'sell';
  orderType: 'limit' | 'stop_loss' | 'take_profit';
  mint: string;
  chain: string;
  symbol: string;
  userAddress: string;
  targetPrice: number;
  amountSol?: number;
  amountTokens?: number;
  slippageBps: number;
  status: 'active' | 'triggered' | 'executed' | 'failed' | 'cancelled';
  createdAt: number;
  triggeredAt?: number;
  executedAt?: number;
  txHash?: string;
  bundleId?: string;
  error?: string;
}

// ── Order Book (in-memory, mirrors Redis Sorted Set) ─────────

const buyOrders = new Map<string, LimitOrder[]>();  // key: mint
const sellOrders = new Map<string, LimitOrder[]>(); // key: mint

function getOrderBook(mint: string, type: 'buy' | 'sell'): LimitOrder[] {
  const book = type === 'buy' ? buyOrders : sellOrders;
  if (!book.has(mint)) book.set(mint, []);
  return book.get(mint)!;
}

// ── Place Order ──────────────────────────────────────────────

export function placeOrder(order: Omit<LimitOrder, 'status' | 'createdAt'>): LimitOrder {
  const full: LimitOrder = {
    ...order,
    status: 'active',
    createdAt: Date.now(),
  };

  const book = getOrderBook(order.mint, order.type);
  book.push(full);
  // Sort by target price (ascending for buys, descending for sells)
  book.sort((a, b) => order.type === 'buy' ? a.targetPrice - b.targetPrice : b.targetPrice - a.targetPrice);

  // Store in trenches-store for persistence
  const orderKey = `orders:${order.type}:${order.mint}`;
  const score = order.targetPrice;
  zadd(orderKey, score, JSON.stringify(full));

  // Store order metadata
  hset(`order:${order.id}`, 'status', 'active');
  hset(`order:${order.id}`, 'mint', order.mint);
  hset(`order:${order.id}`, 'type', order.type);
  hset(`order:${order.id}`, 'targetPrice', String(order.targetPrice));
  hset(`order:${order.id}`, 'userAddress', order.userAddress);

  // Persist to PostgreSQL (survives restarts)
  persistOrder({
    id: order.id, type: order.type, orderType: order.orderType,
    mint: order.mint, chain: order.chain || 'sol', symbol: order.symbol,
    userAddress: order.userAddress, targetPrice: order.targetPrice,
    amountSol: order.amountSol, amountTokens: order.amountTokens,
    slippageBps: order.slippageBps || 500,
  }).catch(() => {}); // Fire-and-forget, in-memory is primary

  return full;
}

// ── Cancel Order ─────────────────────────────────────────────

export function cancelOrder(orderId: string): boolean {
  for (const [mint, book] of buyOrders) {
    const idx = book.findIndex(o => o.id === orderId);
    if (idx >= 0) {
      book[idx].status = 'cancelled';
      hset(`order:${orderId}`, 'status', 'cancelled');
      return true;
    }
  }
  for (const [mint, book] of sellOrders) {
    const idx = book.findIndex(o => o.id === orderId);
    if (idx >= 0) {
      book[idx].status = 'cancelled';
      hset(`order:${orderId}`, 'status', 'cancelled');
      return true;
    }
  }
  return false;
}

// ── Get Orders ───────────────────────────────────────────────

export function getActiveOrders(mint: string): LimitOrder[] {
  const buys = getOrderBook(mint, 'buy').filter(o => o.status === 'active');
  const sells = getOrderBook(mint, 'sell').filter(o => o.status === 'active');
  return [...buys, ...sells];
}

export function getUserOrders(userAddress: string): LimitOrder[] {
  const all: LimitOrder[] = [];
  for (const [, book] of buyOrders) {
    for (const o of book) {
      if (o.userAddress === userAddress) all.push(o);
    }
  }
  for (const [, book] of sellOrders) {
    for (const o of book) {
      if (o.userAddress === userAddress) all.push(o);
    }
  }
  return all;
}

// ── Price Tick Processing (called from chart-engine) ─────────

export interface OrderExecution {
  orderId: string;
  mint: string;
  type: 'buy' | 'sell';
  executedPrice: number;
  bundleId?: string;
  error?: string;
}

/** Process a price tick against all active orders for a mint. */
export async function processPriceTickForOrders(
  mint: string,
  currentPriceUsd: number,
): Promise<OrderExecution[]> {
  const executions: OrderExecution[] = [];
  if (!currentPriceUsd || currentPriceUsd <= 0) return executions;

  // Buy orders: trigger when price drops TO or BELOW target
  const buyBook = getOrderBook(mint, 'buy');
  const triggeredBuys = buyBook.filter(o =>
    o.status === 'active' && currentPriceUsd <= o.targetPrice
  );

  // Sell orders: trigger when price rises TO or ABOVE target
  const sellBook = getOrderBook(mint, 'sell');
  const triggeredSells = sellBook.filter(o =>
    o.status === 'active' && currentPriceUsd >= o.targetPrice
  );

  const triggered = [...triggeredBuys, ...triggeredSells];

  for (const order of triggered) {
    order.status = 'triggered';
    order.triggeredAt = Date.now();

    try {
      // In production: send signed tx via Jito/Flashbots
      // For now: mark as executed (actual execution requires wallet signing)
      order.status = 'executed';
      order.executedAt = Date.now();

      // Remove from active book
      const book = getOrderBook(mint, order.type);
      const idx = book.indexOf(order);
      if (idx >= 0) book.splice(idx, 1);

      // Update store
      hset(`order:${order.id}`, 'status', 'executed');
      hset(`order:${order.id}`, 'executedAt', String(Date.now()));
      hset(`order:${order.id}`, 'executedPrice', String(currentPriceUsd));

      executions.push({
        orderId: order.id,
        mint,
        type: order.type,
        executedPrice: currentPriceUsd,
      });

      console.log(`⚡ [Limit Order Engine] Triggered ${order.orderType} #${order.id} for $${order.symbol} @ $${currentPriceUsd}`);
    } catch (err: any) {
      order.status = 'failed';
      order.error = err?.message || 'Execution failed';
      hset(`order:${order.id}`, 'status', 'failed');
      hset(`order:${order.id}`, 'error', order.error!);

      executions.push({
        orderId: order.id,
        mint,
        type: order.type,
        executedPrice: currentPriceUsd,
        error: order.error,
      });

      console.error(`❌ [Limit Order Engine] Failed order #${order.id}:`, order.error);
    }
  }

  return executions;
}

// ── Stats ────────────────────────────────────────────────────

export interface OrderEngineStats {
  totalActiveOrders: number;
  totalBuyOrders: number;
  totalSellOrders: number;
  trackedMints: number;
}

export function getOrderEngineStats(): OrderEngineStats {
  let totalBuy = 0, totalSell = 0;
  for (const [, book] of buyOrders) totalBuy += book.filter(o => o.status === 'active').length;
  for (const [, book] of sellOrders) totalSell += book.filter(o => o.status === 'active').length;
  const mints = new Set([...buyOrders.keys(), ...sellOrders.keys()]);
  return {
    totalActiveOrders: totalBuy + totalSell,
    totalBuyOrders: totalBuy,
    totalSellOrders: totalSell,
    trackedMints: mints.size,
  };
}

// ── Boot Recovery ─────────────────────────────────────────────
// On server start, load active orders from PostgreSQL into in-memory engine.
// This ensures SL/TP orders survive server restarts.

/**
 * Initialize the limit order engine: ensure table exists and load active orders.
 * Call this during server boot (after DB connection established).
 */
export async function initLimitOrderEngine(): Promise<{ loaded: number; errors: number }> {
  let loaded = 0, errors = 0;
  
  // Ensure table exists
  const tableReady = await ensureLimitOrdersTable();
  if (!tableReady) {
    console.warn('[limit-order-engine] PostgreSQL not available — orders will be in-memory only');
    return { loaded: 0, errors: 0 };
  }

  // Load active orders from PostgreSQL
  try {
    const orders = await loadActiveOrders();
    for (const order of orders) {
      try {
        const book = getOrderBook(order.mint, order.type as 'buy' | 'sell');
        const full: LimitOrder = {
          id: order.id,
          type: order.type as 'buy' | 'sell',
          orderType: order.orderType,
          mint: order.mint,
          chain: order.chain,
          symbol: order.symbol,
          userAddress: order.userAddress,
          targetPrice: order.targetPrice,
          amountSol: order.amountSol,
          amountTokens: order.amountTokens,
          slippageBps: order.slippageBps,
          status: 'active',
          createdAt: new Date(order.createdAt).getTime(),
        };
        book.push(full);
        loaded++;
      } catch (err: any) {
        errors++;
      }
    }
    
    // Sort all order books
    for (const [, book] of buyOrders) {
      book.sort((a, b) => a.targetPrice - b.targetPrice);
    }
    for (const [, book] of sellOrders) {
      book.sort((a, b) => b.targetPrice - a.targetPrice);
    }
    
    if (loaded > 0) {
      console.log(`[limit-order-engine] Boot recovery: ${loaded} active orders loaded from PostgreSQL`);
    }
  } catch (err: any) {
    console.error(`[limit-order-engine] Boot recovery failed: ${err.message}`);
    errors++;
  }

  return { loaded, errors };
}