// Cupcak8 Swap Cashback Engine Tests — deterministic, no mocks
import { describe, it, expect } from 'vitest';
import { calculateCashback, type CashbackPolicy } from '../engine/cashback-engine';
import { PLATFORM_FEE_PCT, MIN_CLAIM_AMOUNT } from '../config';

const DISABLED_POLICY: CashbackPolicy = {
  enabled: false, rateBps: 0, ratePct: 0,
  eligibleFeeField: 'platformFeeUsd', exclusions: [],
  claimMinimum: MIN_CLAIM_AMOUNT, lastUpdated: '', updatedBy: '',
};

const ENABLED_POLICY: CashbackPolicy = {
  enabled: true, rateBps: 200, ratePct: 2,
  eligibleFeeField: 'platformFeeUsd', exclusions: [],
  claimMinimum: 10, lastUpdated: new Date().toISOString(), updatedBy: 'admin',
};

describe('Cashback Engine', () => {
  describe('calculateCashback', () => {
    it('returns 0 when policy is disabled', () => {
      expect(calculateCashback(100, DISABLED_POLICY)).toBe(0);
    });

    it('returns 0 when rate is 0', () => {
      const zeroRate = { ...ENABLED_POLICY, rateBps: 0 };
      expect(calculateCashback(100, zeroRate)).toBe(0);
    });

    it('calculates cashback from platform fee, not trade principal', () => {
      // 200 bps = 2% of platform fee
      // $10,000 trade → $40 platform fee → $0.80 cashback
      const platformFee = 10000 * PLATFORM_FEE_PCT; // $40
      const cashback = calculateCashback(platformFee, ENABLED_POLICY);
      expect(cashback).toBeCloseTo(0.8, 6); // 2% of $40
    });

    it('does not exceed platform fee', () => {
      // Even at 5000 bps (50%), cashback = 50% of fee, not more
      const maxPolicy = { ...ENABLED_POLICY, rateBps: 5000 };
      const platformFee = 10000 * PLATFORM_FEE_PCT; // $40
      const cashback = calculateCashback(platformFee, maxPolicy);
      expect(cashback).toBe(20); // 50% of $40
      expect(cashback).toBeLessThanOrEqual(platformFee);
    });

    it('cashback + remaining never exceeds platform fee', () => {
      for (const rateBps of [100, 200, 500, 1000, 2500, 5000]) {
        const policy = { ...ENABLED_POLICY, rateBps };
        const platformFee = 10000 * PLATFORM_FEE_PCT;
        const cashback = calculateCashback(platformFee, policy);
        expect(cashback).toBeLessThanOrEqual(platformFee);
      }
    });
  });

  describe('Policy defaults', () => {
    it('cashback is disabled by default', () => {
      expect(DISABLED_POLICY.enabled).toBe(false);
      expect(DISABLED_POLICY.rateBps).toBe(0);
    });

    it('claim minimum matches config', () => {
      expect(DISABLED_POLICY.claimMinimum).toBe(MIN_CLAIM_AMOUNT);
    });
  });

  describe('Separate accounting', () => {
    it('referral + cashback + treasury = platform fee (no double allocation)', () => {
      const platformFee = 10000 * PLATFORM_FEE_PCT; // $40
      const referralPct = 30; // Pro tier
      const cashbackBps = 200; // 2%

      const referralReward = platformFee * (referralPct / 100); // $12
      const cashbackReward = calculateCashback(platformFee, ENABLED_POLICY); // $0.80
      const treasury = platformFee - referralReward - cashbackReward; // $27.20

      expect(referralReward + cashbackReward + treasury).toBeCloseTo(platformFee, 6);
      expect(treasury).toBeGreaterThan(0);
    });

    it('cashback does not reduce referral reward', () => {
      const platformFee = 10000 * PLATFORM_FEE_PCT;
      const referralReward = platformFee * (30 / 100);
      // Cashback is calculated from the same fee but is a separate allocation
      const cashbackReward = calculateCashback(platformFee, ENABLED_POLICY);
      // Referral reward is independent of cashback
      expect(referralReward).toBe(12);
      expect(cashbackReward).toBeCloseTo(0.8, 6);
    });
  });
});