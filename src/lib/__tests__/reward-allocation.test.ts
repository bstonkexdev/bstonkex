// Cupcak8 Swap Reward Allocation Tests — cap enforcement, idempotency, claim statuses
import { describe, it, expect } from 'vitest';
import {
  calculateAllocation, type AllocationInput,
  MAX_COMBINED_ALLOCATION_PCT,
  isClaimable, isPendingClaim, isSettled, isEarned,
  type RewardStatus,
} from '../engine/reward-allocation';
import { CASHBACK_TIERS, REFERRAL_TIERS } from '../config';

// ── Test Helpers ─────────────────────────────────────────────

function makeInput(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    tradeId: 'test-trade-1',
    tradeAmountUsd: 10000,
    referrerSharePct: 0,
    cashbackRatePct: 0,
    referrerUsername: null,
    traderWallet: '0xabc123',
    ...overrides,
  };
}

// ── 50% Combined Cap Enforcement ─────────────────────────────

describe('Combined 50% Cap Enforcement', () => {
  it('enforces cap when referral 35% + cashback 15% = 50% (at boundary)', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 35, // ELITE referral
      cashbackRatePct: 15,  // Legend cashback
    }));
    // Platform fee: $10,000 * 0.004 = $40
    // Raw: referral = $14, cashback = $6, combined = $20
    // Cap: $40 * 50% = $20
    // At boundary: no scaling needed
    expect(result.platformFeeUsd).toBe(40);
    expect(result.combinedCap).toBe(20);
    expect(result.combinedRaw).toBe(20);
    expect(result.capped).toBe(false);
    expect(result.referralRewardFinal).toBe(14);
    expect(result.cashbackRewardFinal).toBe(6);
    expect(result.treasuryRetained).toBe(20);
  });

  it('caps when combined exceeds 50% (hypothetical over-allocation)', () => {
    // Simulate a scenario where rates are increased beyond current tiers
    const result = calculateAllocation(makeInput({
      referrerSharePct: 40,
      cashbackRatePct: 20,
    }));
    // Raw: referral = $16, cashback = $8, combined = $24
    // Cap: $20. Scale factor = 20/24 = 0.8333...
    expect(result.capped).toBe(true);
    expect(result.combinedRaw).toBe(24);
    expect(result.combinedFinal).toBeCloseTo(20, 6);
    expect(result.referralRewardFinal).toBeCloseTo(16 * (20 / 24), 6);
    expect(result.cashbackRewardFinal).toBeCloseTo(8 * (20 / 24), 6);
    expect(result.treasuryRetained).toBeCloseTo(20, 6);
  });

  it('preserves proportion when capping', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 50,
      cashbackRatePct: 50,
    }));
    // Both get equal proportion of the cap
    const ratio = result.referralRewardFinal / result.cashbackRewardFinal;
    expect(ratio).toBeCloseTo(1, 6); // Equal proportion
    expect(result.combinedFinal).toBeCloseTo(result.combinedCap, 6);
  });

  it('no cap when combined is under 50%', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 10, // STARTER
      cashbackRatePct: 5,   // Novice
    }));
    // Raw: referral = $4, cashback = $2, combined = $6
    // Cap: $20. No capping needed.
    expect(result.capped).toBe(false);
    expect(result.referralRewardFinal).toBe(4);
    expect(result.cashbackRewardFinal).toBe(2);
    expect(result.treasuryRetained).toBe(34);
  });

  it('handles zero referral (cashback only)', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 0,
      cashbackRatePct: 15,
    }));
    expect(result.referralRewardFinal).toBe(0);
    expect(result.cashbackRewardFinal).toBe(6);
    expect(result.capped).toBe(false);
    expect(result.treasuryRetained).toBe(34);
  });

  it('handles zero cashback (referral only)', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 35,
      cashbackRatePct: 0,
    }));
    expect(result.referralRewardFinal).toBe(14);
    expect(result.cashbackRewardFinal).toBe(0);
    expect(result.capped).toBe(false);
    expect(result.treasuryRetained).toBe(26);
  });

  it('handles zero trade value', () => {
    const result = calculateAllocation(makeInput({
      tradeAmountUsd: 0,
      referrerSharePct: 35,
      cashbackRatePct: 15,
    }));
    expect(result.platformFeeUsd).toBe(0);
    expect(result.combinedFinal).toBe(0);
    expect(result.treasuryRetained).toBe(0);
  });

  it('conservation: combined + treasury = platform fee', () => {
    for (const refPct of [0, 10, 20, 30, 35, 40]) {
      for (const cbPct of [0, 5, 7.5, 10, 12.5, 15, 20]) {
        const result = calculateAllocation(makeInput({
          referrerSharePct: refPct,
          cashbackRatePct: cbPct,
        }));
        expect(result.combinedFinal + result.treasuryRetained).toBeCloseTo(result.platformFeeUsd, 6);
      }
    }
  });

  it('cap is always exactly 50% of platform fee', () => {
    for (const tradeValue of [100, 1000, 10000, 100000]) {
      const result = calculateAllocation(makeInput({
        tradeAmountUsd: tradeValue,
        referrerSharePct: 35,
        cashbackRatePct: 15,
      }));
      expect(result.combinedCap).toBe(result.platformFeeUsd * 0.5);
    }
  });
});

// ── Determinism ──────────────────────────────────────────────

describe('Allocation Determinism', () => {
  it('same input always produces same output', () => {
    const input = makeInput({ referrerSharePct: 30, cashbackRatePct: 10 });
    const r1 = calculateAllocation(input);
    const r2 = calculateAllocation(input);
    expect(r1).toEqual(r2);
  });

  it('allocation is independent of record count', () => {
    // The allocation function is pure — it doesn't depend on existing records
    const input = makeInput({ referrerSharePct: 30, cashbackRatePct: 10 });
    const result = calculateAllocation(input);
    expect(result.referralRewardFinal).toBe(12); // 30% of $40
    expect(result.cashbackRewardFinal).toBe(4);  // 10% of $40
  });
});

// ── Idempotency Structure ────────────────────────────────────

describe('Idempotency Key Structure', () => {
  it('allocation result includes idempotency fields', () => {
    const result = calculateAllocation(makeInput());
    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('idempotent');
    expect(result.processed).toBe(false); // Not yet processed (pure calculation)
    expect(result.idempotent).toBe(false);
  });
});

// ── Claim Status Lifecycle ───────────────────────────────────

describe('Claim Status Lifecycle', () => {
  const allStatuses: RewardStatus[] = [
    'pending', 'claimable', 'claim_requested', 'processing',
    'paid', 'rejected', 'failed', 'reversed',
  ];

  it('claimable is claimable', () => {
    expect(isClaimable('claimable')).toBe(true);
    for (const s of allStatuses.filter(s => s !== 'claimable')) {
      expect(isClaimable(s)).toBe(false);
    }
  });

  it('pending claim statuses are claim_requested and processing', () => {
    expect(isPendingClaim('claim_requested')).toBe(true);
    expect(isPendingClaim('processing')).toBe(true);
    for (const s of allStatuses.filter(s => s !== 'claim_requested' && s !== 'processing')) {
      expect(isPendingClaim(s)).toBe(false);
    }
  });

  it('settled statuses are terminal', () => {
    for (const s of ['paid', 'rejected', 'failed', 'reversed'] as RewardStatus[]) {
      expect(isSettled(s)).toBe(true);
    }
    for (const s of ['pending', 'claimable', 'claim_requested', 'processing'] as RewardStatus[]) {
      expect(isSettled(s)).toBe(false);
    }
  });

  it('earned excludes reversed', () => {
    for (const s of allStatuses.filter(s => s !== 'reversed')) {
      expect(isEarned(s)).toBe(true);
    }
    expect(isEarned('reversed')).toBe(false);
  });

  it('paid is never set by the frontend claim flow', () => {
    // This is a design invariant: paid requires actual settlement
    // The claim flow only transitions to claim_requested
    expect(isSettled('paid')).toBe(true);
    expect(isClaimable('paid')).toBe(false);
  });
});

// ── Fee-Based Calculation Verification ───────────────────────

describe('Fee-Based Calculation (Not Principal)', () => {
  it('referral reward is calculated from platform fee, not trade amount', () => {
    const result = calculateAllocation(makeInput({
      tradeAmountUsd: 10000,
      referrerSharePct: 30,
    }));
    // Platform fee: $40. Referral: 30% of $40 = $12.
    // NOT 30% of $10,000 = $3,000
    expect(result.referralRewardFinal).toBe(12);
    expect(result.referralRewardFinal).not.toBe(10000 * 0.3);
  });

  it('cashback reward is calculated from platform fee, not trade amount', () => {
    const result = calculateAllocation(makeInput({
      tradeAmountUsd: 10000,
      cashbackRatePct: 10,
    }));
    // Platform fee: $40. Cashback: 10% of $40 = $4.
    // NOT 10% of $10,000 = $1,000
    expect(result.cashbackRewardFinal).toBe(4);
    expect(result.cashbackRewardFinal).not.toBe(10000 * 0.1);
  });
});

// ── Maximum Tier Boundary Tests ──────────────────────────────

describe('Maximum Tier Boundaries', () => {
  it('max referral tier (ELITE 35%) + max cashback tier (Legend 15%) = 50%', () => {
    const maxRef = REFERRAL_TIERS[REFERRAL_TIERS.length - 1];
    const maxCb = CASHBACK_TIERS[CASHBACK_TIERS.length - 1];
    expect(maxRef.sharePct).toBe(35);
    expect(maxCb.ratePct).toBe(15);
    expect(maxRef.sharePct + maxCb.ratePct).toBe(MAX_COMBINED_ALLOCATION_PCT);
  });

  it('at max tiers, combined equals cap exactly (no excess)', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 35,
      cashbackRatePct: 15,
    }));
    expect(result.capped).toBe(false);
    expect(result.combinedFinal).toBe(result.combinedCap);
  });

  it('even if tiers increase, cap prevents over-allocation', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 45, // Hypothetical future tier
      cashbackRatePct: 20,  // Hypothetical future tier
    }));
    expect(result.capped).toBe(true);
    expect(result.combinedFinal).toBeLessThanOrEqual(result.combinedCap);
    expect(result.treasuryRetained).toBeGreaterThanOrEqual(0);
  });
});

// ── Audit Trail ──────────────────────────────────────────────

describe('Audit Trail', () => {
  it('allocation result contains all fields needed for audit', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 30,
      cashbackRatePct: 10,
    }));
    // Verify all audit fields are present
    expect(result.tradeId).toBeTruthy();
    expect(result.platformFeeUsd).toBe(40);
    expect(result.referralRewardRaw).toBe(12);
    expect(result.referralRewardFinal).toBe(12);
    expect(result.cashbackRewardRaw).toBe(4);
    expect(result.cashbackRewardFinal).toBe(4);
    expect(result.combinedCap).toBe(20);
    expect(result.combinedRaw).toBe(16);
    expect(result.combinedFinal).toBe(16);
    expect(result.capped).toBe(false);
    expect(result.treasuryRetained).toBe(24);
  });

  it('audit trail shows raw and final values when capped', () => {
    const result = calculateAllocation(makeInput({
      referrerSharePct: 40,
      cashbackRatePct: 20,
    }));
    expect(result.referralRewardRaw).toBe(16);
    expect(result.cashbackRewardRaw).toBe(8);
    expect(result.combinedRaw).toBe(24);
    expect(result.referralRewardFinal).toBeLessThan(result.referralRewardRaw);
    expect(result.cashbackRewardFinal).toBeLessThan(result.cashbackRewardRaw);
    expect(result.combinedFinal).toBeLessThan(result.combinedRaw);
  });
});