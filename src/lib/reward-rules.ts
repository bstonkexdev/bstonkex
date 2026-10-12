// Cupcak8 Swap Reward Rules — pure functions, no side effects
// Referral: rolling 30-day qualified volume of referred users
// Cashback: current UTC calendar month qualified volume
// Both: percentage of collected platform fee, capped at 50% combined

export interface ReferralTier {
  name: string;
  minVolume: number;
  sharePct: number;
}

export interface CashbackTier {
  name: string;
  minVolume: number;
  ratePct: number;
}

export const REFERRAL_TIERS: ReferralTier[] = [
  { name: 'STARTER', minVolume: 0, sharePct: 10 },
  { name: 'BUILDER', minVolume: 10_000, sharePct: 20 },
  { name: 'PRO', minVolume: 50_000, sharePct: 30 },
  { name: 'ELITE', minVolume: 250_000, sharePct: 35 },
];

export const CASHBACK_TIERS: CashbackTier[] = [
  { name: 'NOVICE', minVolume: 0, ratePct: 5 },
  { name: 'ADVANCED', minVolume: 1_000, ratePct: 7.5 },
  { name: 'PRO', minVolume: 10_000, ratePct: 10 },
  { name: 'ELITE', minVolume: 100_000, ratePct: 12.5 },
  { name: 'LEGEND', minVolume: 1_000_000, ratePct: 15 },
];

export const MIN_CLAIM_USD = 10;
export const COMBINED_CAP_PCT = 0.50;

/** Get referral tier from rolling 30-day volume. */
export function getReferralTier(volume30d: number): ReferralTier {
  for (let i = REFERRAL_TIERS.length - 1; i >= 0; i--) {
    if (volume30d >= REFERRAL_TIERS[i].minVolume) return REFERRAL_TIERS[i];
  }
  return REFERRAL_TIERS[0];
}

/** Get cashback tier from current-month volume. */
export function getCashbackTier(monthVolume: number): CashbackTier {
  for (let i = CASHBACK_TIERS.length - 1; i >= 0; i--) {
    if (monthVolume >= CASHBACK_TIERS[i].minVolume) return CASHBACK_TIERS[i];
  }
  return CASHBACK_TIERS[0];
}

/** Progress to next referral tier (0-1). */
export function getReferralTierProgress(volume30d: number): { next: ReferralTier | null; progress: number; needed: number } {
  const current = getReferralTier(volume30d);
  const idx = REFERRAL_TIERS.indexOf(current);
  const next = idx < REFERRAL_TIERS.length - 1 ? REFERRAL_TIERS[idx + 1] : null;
  if (!next) return { next: null, progress: 1, needed: 0 };
  const span = next.minVolume - current.minVolume;
  const progress = Math.min(1, (volume30d - current.minVolume) / span);
  return { next, progress, needed: next.minVolume - volume30d };
}

/** Progress to next cashback tier (0-1). */
export function getCashbackTierProgress(monthVolume: number): { next: CashbackTier | null; progress: number; needed: number } {
  const current = getCashbackTier(monthVolume);
  const idx = CASHBACK_TIERS.indexOf(current);
  const next = idx < CASHBACK_TIERS.length - 1 ? CASHBACK_TIERS[idx + 1] : null;
  if (!next) return { next: null, progress: 1, needed: 0 };
  const span = next.minVolume - current.minVolume;
  const progress = Math.min(1, (monthVolume - current.minVolume) / span);
  return { next, progress, needed: next.minVolume - monthVolume };
}

/**
 * Calculate combined reward from a platform fee, applying the 50% cap.
 * referralSharePct and cashbackRatePct are percentages (0-100).
 */
export function calculateCappedRewards(
  platformFeeUsd: number,
  referralSharePct: number,
  cashbackRatePct: number
): { referral: number; cashback: number; capped: boolean; combinedCap: number; treasuryRetained: number } {
  const combinedCap = platformFeeUsd * COMBINED_CAP_PCT;
  const referralRaw = platformFeeUsd * (referralSharePct / 100);
  const cashbackRaw = platformFeeUsd * (cashbackRatePct / 100);
  const combinedRaw = referralRaw + cashbackRaw;

  let referral = referralRaw;
  let cashback = cashbackRaw;
  let capped = false;

  if (combinedRaw > combinedCap && combinedRaw > 0) {
    const scale = combinedCap / combinedRaw;
    referral = referralRaw * scale;
    cashback = cashbackRaw * scale;
    capped = true;
  }

  return { referral, cashback, capped, combinedCap, treasuryRetained: platformFeeUsd - referral - cashback };
}
