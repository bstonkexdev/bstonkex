// BSTONKEX Fee Engine Tests — deterministic, no mocks
import { describe, it, expect } from 'vitest';
import { calculateFees, getReferralTier } from '../engine/fee-engine';
import { PLATFORM_FEE_PCT, REFERRAL_TIERS, MIN_CLAIM_AMOUNT } from '../config';

describe('Fee Engine', () => {
  describe('calculateFees', () => {
    it('calculates 0.40% platform fee correctly', () => {
      const result = calculateFees(10000);
      expect(result.platformFeeUsd).toBe(40);
      expect(result.platformFeePct).toBe(0.40);
    });

    it('calculates referral reward from platform fee, not trade principal', () => {
      const result = calculateFees(10000, 30); // 30% referral share
      expect(result.platformFeeUsd).toBe(40);
      expect(result.referralRewardUsd).toBe(12); // 30% of $40
      expect(result.treasuryAmountUsd).toBe(28); // $40 - $12
    });

    it('no referral reward when share is 0', () => {
      const result = calculateFees(10000, 0);
      expect(result.referralRewardUsd).toBe(0);
      expect(result.treasuryAmountUsd).toBe(40);
    });

    it('handles zero trade value', () => {
      const result = calculateFees(0);
      expect(result.platformFeeUsd).toBe(0);
      expect(result.referralRewardUsd).toBe(0);
    });

    it('handles small trade values', () => {
      const result = calculateFees(1);
      expect(result.platformFeeUsd).toBeCloseTo(0.004, 6);
    });

    it('fee + referral + treasury = platform fee', () => {
      const result = calculateFees(50000, 25);
      expect(result.referralRewardUsd + result.treasuryAmountUsd).toBeCloseTo(result.platformFeeUsd, 6);
    });
  });

  describe('getReferralTier', () => {
    it('returns Starter tier for $0 volume', () => {
      const tier = getReferralTier(0);
      expect(tier.name).toBe('STARTER');
      expect(tier.sharePct).toBe(10);
    });

    it('returns Builder tier for $10K volume', () => {
      const tier = getReferralTier(10000);
      expect(tier.name).toBe('BUILDER');
      expect(tier.sharePct).toBe(20);
    });

    it('returns Pro tier for $50K volume', () => {
      const tier = getReferralTier(50000);
      expect(tier.name).toBe('PRO');
      expect(tier.sharePct).toBe(30);
    });

    it('returns Elite tier for $250K volume', () => {
      const tier = getReferralTier(250000);
      expect(tier.name).toBe('ELITE');
      expect(tier.sharePct).toBe(35);
    });

    it('returns highest applicable tier', () => {
      const tier = getReferralTier(1000000);
      expect(tier.sharePct).toBe(35);
    });
  });

  describe('Platform fee constant', () => {
    it('is 0.40%', () => {
      expect(PLATFORM_FEE_PCT).toBe(0.004);
    });
  });

  describe('Minimum claim amount', () => {
    it('is $10', () => {
      expect(MIN_CLAIM_AMOUNT).toBe(10);
    });
  });
});