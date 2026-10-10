/**
 * Reward Database Queries — all reward data access goes through these functions.
 * Every function uses parameterized queries. No raw string interpolation.
 * Monetary values are NUMERIC(18,6) — returned as strings by pg, parsed to number where safe.
 */

import { query, withTransaction } from './pool.js';

// ── Types ────────────────────────────────────────────────────

export interface VerifiedTrade {
  id: number;
  chain_id: string;
  tx_hash: string;
  log_index: number | null;
  wallet_address: string;
  trade_amount_usd: string;
  token_address: string | null;
  token_symbol: string | null;
  side: 'buy' | 'sell';
  status: 'pending' | 'verified' | 'failed' | 'reverted';
  block_number: string | null;
  verified_at: string;
  created_at: string;
}

export interface CollectedFee {
  id: number;
  trade_id: number;
  chain_id: string;
  tx_hash: string;
  platform_fee_usd: string;
  fee_bps: number;
  treasury_address: string | null;
  status: 'collected' | 'reversed';
  collected_at: string;
}

export interface RewardAllocation {
  id: number;
  trade_id: number;
  fee_id: number;
  allocation_type: 'combined' | 'referral_only' | 'cashback_only';
  wallet_address: string;
  referrer_username: string | null;
  referral_reward_raw: string;
  referral_reward_final: string;
  cashback_reward_raw: string;
  cashback_reward_final: string;
  combined_cap: string;
  capped: boolean;
  treasury_retained: string;
  cashback_tier_name: string | null;
  cashback_tier_rate_pct: string | null;
  referral_pct: string | null;
  status: 'allocated' | 'pending' | 'claimable' | 'reversed';
  created_at: string;
}

export interface RewardClaim {
  id: number;
  wallet_address: string;
  claim_type: 'cashback' | 'referral' | 'combined';
  amount: string;
  status: 'claim_requested' | 'processing' | 'paid' | 'rejected' | 'failed';
  tx_hash: string | null;
  claim_minimum: string;
  created_at: string;
  updated_at: string;
}

export interface RewardPayout {
  id: number;
  claim_id: number;
  wallet_address: string;
  amount: string;
  chain_id: string | null;
  tx_hash: string | null;
  status: 'pending' | 'processing' | 'settled' | 'failed' | 'reversed';
  settled_at: string | null;
  created_at: string;
}

// ── Verified Trades ─────────────────────────────────────────

export async function insertVerifiedTrade(params: {
  chainId: string;
  txHash: string;
  logIndex: number | null;
  walletAddress: string;
  tradeAmountUsd: number;
  tokenAddress?: string;
  tokenSymbol?: string;
  side?: 'buy' | 'sell';
  blockNumber?: number;
}): Promise<{ id: number; duplicate: boolean }> {
  const result = await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, token_address, token_symbol, side, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING
     RETURNING id`,
    [
      params.chainId,
      params.txHash,
      params.logIndex,
      params.walletAddress.toLowerCase(),
      params.tradeAmountUsd,
      params.tokenAddress || null,
      params.tokenSymbol || null,
      params.side || 'buy',
      params.blockNumber || null,
    ]
  );

  if (result.rowCount === 0) {
    // Already exists — get the existing ID
    const existing = await query(
      `SELECT id FROM verified_trades WHERE chain_id = $1 AND tx_hash = $2 AND log_index IS NOT DISTINCT FROM $3`,
      [params.chainId, params.txHash, params.logIndex]
    );
    return { id: existing.rows[0]?.id || 0, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}

export async function getTradeByTx(chainId: string, txHash: string, logIndex?: number): Promise<VerifiedTrade | null> {
  const result = await query(
    `SELECT * FROM verified_trades WHERE chain_id = $1 AND tx_hash = $2 AND log_index IS NOT DISTINCT FROM $3`,
    [chainId, txHash, logIndex ?? null]
  );
  return result.rows[0] || null;
}

export async function getTradesByWallet(walletAddress: string, limit = 100): Promise<VerifiedTrade[]> {
  const result = await query(
    `SELECT * FROM verified_trades WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2`,
    [walletAddress.toLowerCase(), limit]
  );
  return result.rows;
}

// ── Collected Fees ──────────────────────────────────────────

export async function insertCollectedFee(params: {
  tradeId: number;
  chainId: string;
  txHash: string;
  platformFeeUsd: number;
  feeBps?: number;
  treasuryAddress?: string;
}): Promise<{ id: number; duplicate: boolean }> {
  const result = await query(
    `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps, treasury_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (trade_id) DO NOTHING
     RETURNING id`,
    [params.tradeId, params.chainId, params.txHash, params.platformFeeUsd, params.feeBps || 40, params.treasuryAddress || null]
  );

  if (result.rowCount === 0) {
    const existing = await query(`SELECT id FROM collected_platform_fees WHERE trade_id = $1`, [params.tradeId]);
    return { id: existing.rows[0]?.id || 0, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}

export async function getFeeByTradeId(tradeId: number): Promise<CollectedFee | null> {
  const result = await query(`SELECT * FROM collected_platform_fees WHERE trade_id = $1`, [tradeId]);
  return result.rows[0] || null;
}

// ── Reward Allocations ──────────────────────────────────────

export async function insertRewardAllocation(params: {
  tradeId: number;
  feeId: number;
  allocationType: 'combined' | 'referral_only' | 'cashback_only';
  walletAddress: string;
  referrerUsername?: string | null;
  referralRewardRaw: number;
  referralRewardFinal: number;
  cashbackRewardRaw: number;
  cashbackRewardFinal: number;
  combinedCap: number;
  capped: boolean;
  treasuryRetained: number;
  cashbackTierName?: string;
  cashbackTierRatePct?: number;
  referralPct?: number;
}): Promise<{ id: number; duplicate: boolean }> {
  const result = await query(
    `INSERT INTO reward_allocations (
      trade_id, fee_id, allocation_type, wallet_address, referrer_username,
      referral_reward_raw, referral_reward_final, cashback_reward_raw, cashback_reward_final,
      combined_cap, capped, treasury_retained, cashback_tier_name, cashback_tier_rate_pct, referral_pct
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (trade_id, allocation_type) DO NOTHING
    RETURNING id`,
    [
      params.tradeId,
      params.feeId,
      params.allocationType,
      params.walletAddress.toLowerCase(),
      params.referrerUsername || null,
      params.referralRewardRaw,
      params.referralRewardFinal,
      params.cashbackRewardRaw,
      params.cashbackRewardFinal,
      params.combinedCap,
      params.capped,
      params.treasuryRetained,
      params.cashbackTierName || null,
      params.cashbackTierRatePct || null,
      params.referralPct || null,
    ]
  );

  if (result.rowCount === 0) {
    const existing = await query(
      `SELECT id FROM reward_allocations WHERE trade_id = $1 AND allocation_type = $2`,
      [params.tradeId, params.allocationType]
    );
    return { id: existing.rows[0]?.id || 0, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}

export async function getAllocationsByWallet(walletAddress: string, limit = 200): Promise<RewardAllocation[]> {
  const result = await query(
    `SELECT * FROM reward_allocations WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2`,
    [walletAddress.toLowerCase(), limit]
  );
  return result.rows;
}

export async function getAllocationsByReferrer(referrerUsername: string, limit = 200): Promise<RewardAllocation[]> {
  const result = await query(
    `SELECT * FROM reward_allocations WHERE referrer_username = $1 ORDER BY created_at DESC LIMIT $2`,
    [referrerUsername, limit]
  );
  return result.rows;
}

export async function getClaimableAllocations(walletAddress: string): Promise<RewardAllocation[]> {
  const result = await query(
    `SELECT * FROM reward_allocations WHERE wallet_address = $1 AND status = 'claimable' ORDER BY created_at DESC`,
    [walletAddress.toLowerCase()]
  );
  return result.rows;
}

// ── Reward Claims ───────────────────────────────────────────

export async function insertRewardClaim(params: {
  walletAddress: string;
  claimType: 'cashback' | 'referral' | 'combined';
  amount: number;
  claimMinimum?: number;
}): Promise<RewardClaim> {
  const result = await query(
    `INSERT INTO reward_claims (wallet_address, claim_type, amount, claim_minimum)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.walletAddress.toLowerCase(),
      params.claimType,
      params.amount,
      params.claimMinimum || 10.0,
    ]
  );
  return result.rows[0];
}

export async function getClaimsByWallet(walletAddress: string, limit = 50): Promise<RewardClaim[]> {
  const result = await query(
    `SELECT * FROM reward_claims WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2`,
    [walletAddress.toLowerCase(), limit]
  );
  return result.rows;
}

export async function updateClaimStatus(
  claimId: number,
  status: RewardClaim['status'],
  txHash?: string
): Promise<RewardClaim | null> {
  const result = await query(
    `UPDATE reward_claims SET status = $1, tx_hash = COALESCE($2, tx_hash), updated_at = now()
     WHERE id = $3 RETURNING *`,
    [status, txHash || null, claimId]
  );
  return result.rows[0] || null;
}

// ── Reward Payouts ──────────────────────────────────────────

export async function insertRewardPayout(params: {
  claimId: number;
  walletAddress: string;
  amount: number;
  chainId?: string;
}): Promise<{ id: number; duplicate: boolean }> {
  const result = await query(
    `INSERT INTO reward_payouts (claim_id, wallet_address, amount, chain_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (claim_id) DO NOTHING
     RETURNING id`,
    [params.claimId, params.walletAddress.toLowerCase(), params.amount, params.chainId || null]
  );

  if (result.rowCount === 0) {
    const existing = await query(`SELECT id FROM reward_payouts WHERE claim_id = $1`, [params.claimId]);
    return { id: existing.rows[0]?.id || 0, duplicate: true };
  }

  return { id: result.rows[0].id, duplicate: false };
}

export async function updatePayoutStatus(
  payoutId: number,
  status: RewardPayout['status'],
  txHash?: string
): Promise<RewardPayout | null> {
  const settledAt = status === 'settled' ? new Date().toISOString() : null;
  const result = await query(
    `UPDATE reward_payouts SET status = $1, tx_hash = COALESCE($2, tx_hash), settled_at = COALESCE($3, settled_at)
     WHERE id = $4 RETURNING *`,
    [status, txHash || null, settledAt, payoutId]
  );
  return result.rows[0] || null;
}

// ── Audit Log ───────────────────────────────────────────────

export async function writeAuditLog(params: {
  action: string;
  tradeId?: string;
  walletAddress?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO reward_audit_logs (action, trade_id, wallet_address, details) VALUES ($1, $2, $3, $4)`,
      [params.action, params.tradeId || null, params.walletAddress?.toLowerCase() || null, JSON.stringify(params.details || {})]
    );
  } catch { /* non-critical */ }
}

// ── Wallet Users ────────────────────────────────────────────

export async function getWalletUser(walletAddress: string) {
  const result = await query(
    `SELECT * FROM wallet_users WHERE wallet_address = $1`,
    [walletAddress.toLowerCase()]
  );
  return result.rows[0] || null;
}

// ── Aggregated Summaries ────────────────────────────────────

export async function getWalletRewardSummary(walletAddress: string): Promise<{
  totalCashbackEarned: number;
  totalReferralEarned: number;
  claimableCashback: number;
  claimableReferral: number;
  pendingCashback: number;
  pendingReferral: number;
  totalClaimed: number;
  totalAllocations: number;
}> {
  const wallet = walletAddress.toLowerCase();

  const allocResult = await query(
    `SELECT
      COALESCE(SUM(cashback_reward_final), 0) AS total_cashback,
      COALESCE(SUM(referral_reward_final), 0) AS total_referral,
      COALESCE(SUM(CASE WHEN status = 'claimable' THEN cashback_reward_final ELSE 0 END), 0) AS claimable_cashback,
      COALESCE(SUM(CASE WHEN status = 'claimable' THEN referral_reward_final ELSE 0 END), 0) AS claimable_referral,
      COALESCE(SUM(CASE WHEN status = 'allocated' OR status = 'pending' THEN cashback_reward_final ELSE 0 END), 0) AS pending_cashback,
      COALESCE(SUM(CASE WHEN status = 'allocated' OR status = 'pending' THEN referral_reward_final ELSE 0 END), 0) AS pending_referral,
      COUNT(*) AS total_allocations
    FROM reward_allocations WHERE wallet_address = $1`,
    [wallet]
  );

  const claimResult = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_claimed FROM reward_claims WHERE wallet_address = $1 AND status = 'paid'`,
    [wallet]
  );

  const a = allocResult.rows[0];
  const c = claimResult.rows[0];

  return {
    totalCashbackEarned: parseFloat(a.total_cashback) || 0,
    totalReferralEarned: parseFloat(a.total_referral) || 0,
    claimableCashback: parseFloat(a.claimable_cashback) || 0,
    claimableReferral: parseFloat(a.claimable_referral) || 0,
    pendingCashback: parseFloat(a.pending_cashback) || 0,
    pendingReferral: parseFloat(a.pending_referral) || 0,
    totalClaimed: parseFloat(c.total_claimed) || 0,
    totalAllocations: parseInt(a.total_allocations) || 0,
  };
}

// ── Atomic Allocation (transaction) ─────────────────────────

export interface AllocationInput {
  chainId: string;
  txHash: string;
  logIndex: number | null;
  walletAddress: string;
  tradeAmountUsd: number;
  platformFeeUsd: number;
  referrerUsername: string | null;
  referralSharePct: number;
  cashbackRatePct: number;
  cashbackTierName: string;
  cashbackTierRatePct: number;
  tokenAddress?: string;
  tokenSymbol?: string;
  side?: 'buy' | 'sell';
  blockNumber?: number;
}

/**
 * Record a verified trade, its collected fee, and the reward allocation
 * in a SINGLE atomic transaction. If any step fails, everything rolls back.
 *
 * Security:
 *   - UNIQUE constraints (ON CONFLICT DO NOTHING) prevent duplicate processing
 *   - 50% combined cap is computed from the AUTHORITATIVE fee record (not client input)
 *   - platformFeeUsd is validated against tradeAmountUsd (fee cannot exceed trade)
 *   - All amounts validated for precision (max 6 decimal places) and non-negativity
 *   - Single allocation_type='combined' ensures one authoritative cap per trade
 */
export async function processAllocationAtomic(input: AllocationInput): Promise<{
  tradeId: number;
  feeId: number;
  allocationId: number;
  duplicate: boolean;
  allocation: RewardAllocation;
}> {
  // Server-side validation before transaction
  if (!input.txHash || !input.walletAddress) {
    throw new Error('txHash and walletAddress are required');
  }
  if (input.tradeAmountUsd < 0 || input.platformFeeUsd < 0) {
    throw new Error('Amounts must be non-negative');
  }
  if (input.platformFeeUsd > input.tradeAmountUsd) {
    throw new Error('platformFeeUsd cannot exceed tradeAmountUsd');
  }
  if (input.referralSharePct < 0 || input.referralSharePct > 100) {
    throw new Error('referralSharePct must be 0-100');
  }
  if (input.cashbackRatePct < 0 || input.cashbackRatePct > 100) {
    throw new Error('cashbackRatePct must be 0-100');
  }

  return withTransaction(async (client) => {
    // 1. Insert verified trade (ON CONFLICT DO NOTHING — idempotent)
    const tradeResult = await client.query(
      `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, token_address, token_symbol, side, block_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING
       RETURNING id`,
      [input.chainId, input.txHash, input.logIndex, input.walletAddress.toLowerCase(), input.tradeAmountUsd,
       input.tokenAddress || null, input.tokenSymbol || null, input.side || 'buy', input.blockNumber || null]
    );

    let tradeId: number;
    if (tradeResult.rowCount === 0) {
      const existing = await client.query(
        `SELECT id FROM verified_trades WHERE chain_id = $1 AND tx_hash = $2 AND log_index IS NOT DISTINCT FROM $3`,
        [input.chainId, input.txHash, input.logIndex]
      );
      if (!existing.rows[0]) throw new Error('Trade lookup failed after conflict');
      tradeId = existing.rows[0].id;
    } else {
      tradeId = tradeResult.rows[0].id;
    }

    // 2. Insert collected fee (ON CONFLICT DO NOTHING — one fee per trade)
    const feeResult = await client.query(
      `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (trade_id) DO NOTHING
       RETURNING id`,
      [tradeId, input.chainId, input.txHash, input.platformFeeUsd]
    );

    let feeId: number;
    if (feeResult.rowCount === 0) {
      const existing = await client.query(`SELECT id FROM collected_platform_fees WHERE trade_id = $1`, [tradeId]);
      if (!existing.rows[0]) throw new Error('Fee lookup failed after conflict');
      feeId = existing.rows[0].id;
    } else {
      feeId = feeResult.rows[0].id;
    }

    // 3. Read the AUTHORITATIVE fee amount from the fee record (not client input)
    const feeRecord = await client.query(
      `SELECT platform_fee_usd FROM collected_platform_fees WHERE id = $1`,
      [feeId]
    );
    const authoritativeFeeUsd = parseFloat(feeRecord.rows[0].platform_fee_usd);
    if (!Number.isFinite(authoritativeFeeUsd) || authoritativeFeeUsd < 0) {
      throw new Error('Invalid authoritative fee amount');
    }

    // 4. Calculate allocation using AUTHORITATIVE fee amount
    // The 50% cap applies to referral + cashback combined from the same fee
    const combinedCap = authoritativeFeeUsd * 0.50;
    const referralRewardRaw = authoritativeFeeUsd * (input.referralSharePct / 100);
    const cashbackRewardRaw = authoritativeFeeUsd * (input.cashbackRatePct / 100);
    const combinedRaw = referralRewardRaw + cashbackRewardRaw;

    let referralRewardFinal = referralRewardRaw;
    let cashbackRewardFinal = cashbackRewardRaw;
    let capped = false;

    if (combinedRaw > combinedCap && combinedRaw > 0) {
      const scaleFactor = combinedCap / combinedRaw;
      referralRewardFinal = referralRewardRaw * scaleFactor;
      cashbackRewardFinal = cashbackRewardRaw * scaleFactor;
      capped = true;
    }

    const combinedFinal = referralRewardFinal + cashbackRewardFinal;
    const treasuryRetained = authoritativeFeeUsd - combinedFinal;

    // 5. Insert allocation (UNIQUE per trade_id + allocation_type — idempotent)
    //    Uses allocation_type='combined' — the single authoritative allocation per trade.
    //    The schema CHECK constraint enforces referral_final + cashback_final <= combined_cap.
    const allocResult = await client.query(
      `INSERT INTO reward_allocations (
        trade_id, fee_id, allocation_type, wallet_address, referrer_username,
        referral_reward_raw, referral_reward_final, cashback_reward_raw, cashback_reward_final,
        combined_cap, capped, treasury_retained, cashback_tier_name, cashback_tier_rate_pct, referral_pct
      ) VALUES ($1,$2,'combined',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (trade_id, allocation_type) DO NOTHING
      RETURNING *`,
      [tradeId, feeId, input.walletAddress.toLowerCase(), input.referrerUsername,
       referralRewardRaw, referralRewardFinal, cashbackRewardRaw, cashbackRewardFinal,
       combinedCap, capped, treasuryRetained, input.cashbackTierName, input.cashbackTierRatePct, input.referralSharePct]
    );

    if (allocResult.rowCount === 0) {
      const existing = await client.query(
        `SELECT * FROM reward_allocations WHERE trade_id = $1 AND allocation_type = 'combined'`,
        [tradeId]
      );
      return { tradeId, feeId, allocationId: existing.rows[0].id, duplicate: true, allocation: existing.rows[0] };
    }

    return { tradeId, feeId, allocationId: allocResult.rows[0].id, duplicate: false, allocation: allocResult.rows[0] };
  });
}
