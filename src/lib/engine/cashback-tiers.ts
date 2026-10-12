// Cupcak8 Swap Cashback Tier System — monthly UTC cycle with tiered rates
import { CASHBACK_TIERS, MIN_CLAIM_AMOUNT, type CashbackTier } from '../config';

// ── Tier Lookup ──────────────────────────────────────────────

/** Get the cashback tier for a given monthly eligible volume. */
export function getCashbackTier(monthlyVolume: number): CashbackTier {
  for (let i = CASHBACK_TIERS.length - 1; i >= 0; i--) {
    if (monthlyVolume >= CASHBACK_TIERS[i].minVolume) return CASHBACK_TIERS[i];
  }
  return CASHBACK_TIERS[0];
}

/** Get the next tier above the current one, or null if already at the top. */
export function getNextCashbackTier(current: CashbackTier): CashbackTier | null {
  const idx = CASHBACK_TIERS.findIndex(t => t.name === current.name);
  if (idx < 0 || idx >= CASHBACK_TIERS.length - 1) return null;
  return CASHBACK_TIERS[idx + 1];
}

/** Calculate the USD amount needed to reach the next tier. */
export function amountToNextTier(currentVolume: number, current: CashbackTier): number {
  const next = getNextCashbackTier(current);
  if (!next) return 0;
  return Math.max(0, next.minVolume - currentVolume);
}

// ── UTC Month Helpers ────────────────────────────────────────

/** Generate a month key like "2025-01" from a Date or ISO string. */
export function toMonthKey(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Get the current UTC month key. */
export function currentMonthKey(): string {
  return toMonthKey(new Date());
}

/** Get the UTC start-of-month ISO string for a given month key. */
export function monthStartISO(monthKey: string): string {
  return `${monthKey}-01T00:00:00.000Z`;
}

/** Get the UTC end-of-month ISO string (exclusive) for a given month key. */
export function monthEndISO(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)); // first day of next month
  return end.toISOString();
}

/** List the last N month keys ending at the given month (inclusive). */
export function recentMonthKeys(n: number, endMonth?: string): string[] {
  const end = endMonth || currentMonthKey();
  const [ey, em] = end.split('-').map(Number);
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(ey, em - 1 - i, 1));
    keys.push(toMonthKey(d));
  }
  return keys;
}

// ── Reward Record (for aggregation) ─────────────────────────

export interface CashbackRewardRecord {
  id: string;
  walletAddress: string;
  tradeId: string;
  tradeVolume: number;
  platformFeeUsd: number;
  cashbackReward: number;
  tierName: string;
  tierRatePct: number;
  monthKey: string;
  status: string; // pending | claimable | claimed | reversed
  createdAt: string;
}

// ── Aggregate Stats ──────────────────────────────────────────

export interface MonthlyStats {
  monthKey: string;
  volume: number;
  eligibleFees: number;
  cashbackEarned: number;
  claimed: number;
  remaining: number;
  finalTier: CashbackTier;
}

export interface CashbackDashboardData {
  lifetimeVolume: number;
  currentMonthVolume: number;
  currentTier: CashbackTier;
  nextTier: CashbackTier | null;
  amountToNext: number;
  totalEarned: number;
  totalClaimed: number;
  availableToClaim: number;
  pendingAmount: number;
  reversedAmount: number;
  monthlyHistory: MonthlyStats[];
}

/** Compute full dashboard data from a list of reward records. */
export function computeDashboardData(records: CashbackRewardRecord[]): CashbackDashboardData {
  const curMonth = currentMonthKey();

  // Lifetime totals
  const lifetimeVolume = records.reduce((s, r) => s + r.tradeVolume, 0);

  // Current month records
  const monthRecords = records.filter(r => r.monthKey === curMonth);
  const currentMonthVolume = monthRecords.reduce((s, r) => s + r.tradeVolume, 0);

  // Tier based on current month volume
  const currentTier = getCashbackTier(currentMonthVolume);
  const nextTier = getNextCashbackTier(currentTier);
  const amountToNext = amountToNextTier(currentMonthVolume, currentTier);

  // Status-based totals (lifetime)
  const earned = records
    .filter(r => r.status !== 'reversed')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const claimed = records
    .filter(r => r.status === 'claimed')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const available = records
    .filter(r => r.status === 'claimable')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const pending = records
    .filter(r => r.status === 'pending')
    .reduce((s, r) => s + r.cashbackReward, 0);
  const reversed = records
    .filter(r => r.status === 'reversed')
    .reduce((s, r) => s + r.cashbackReward, 0);

  // Available must meet claim minimum
  const availableToClaim = available >= MIN_CLAIM_AMOUNT ? available : 0;

  // Monthly history (group by monthKey)
  const monthMap = new Map<string, CashbackRewardRecord[]>();
  for (const r of records) {
    const arr = monthMap.get(r.monthKey) || [];
    arr.push(r);
    monthMap.set(r.monthKey, arr);
  }

  const monthlyHistory: MonthlyStats[] = [];
  for (const [mk, recs] of monthMap) {
    const volume = recs.reduce((s, r) => s + r.tradeVolume, 0);
    const eligibleFees = recs.reduce((s, r) => s + r.platformFeeUsd, 0);
    const earned = recs.filter(r => r.status !== 'reversed').reduce((s, r) => s + r.cashbackReward, 0);
    const cl = recs.filter(r => r.status === 'claimed').reduce((s, r) => s + r.cashbackReward, 0);
    const tier = getCashbackTier(volume);
    monthlyHistory.push({
      monthKey: mk,
      volume,
      eligibleFees,
      cashbackEarned: earned,
      claimed: cl,
      remaining: earned - cl,
      finalTier: tier,
    });
  }

  // Sort descending by month
  monthlyHistory.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  return {
    lifetimeVolume,
    currentMonthVolume,
    currentTier,
    nextTier,
    amountToNext,
    totalEarned: earned,
    totalClaimed: claimed,
    availableToClaim,
    pendingAmount: pending,
    reversedAmount: reversed,
    monthlyHistory,
  };
}