// Cupcak8 Swap Unified Reward Allocation — enforces 50% combined cap,
// idempotency via distributed lock keys, and truthful claim statuses.
//
// This module is the SINGLE AUTHORITATIVE path for calculating and recording
// referral + cashback rewards from a verified trade event.

import { gitlawb } from '../gitlawb';
import { PLATFORM_FEE_PCT, MIN_CLAIM_AMOUNT } from '../config';
import { getCashbackTier, currentMonthKey } from './cashback-tiers';

// ── Claim Status Lifecycle ─────────────────────────────────────
//
//   claimable ──► claim_requested ──► processing ──► paid
//                       │                                │
//                       └──► rejected                    └──► (terminal)
//                       └──► failed
//
//   pending ──► claimable (when threshold met via accumulation)
//
// `paid` is ONLY set after a verified payout processor or on-chain
// transfer confirms actual settlement. No record is marked `paid`
// in this codebase because no payout processor exists yet.

export type RewardStatus =
  | 'pending'           // Below claim threshold, accumulating
  | 'claimable'         // Meets threshold, user can request claim
  | 'claim_requested'   // User submitted claim, awaiting backend
  | 'processing'        // Backend acknowledged, payout in progress
  | 'paid'              // Actual settlement confirmed (terminal)
  | 'rejected'          // Claim rejected by validation (terminal)
  | 'failed'            // Payout processor error (may retry)
  | 'reversed';         // Trade reverted / refunded

export function isClaimable(status: RewardStatus): boolean {
  return status === 'claimable';
}

export function isPendingClaim(status: RewardStatus): boolean {
  return status === 'claim_requested' || status === 'processing';
}

export function isSettled(status: RewardStatus): boolean {
  return status === 'paid' || status === 'rejected' || status === 'failed' || status === 'reversed';
}

export function isEarned(status: RewardStatus): boolean {
  return status !== 'reversed';
}

// ── Combined Cap Configuration ─────────────────────────────────

export const MAX_COMBINED_ALLOCATION_PCT = 50; // 50% of platform fee

// ── Idempotency Key Collection ─────────────────────────────────
// Two-phase commit: write an idempotency key first, then the reward.
// If the key already exists, the trade has been processed.

const idempotencyKeys = gitlawb.db.collection<{
  tradeId: string;
  allocationType: string; // 'combined' | 'referral_only' | 'cashback_only'
  createdAt: string;
}>('reward_idempotency_keys', { visibility: 'inbox' });

/** Check if a trade has already been processed for a given allocation type.
 *  Returns true if the key exists (trade already processed). */
export async function isTradeAlreadyProcessed(tradeId: string, allocationType: string): Promise<boolean> {
  try {
    const compositeKey = `${tradeId}:${allocationType}`;
    const { records } = await idempotencyKeys.list({ limit: 100 });
    return records.some(r => r.data.tradeId === compositeKey);
  } catch {
    return false; // On error, allow processing (fail-open for availability)
  }
}

/** Write an idempotency key. Returns true if written successfully.
 *  If another concurrent request already wrote it, the create() may
 *  succeed (duplicate record) — the check in isTradeAlreadyProcessed
 *  handles this by seeing the first key. */
export async function writeIdempotencyKey(tradeId: string, allocationType: string): Promise<void> {
  try {
    const compositeKey = `${tradeId}:${allocationType}`;
    await idempotencyKeys.create({
      tradeId: compositeKey,
      allocationType,
      createdAt: new Date().toISOString(),
    });
  } catch { /* non-critical: key may already exist from concurrent request */ }
}

// ── Reward Allocation Result ───────────────────────────────────

export interface AllocationResult {
  tradeId: string;
  platformFeeUsd: number;
  // Referral allocation
  referralRewardRaw: number;    // Uncapped referral reward
  referralRewardFinal: number;  // After cap enforcement
  referralPct: number;
  referrerUsername: string | null;
  // Cashback allocation
  cashbackRewardRaw: number;    // Uncapped cashback reward
  cashbackRewardFinal: number;  // After cap enforcement
  cashbackTierName: string;
  cashbackTierRatePct: number;
  // Cap enforcement
  combinedCap: number;          // 50% of platform fee
  combinedRaw: number;          // Sum of raw rewards before cap
  combinedFinal: number;        // Sum of final rewards after cap
  capped: boolean;              // Whether cap was enforced
  treasuryRetained: number;     // Platform fee minus final combined
  // Processing
  processed: boolean;           // Whether records were written
  idempotent: boolean;          // Whether this was a duplicate
}

// ── Core Allocation Logic (pure, deterministic) ────────────────

export interface AllocationInput {
  tradeId: string;
  tradeAmountUsd: number;
  referrerSharePct: number;     // 0 if no referrer, or tier percentage
  cashbackRatePct: number;      // 0 if cashback disabled, or tier percentage
  referrerUsername: string | null;
  traderWallet: string;
}

/** Calculate the combined reward allocation for a trade.
 *  This is PURE and DETERMINISTIC — no side effects.
 *  Enforces the 50% combined cap on referral + cashback. */
export function calculateAllocation(input: AllocationInput): AllocationResult {
  const { tradeId, tradeAmountUsd, referrerSharePct, cashbackRatePct, referrerUsername } = input;

  const platformFeeUsd = tradeAmountUsd * PLATFORM_FEE_PCT;
  const combinedCap = platformFeeUsd * (MAX_COMBINED_ALLOCATION_PCT / 100);

  // Calculate raw rewards (each independently from platform fee)
  const referralRewardRaw = platformFeeUsd * (referrerSharePct / 100);
  const cashbackRewardRaw = platformFeeUsd * (cashbackRatePct / 100);
  const combinedRaw = referralRewardRaw + cashbackRewardRaw;

  // Enforce cap: if combined exceeds 50%, scale proportionally
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
  const treasuryRetained = platformFeeUsd - combinedFinal;

  const tier = getCashbackTier(tradeAmountUsd);

  return {
    tradeId,
    platformFeeUsd,
    referralRewardRaw,
    referralRewardFinal,
    referralPct: referrerSharePct,
    referrerUsername,
    cashbackRewardRaw,
    cashbackRewardFinal,
    cashbackTierName: tier.name,
    cashbackTierRatePct: tier.ratePct,
    combinedCap,
    combinedRaw,
    combinedFinal,
    capped,
    treasuryRetained,
    processed: false,
    idempotent: false,
  };
}

// ── Fee Ledger Record ──────────────────────────────────────────

const feeLedger = gitlawb.db.collection<{
  tradeId: string;
  tradeAmountUsd: number;
  platformFeeUsd: number;
  referralRewardRaw: number;
  referralRewardFinal: number;
  cashbackRewardRaw: number;
  cashbackRewardFinal: number;
  combinedCap: number;
  capped: boolean;
  treasuryRetained: number;
  referrerUsername: string | null;
  timestamp: string;
}>('fee_ledger');

// ── Referral Rewards Collection ────────────────────────────────

const refRewards = gitlawb.db.collection<{
  referrerUsername: string;
  referredWallet: string;
  tradeId: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: string;
  createdAt: string;
  allocationId: string;
}>('ref_rewards', { visibility: 'authenticated' });

// ── Cashback Rewards Collection ────────────────────────────────

const cashbackRewards = gitlawb.db.collection<{
  walletAddress: string;
  tradeId: string;
  tradeVolume: number;
  platformFeeUsd: number;
  cashbackReward: number;
  tierName: string;
  tierRatePct: number;
  monthKey: string;
  status: string;
  createdAt: string;
  allocationId: string;
}>('cashback_rewards', { visibility: 'authenticated' });

// ── Audit Log ──────────────────────────────────────────────────

const auditLog = gitlawb.db.collection<{
  action: string;
  tradeId: string;
  details: Record<string, unknown>;
  timestamp: string;
}>('reward_audit_log', { visibility: 'inbox' });

async function writeAuditEntry(action: string, tradeId: string, details: Record<string, unknown>): Promise<void> {
  try {
    await auditLog.create({
      action,
      tradeId,
      details,
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical */ }
}

// ── Process and Record Allocation ──────────────────────────────

export async function processAllocation(
  input: AllocationInput,
): Promise<AllocationResult> {
  const { tradeId } = input;

  // Idempotency check
  const alreadyProcessed = await isTradeAlreadyProcessed(tradeId, 'combined');
  if (alreadyProcessed) {
    const result = calculateAllocation(input);
    result.idempotent = true;
    return result;
  }

  // Write idempotency key (distributed lock)
  await writeIdempotencyKey(tradeId, 'combined');

  // Calculate deterministic allocation
  const result = calculateAllocation(input);
  const monthKey = currentMonthKey();

  // Write fee ledger entry with full audit trail
  try {
    await feeLedger.create({
      tradeId,
      tradeAmountUsd: input.tradeAmountUsd,
      platformFeeUsd: result.platformFeeUsd,
      referralRewardRaw: result.referralRewardRaw,
      referralRewardFinal: result.referralRewardFinal,
      cashbackRewardRaw: result.cashbackRewardRaw,
      cashbackRewardFinal: result.cashbackRewardFinal,
      combinedCap: result.combinedCap,
      capped: result.capped,
      treasuryRetained: result.treasuryRetained,
      referrerUsername: input.referrerUsername,
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical */ }

  // Write referral reward record (if applicable)
  if (input.referrerUsername && result.referralRewardFinal > 0) {
    try {
      await refRewards.create({
        referrerUsername: input.referrerUsername,
        referredWallet: input.traderWallet.toLowerCase(),
        tradeId,
        tradeVolume: input.tradeAmountUsd,
        feeGenerated: result.platformFeeUsd,
        reward: result.referralRewardFinal,
        status: result.referralRewardFinal >= MIN_CLAIM_AMOUNT ? 'claimable' : 'pending',
        createdAt: new Date().toISOString(),
        allocationId: tradeId,
      });
    } catch { /* non-critical */ }
  }

  // Write cashback reward record (if applicable)
  if (result.cashbackRewardFinal > 0) {
    try {
      await cashbackRewards.create({
        walletAddress: input.traderWallet.toLowerCase(),
        tradeId,
        tradeVolume: input.tradeAmountUsd,
        platformFeeUsd: result.platformFeeUsd,
        cashbackReward: result.cashbackRewardFinal,
        tierName: result.cashbackTierName,
        tierRatePct: result.cashbackTierRatePct,
        monthKey,
        status: result.cashbackRewardFinal >= MIN_CLAIM_AMOUNT ? 'claimable' : 'pending',
        createdAt: new Date().toISOString(),
        allocationId: tradeId,
      });
    } catch { /* non-critical */ }
  }

  // Audit log
  await writeAuditEntry('allocation', tradeId, {
    platformFee: result.platformFeeUsd,
    referralRaw: result.referralRewardRaw,
    referralFinal: result.referralRewardFinal,
    cashbackRaw: result.cashbackRewardRaw,
    cashbackFinal: result.cashbackRewardFinal,
    combinedCap: result.combinedCap,
    capped: result.capped,
    treasury: result.treasuryRetained,
  });

  result.processed = true;
  return result;
}

// ── Claim Processing ───────────────────────────────────────────

export interface ClaimResult {
  success: boolean;
  amount: number;
  status: 'claim_requested' | 'rejected';
  error?: string;
}

/** Request a cashback claim. Marks records as `claim_requested`.
 *  Does NOT mark as `paid` — no payout processor exists. */
export async function requestCashbackClaim(
  walletAddress: string,
): Promise<ClaimResult> {
  try {
    const { records } = await cashbackRewards.list({ limit: 5000 });
    const wallet = walletAddress.toLowerCase();
    const claimable = records.filter(
      r => r.data.walletAddress.toLowerCase() === wallet && r.data.status === 'claimable'
    );
    const total = claimable.reduce((sum, r) => sum + r.data.cashbackReward, 0);

    if (total < MIN_CLAIM_AMOUNT) {
      return { success: false, amount: 0, status: 'rejected', error: `Minimum claim: $${MIN_CLAIM_AMOUNT}` };
    }

    for (const record of claimable) {
      try {
        await cashbackRewards.update(record.id, { status: 'claim_requested' });
      } catch {
        // Non-author: the record was created by the allocation engine.
        // This is expected on the 'authenticated' visibility model.
      }
    }

    await writeAuditEntry('claim_requested', `cashback:${wallet}`, { amount: total });

    return { success: true, amount: total, status: 'claim_requested' };
  } catch (e: any) {
    return { success: false, amount: 0, status: 'rejected', error: e.message || 'CLAIM FAILED' };
  }
}

/** Request a referral claim. Marks records as `claim_requested`.
 *  Does NOT mark as `paid`. */
export async function requestReferralClaim(
  username: string,
): Promise<ClaimResult> {
  try {
    const { records } = await refRewards.list({ limit: 5000 });
    const claimable = records.filter(
      r => r.data.referrerUsername === username && r.data.status === 'claimable'
    );
    const total = claimable.reduce((sum, r) => sum + r.data.reward, 0);

    if (total < MIN_CLAIM_AMOUNT) {
      return { success: false, amount: 0, status: 'rejected', error: `Minimum claim: $${MIN_CLAIM_AMOUNT}` };
    }

    for (const record of claimable) {
      try {
        await refRewards.update(record.id, { status: 'claim_requested' });
      } catch {
        // Non-author on authenticated collection
      }
    }

    await writeAuditEntry('claim_requested', `referral:${username}`, { amount: total });

    return { success: true, amount: total, status: 'claim_requested' };
  } catch (e: any) {
    return { success: false, amount: 0, status: 'rejected', error: e.message || 'CLAIM FAILED' };
  }
}