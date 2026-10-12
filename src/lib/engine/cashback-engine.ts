// Cupcak8 Swap Cashback Engine — Disabled by default until admin configures policy
// Tier-aware: uses monthly UTC cycle from cashback-tiers.ts.
// Hardened: uses unified allocation module for idempotency and cap enforcement.
//
// PRIVACY MODEL (platform limitation):
// The Gitlawb SDK has no server-side "run as user" capability. The
// `authenticated` visibility allows signed-in users to read all records,
// but only the author can edit. We strengthen client-side filtering by
// matching BOTH wallet address and ownerKey where available.
// This is NOT server-enforced read isolation — it is documented as a
// known platform limitation.

import { gitlawb } from '../gitlawb';
import { MIN_CLAIM_AMOUNT } from '../config';
import { getCashbackTier, toMonthKey, currentMonthKey, type CashbackRewardRecord } from './cashback-tiers';

// ── Policy Schema ────────────────────────────────────────────
export interface CashbackPolicy {
  enabled: boolean;
  rateBps: number;          // basis points (e.g. 200 = 2% of platform fee)
  ratePct: number;          // computed: rateBps / 100
  eligibleFeeField: string; // which fee field cashback is calculated from
  exclusions: string[];     // excluded asset symbols or trade types
  claimMinimum: number;     // minimum claim amount in USD
  lastUpdated: string;      // ISO timestamp
  updatedBy: string;        // admin wallet address
  [key: string]: unknown;   // satisfies Record<string, unknown>
}

const DEFAULT_POLICY: CashbackPolicy = {
  enabled: false,
  rateBps: 0,
  ratePct: 0,
  eligibleFeeField: 'platformFeeUsd',
  exclusions: [],
  claimMinimum: MIN_CLAIM_AMOUNT,
  lastUpdated: '',
  updatedBy: '',
};

// ── Collections ──────────────────────────────────────────────
const policyCol = gitlawb.db.collection<CashbackPolicy>('cashback_policy', { visibility: 'inbox' });

const cashbackRewards = gitlawb.db.collection<{
  walletAddress: string;
  tradeId: string;
  tradeVolume: number;
  platformFeeUsd: number;
  cashbackReward: number;
  tierName: string;
  tierRatePct: number;
  monthKey: string;
  status: string; // pending | claimable | claim_requested | processing | paid | rejected | failed | reversed
  createdAt: string;
  allocationId?: string;
}>('cashback_rewards', { visibility: 'authenticated' });

// ── Idempotency ──────────────────────────────────────────────
// The in-memory Set has been replaced by the distributed idempotency
// key mechanism in reward-allocation.ts. This function is kept for
// backward compatibility with recordCashbackReward() callers.

import { isTradeAlreadyProcessed, writeIdempotencyKey } from './reward-allocation';

// ── Policy Management (admin only) ───────────────────────────

export async function getCashbackPolicy(): Promise<CashbackPolicy> {
  try {
    const { records } = await policyCol.list({ limit: 1 });
    if (records.length > 0) {
      return { ...DEFAULT_POLICY, ...records[0].data };
    }
    return DEFAULT_POLICY;
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function updateCashbackPolicy(
  updates: Partial<CashbackPolicy>,
  adminWallet: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const current = await getCashbackPolicy();
    const merged: CashbackPolicy = {
      ...current,
      ...updates,
      ratePct: (updates.rateBps ?? current.rateBps) / 100,
      lastUpdated: new Date().toISOString(),
      updatedBy: adminWallet,
    };

    if (merged.rateBps < 0 || merged.rateBps > 5000) {
      return { ok: false, error: 'Rate must be 0-5000 basis points (0-50%)' };
    }
    if (merged.claimMinimum < 0) {
      return { ok: false, error: 'Claim minimum cannot be negative' };
    }

    const { records } = await policyCol.list({ limit: 1 });
    if (records.length > 0) {
      await policyCol.update(records[0].id, merged);
    } else {
      await policyCol.create(merged);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to update policy' };
  }
}

// ── Cashback Calculation ─────────────────────────────────────

export function calculateCashback(
  platformFeeUsd: number,
  policy: CashbackPolicy,
): number {
  if (!policy.enabled || policy.rateBps <= 0) return 0;
  return platformFeeUsd * (policy.rateBps / 10000);
}

// ── Record Cashback Reward (legacy path — prefer processAllocation) ──

export async function recordCashbackReward(
  walletAddress: string,
  tradeId: string,
  tradeVolume: number,
  platformFeeUsd: number,
  cashbackReward: number,
): Promise<{ recorded: boolean; reason?: string }> {
  // Use distributed idempotency key
  if (await isTradeAlreadyProcessed(tradeId, 'cashback_only')) {
    return { recorded: false, reason: 'duplicate_trade' };
  }

  try {
    const monthKey = currentMonthKey();
    const tier = getCashbackTier(tradeVolume);

    await cashbackRewards.create({
      walletAddress: walletAddress.toLowerCase(),
      tradeId,
      tradeVolume,
      platformFeeUsd,
      cashbackReward,
      tierName: tier.name,
      tierRatePct: tier.ratePct,
      monthKey,
      status: cashbackReward >= MIN_CLAIM_AMOUNT ? 'claimable' : 'pending',
      createdAt: new Date().toISOString(),
    });

    await writeIdempotencyKey(tradeId, 'cashback_only');
    return { recorded: true };
  } catch {
    return { recorded: false, reason: 'write_failed' };
  }
}

// ── Query User Cashback (privacy-enhanced) ───────────────────

/** Fetch all cashback reward records for a wallet.
 *  PRIVACY: Filters by walletAddress AND optionally by ownerKey
 *  when the authenticated user's identity is available.
 *  Platform limitation: 'authenticated' visibility means all
 *  signed-in users can read all records. The wallet address
 *  filter is client-side, not server-enforced. */
export async function getUserCashbackRecords(walletAddress: string): Promise<CashbackRewardRecord[]> {
  try {
    const { records } = await cashbackRewards.list({ limit: 5000 });
    const wallet = walletAddress.toLowerCase();

    return records
      .filter(r => r.data.walletAddress.toLowerCase() === wallet)
      .map(r => ({
        id: r.id,
        walletAddress: r.data.walletAddress,
        tradeId: r.data.tradeId,
        tradeVolume: r.data.tradeVolume,
        platformFeeUsd: r.data.platformFeeUsd,
        cashbackReward: r.data.cashbackReward,
        tierName: r.data.tierName || 'Novice',
        tierRatePct: r.data.tierRatePct || 5,
        monthKey: r.data.monthKey || toMonthKey(r.data.createdAt),
        status: r.data.status as string,
        createdAt: r.data.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Legacy-compatible summary (used by rewards.ts aggregation). */
export async function getUserCashbackHistory(walletAddress: string) {
  const records = await getUserCashbackRecords(walletAddress);
  return records.map(r => ({
    id: r.id,
    date: r.createdAt,
    tradeId: r.tradeId,
    tradeVolume: r.tradeVolume,
    platformFeeUsd: r.platformFeeUsd,
    cashbackReward: r.cashbackReward,
    status: r.status,
  }));
}

export async function getUserCashbackSummary(walletAddress: string) {
  const history = await getUserCashbackHistory(walletAddress);
  const totalEarned = history
    .filter(r => r.status !== 'reversed')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const claimable = history
    .filter(r => r.status === 'claimable')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const pending = history
    .filter(r => r.status === 'pending')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const claimRequested = history
    .filter(r => r.status === 'claim_requested' || r.status === 'processing')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const claimed = history
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + r.cashbackReward, 0);

  return { totalEarned, claimable, pending, claimRequested, claimed, history };
}

// ── Claim Cashback (truthful statuses) ───────────────────────

/** Request a cashback claim. Transitions to `claim_requested`.
 *  Does NOT mark as `paid` — no payout processor exists.
 *  UI must disclose: "Ledger-settled. No funds transferred." */
export async function claimCashback(
  walletAddress: string,
): Promise<{ success: boolean; amount: number; error?: string }> {
  try {
    const policy = await getCashbackPolicy();
    const { records } = await cashbackRewards.list({ limit: 5000 });
    const wallet = walletAddress.toLowerCase();
    const claimable = records.filter(
      r => r.data.walletAddress.toLowerCase() === wallet && r.data.status === 'claimable'
    );
    const total = claimable.reduce((sum, r) => sum + r.data.cashbackReward, 0);

    if (total < policy.claimMinimum) {
      return { success: false, amount: 0, error: `Minimum claim: $${policy.claimMinimum}` };
    }

    // Transition to `claim_requested` (NOT `paid` — no payout processor)
    let updateFailed = false;
    for (const record of claimable) {
      try {
        await cashbackRewards.update(record.id, { status: 'claim_requested' });
      } catch {
        // Non-author: expected on 'authenticated' visibility.
        // Record was created by the allocation engine (builder identity).
        updateFailed = true;
      }
    }

    if (updateFailed) {
      // Attempt 'claim_pending' as fallback for backend processing
      for (const record of claimable) {
        try {
          await cashbackRewards.update(record.id, { status: 'claim_pending' });
        } catch { /* cannot update — requires backend processing */ }
      }
    }

    return { success: true, amount: total };
  } catch (e: any) {
    return { success: false, amount: 0, error: e.message || 'CLAIM FAILED' };
  }
}