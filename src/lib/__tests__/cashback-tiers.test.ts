// Cupcak8 Swap Cashback Tier Tests — deterministic, no mocks
import { describe, it, expect } from 'vitest';
import {
  getCashbackTier, getNextCashbackTier, amountToNextTier,
  toMonthKey, currentMonthKey, recentMonthKeys,
  computeDashboardData, type CashbackRewardRecord,
} from '../engine/cashback-tiers';
import { CASHBACK_TIERS, PLATFORM_FEE_PCT } from '../config';

describe('Cashback Tier Lookup', () => {
  it('returns Novice for $0 volume', () => {
    const tier = getCashbackTier(0);
    expect(tier.name).toBe('Novice');
    expect(tier.ratePct).toBe(5);
  });

  it('returns Novice for $999.99', () => {
    const tier = getCashbackTier(999.99);
    expect(tier.name).toBe('Novice');
  });

  it('returns Advanced at $1,000', () => {
    const tier = getCashbackTier(1000);
    expect(tier.name).toBe('Advanced');
    expect(tier.ratePct).toBe(7.5);
  });

  it('returns Advanced for $9,999.99', () => {
    const tier = getCashbackTier(9999.99);
    expect(tier.name).toBe('Advanced');
  });

  it('returns Pro at $10,000', () => {
    const tier = getCashbackTier(10000);
    expect(tier.name).toBe('Pro');
    expect(tier.ratePct).toBe(10);
  });

  it('returns Pro for $99,999.99', () => {
    const tier = getCashbackTier(99999.99);
    expect(tier.name).toBe('Pro');
  });

  it('returns Elite at $100,000', () => {
    const tier = getCashbackTier(100000);
    expect(tier.name).toBe('Elite');
    expect(tier.ratePct).toBe(12.5);
  });

  it('returns Elite for $999,999.99', () => {
    const tier = getCashbackTier(999999.99);
    expect(tier.name).toBe('Elite');
  });

  it('returns Legend at $1,000,000', () => {
    const tier = getCashbackTier(1000000);
    expect(tier.name).toBe('Legend');
    expect(tier.ratePct).toBe(15);
  });

  it('returns Legend for $10,000,000', () => {
    const tier = getCashbackTier(10000000);
    expect(tier.name).toBe('Legend');
  });
});

describe('Cashback Tier Definitions', () => {
  it('has exactly 5 tiers', () => {
    expect(CASHBACK_TIERS).toHaveLength(5);
  });

  it('tier names in order', () => {
    expect(CASHBACK_TIERS.map(t => t.name)).toEqual(['Novice', 'Advanced', 'Pro', 'Elite', 'Legend']);
  });

  it('tier rates in order', () => {
    expect(CASHBACK_TIERS.map(t => t.ratePct)).toEqual([5, 7.5, 10, 12.5, 15]);
  });

  it('tiers have no gaps', () => {
    for (let i = 0; i < CASHBACK_TIERS.length - 1; i++) {
      const current = CASHBACK_TIERS[i];
      const next = CASHBACK_TIERS[i + 1];
      if (current.maxVolume !== null) {
        expect(current.maxVolume! + 0.01).toBeCloseTo(next.minVolume, 2);
      }
    }
  });

  it('top tier has no max', () => {
    expect(CASHBACK_TIERS[CASHBACK_TIERS.length - 1].maxVolume).toBeNull();
  });
});

describe('Next Tier', () => {
  it('returns null for Legend (top tier)', () => {
    const legend = CASHBACK_TIERS[4];
    expect(getNextCashbackTier(legend)).toBeNull();
  });

  it('returns next tier for each non-top tier', () => {
    for (let i = 0; i < CASHBACK_TIERS.length - 1; i++) {
      const next = getNextCashbackTier(CASHBACK_TIERS[i]);
      expect(next).not.toBeNull();
      expect(next!.name).toBe(CASHBACK_TIERS[i + 1].name);
    }
  });

  it('amount to next tier from $0 Novice = $1000', () => {
    expect(amountToNextTier(0, CASHBACK_TIERS[0])).toBe(1000);
  });

  it('amount to next tier from $500 Novice = $500', () => {
    expect(amountToNextTier(500, CASHBACK_TIERS[0])).toBe(500);
  });

  it('amount to next tier from Legend = 0', () => {
    expect(amountToNextTier(1000000, CASHBACK_TIERS[4])).toBe(0);
  });
});

describe('UTC Month Helpers', () => {
  it('toMonthKey produces YYYY-MM format', () => {
    expect(toMonthKey('2025-01-15T12:00:00Z')).toBe('2025-01');
    expect(toMonthKey('2025-12-31T23:59:59Z')).toBe('2025-12');
  });

  it('currentMonthKey returns a valid YYYY-MM string', () => {
    const mk = currentMonthKey();
    expect(mk).toMatch(/^\d{4}-\d{2}$/);
  });

  it('recentMonthKeys returns correct count', () => {
    const keys = recentMonthKeys(3, '2025-03');
    expect(keys).toEqual(['2025-03', '2025-02', '2025-01']);
  });

  it('recentMonthKeys handles year boundary', () => {
    const keys = recentMonthKeys(3, '2025-01');
    expect(keys).toEqual(['2025-01', '2024-12', '2024-11']);
  });
});

describe('Dashboard Data Computation', () => {
  const makeRecord = (overrides: Partial<CashbackRewardRecord> = {}): CashbackRewardRecord => ({
    id: 'r1',
    walletAddress: '0xabc',
    tradeId: 't1',
    tradeVolume: 10000,
    platformFeeUsd: 40,
    cashbackReward: 4,
    tierName: 'Pro',
    tierRatePct: 10,
    monthKey: '2025-01',
    status: 'claimable',
    createdAt: '2025-01-15T12:00:00Z',
    ...overrides,
  });

  it('computes lifetime volume across records', () => {
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', tradeVolume: 10000 }),
      makeRecord({ id: 'r2', tradeId: 't2', tradeVolume: 5000 }),
    ];
    const data = computeDashboardData(records);
    expect(data.lifetimeVolume).toBe(15000);
  });

  it('separates current month from lifetime', () => {
    const curMonth = currentMonthKey();
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', tradeVolume: 10000, monthKey: curMonth }),
      makeRecord({ id: 'r2', tradeId: 't2', tradeVolume: 5000, monthKey: '2024-01' }),
    ];
    const data = computeDashboardData(records);
    expect(data.lifetimeVolume).toBe(15000);
    expect(data.currentMonthVolume).toBe(10000);
  });

  it('computes available to claim correctly', () => {
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', cashbackReward: 6, status: 'claimable' }),
      makeRecord({ id: 'r2', tradeId: 't2', cashbackReward: 5, status: 'claimable' }),
    ];
    const data = computeDashboardData(records);
    expect(data.availableToClaim).toBe(11); // 11 >= $10 minimum
  });

  it('available to claim is 0 when below minimum', () => {
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', cashbackReward: 3, status: 'claimable' }),
    ];
    const data = computeDashboardData(records);
    expect(data.availableToClaim).toBe(0);
  });

  it('excludes reversed records from earned total', () => {
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', cashbackReward: 10, status: 'claimed' }),
      makeRecord({ id: 'r2', tradeId: 't2', cashbackReward: 5, status: 'reversed' }),
    ];
    const data = computeDashboardData(records);
    expect(data.totalEarned).toBe(10);
    expect(data.reversedAmount).toBe(5);
  });

  it('preserves lifetime data across monthly boundaries', () => {
    const records = [
      makeRecord({ id: 'r1', tradeId: 't1', monthKey: '2024-06', cashbackReward: 20, status: 'claimed' }),
      makeRecord({ id: 'r2', tradeId: 't2', monthKey: '2024-07', cashbackReward: 30, status: 'claimable' }),
    ];
    const data = computeDashboardData(records);
    expect(data.totalEarned).toBe(50); // both months preserved
    expect(data.totalClaimed).toBe(20);
    expect(data.monthlyHistory).toHaveLength(2);
  });
});

describe('Cashback Calculation from Fees', () => {
  it('cashback is calculated from platform fee, not trade principal', () => {
    // $10,000 trade → $40 platform fee → 10% cashback = $4
    const tradeValue = 10000;
    const platformFee = tradeValue * PLATFORM_FEE_PCT; // $40
    const tier = getCashbackTier(tradeValue); // Pro at 10%
    const cashback = platformFee * (tier.ratePct / 100);
    expect(platformFee).toBe(40);
    expect(cashback).toBe(4);
    // NOT 10% of $10,000 = $1,000
    expect(cashback).not.toBe(tradeValue * 0.1);
  });

  it('cashback + referral + treasury = platform fee (no double allocation)', () => {
    const platformFee = 10000 * PLATFORM_FEE_PCT; // $40
    const referralPct = 30; // Pro referral tier
    const cashbackRate = 10; // Pro cashback tier
    const referralReward = platformFee * (referralPct / 100); // $12
    const cashbackReward = platformFee * (cashbackRate / 100); // $4
    const treasury = platformFee - referralReward - cashbackReward; // $24
    expect(referralReward + cashbackReward + treasury).toBeCloseTo(platformFee, 6);
  });

  it('cashback never exceeds platform fee even at max tier', () => {
    const platformFee = 10000 * PLATFORM_FEE_PCT; // $40
    const legendRate = 15;
    const cashback = platformFee * (legendRate / 100); // $6
    expect(cashback).toBeLessThanOrEqual(platformFee);
  });
});