/**
 * Limit Orders — Persistent PostgreSQL storage for SL/TP orders.
 * 
 * Orders survive server restarts. On boot: load active orders from
 * PostgreSQL → seed limit-order-engine → price matching continues.
 * 
 * During runtime: every new order is written to both in-memory engine
 * AND PostgreSQL via this module.
 */

import { query, isDbConfigured } from './pool.js';

function log(level: 'info' | 'warn' | 'error', msg: string) {
  const ts = new Date().toISOString();
  console[level](`[${ts}] [limit-orders] ${msg}`);
}

export interface LimitOrderRecord {
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
  createdAt: string;
  triggeredAt?: string;
  executedAt?: string;
  txHash?: string;
  bundleId?: string;
  error?: string;
}

/**
 * Ensure the limit_orders table exists (idempotent migration).
 */
export async function ensureLimitOrdersTable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS limit_orders (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        order_type TEXT NOT NULL,
        mint TEXT NOT NULL,
        chain TEXT NOT NULL DEFAULT 'sol',
        symbol TEXT NOT NULL DEFAULT '???',
        user_address TEXT NOT NULL,
        target_price NUMERIC NOT NULL,
        amount_sol NUMERIC,
        amount_tokens NUMERIC,
        slippage_bps INTEGER NOT NULL DEFAULT 500,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        triggered_at TIMESTAMPTZ,
        executed_at TIMESTAMPTZ,
        tx_hash TEXT,
        bundle_id TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_limit_orders_mint ON limit_orders(mint);
      CREATE INDEX IF NOT EXISTS idx_limit_orders_status ON limit_orders(status);
      CREATE INDEX IF NOT EXISTS idx_limit_orders_user ON limit_orders(user_address);
      CREATE INDEX IF NOT EXISTS idx_limit_orders_active ON limit_orders(mint, status, target_price) WHERE status = 'active';
    `);
    return true;
  } catch (err: any) {
    log('error', `Failed to create limit_orders table: ${err.message}`);
    return false;
  }
}

/**
 * Persist a new order to PostgreSQL.
 */
export async function persistOrder(order: {
  id: string; type: 'buy' | 'sell'; orderType: string; mint: string;
  chain: string; symbol: string; userAddress: string; targetPrice: number;
  amountSol?: number; amountTokens?: number; slippageBps: number;
}): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await query(
      `INSERT INTO limit_orders (id, type, order_type, mint, chain, symbol, user_address, target_price, amount_sol, amount_tokens, slippage_bps, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [order.id, order.type, order.orderType, order.mint, order.chain, order.symbol,
       order.userAddress, order.targetPrice, order.amountSol ?? null, order.amountTokens ?? null, order.slippageBps]
    );
  } catch (err: any) {
    log('error', `Failed to persist order ${order.id}: ${err.message}`);
  }
}

/**
 * Update order status in PostgreSQL.
 */
export async function updateOrderStatus(orderId: string, status: string, txHash?: string, error?: string): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const now = new Date().toISOString();
    if (status === 'triggered') {
      await query(`UPDATE limit_orders SET status = $1, triggered_at = $2 WHERE id = $3`, [status, now, orderId]);
    } else if (status === 'executed') {
      await query(`UPDATE limit_orders SET status = $1, executed_at = $2, tx_hash = $3 WHERE id = $3`, [status, now, txHash]);
    } else if (status === 'failed') {
      await query(`UPDATE limit_orders SET status = $1, error = $2, executed_at = $3 WHERE id = $4`, [status, error, now, orderId]);
    } else {
      await query(`UPDATE limit_orders SET status = $1 WHERE id = $2`, [status, orderId]);
    }
  } catch (err: any) {
    log('error', `Failed to update order ${orderId}: ${err.message}`);
  }
}

/**
 * Load all active orders from PostgreSQL (for boot seeding).
 */
export async function loadActiveOrders(): Promise<LimitOrderRecord[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await query(
      `SELECT * FROM limit_orders WHERE status = 'active' ORDER BY created_at DESC`
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      orderType: row.order_type,
      mint: row.mint,
      chain: row.chain,
      symbol: row.symbol,
      userAddress: row.user_address,
      targetPrice: parseFloat(row.target_price),
      amountSol: row.amount_sol ? parseFloat(row.amount_sol) : undefined,
      amountTokens: row.amount_tokens ? parseFloat(row.amount_tokens) : undefined,
      slippageBps: row.slippage_bps || 500,
      status: row.status,
      createdAt: row.created_at,
      triggeredAt: row.triggered_at,
      executedAt: row.executed_at,
      txHash: row.tx_hash,
      bundleId: row.bundle_id,
      error: row.error,
    }));
  } catch (err: any) {
    log('error', `Failed to load active orders: ${err.message}`);
    return [];
  }
}

/**
 * Get orders for a specific user.
 */
export async function getUserOrders(userAddress: string, limit = 50): Promise<LimitOrderRecord[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await query(
      `SELECT * FROM limit_orders WHERE user_address = $1 ORDER BY created_at DESC LIMIT $2`,
      [userAddress, limit]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      orderType: row.order_type,
      mint: row.mint,
      chain: row.chain,
      symbol: row.symbol,
      userAddress: row.user_address,
      targetPrice: parseFloat(row.target_price),
      amountSol: row.amount_sol ? parseFloat(row.amount_sol) : undefined,
      amountTokens: row.amount_tokens ? parseFloat(row.amount_tokens) : undefined,
      slippageBps: row.slippage_bps || 500,
      status: row.status,
      createdAt: row.created_at,
      triggeredAt: row.triggered_at,
      executedAt: row.executed_at,
      txHash: row.tx_hash,
      bundleId: row.bundle_id,
      error: row.error,
    }));
  } catch (err: any) {
    log('error', `Failed to get user orders: ${err.message}`);
    return [];
  }
}

/**
 * Get active orders for a specific mint (for price tick matching).
 */
export async function getActiveOrdersForMint(mint: string): Promise<LimitOrderRecord[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await query(
      `SELECT * FROM limit_orders WHERE mint = $1 AND status = 'active' ORDER BY target_price ASC`,
      [mint]
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      orderType: row.order_type,
      mint: row.mint,
      chain: row.chain,
      symbol: row.symbol,
      userAddress: row.user_address,
      targetPrice: parseFloat(row.target_price),
      amountSol: row.amount_sol ? parseFloat(row.amount_sol) : undefined,
      amountTokens: row.amount_tokens ? parseFloat(row.amount_tokens) : undefined,
      slippageBps: row.slippage_bps || 500,
      status: row.status,
      createdAt: row.created_at,
      triggeredAt: row.triggered_at,
      executedAt: row.executed_at,
      txHash: row.tx_hash,
      bundleId: row.bundle_id,
      error: row.error,
    }));
  } catch (err: any) {
    log('error', `Failed to get active orders for ${mint}: ${err.message}`);
    return [];
  }
}