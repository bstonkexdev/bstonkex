// BSTONKEX Fee Engine — Platform fee calculation, referral attribution, treasury accounting
import { PLATFORM_FEE_PCT, REFERRAL_TIERS, MIN_CLAIM_AMOUNT, REFERRAL_ROLLING_DAYS } from '../config';
import { gitlawb } from '../gitlawb';

// ── Collections ──────────────────────────────────────────────
const feeLedger = gitlawb.db.collection<{
  tradeId: string;
  tradeAmountUsd: number;
  platformFeeUsd: number;
  referralRewardUsd: number;
  treasuryAmountUsd: number;
  referrerUsername: string | null;
  chainId: string;
  timestamp: string;
}>('fee_ledger');

const refRewards = gitlawb.db.collection<{
  referrerUsername: string;
  referredWallet: string;
  tradeId: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: string; // pending | claimable | claimed
  createdAt: string;
}>('ref_rewards');

const refVolume = gitlawb.db.collection<{
  username: string;
  volume: number;
  feeGenerated: number;
  tradeId: string;
  date: string;
}>('ref_volume');

// ── Fee Calculation ──────────────────────────────────────────

export interface FeeBreakdown {
  tradeValueUsd: number;
  platformFeeUsd: number;
  platformFeePct: number;
  referralRewardUsd: number;
  referralPct: number;
  treasuryAmountUsd: number;
  referrerUsername: string | null;
}

/** Calculate the full fee breakdown for a trade. */
export function calculateFees(tradeValueUsd: number, referrerSharePct = 0): FeeBreakdown {
  const platformFeeUsd = tradeValueUsd * PLATFORM_FEE_PCT;
  const referralRewardUsd = platformFeeUsd * (referrerSharePct / 100);
  const treasuryAmountUsd = platformFeeUsd - referralRewardUsd;

  return {
    tradeValueUsd,
    platformFeeUsd,
    platformFeePct: PLATFORM_FEE_PCT * 100, // 0.40
    referralRewardUsd,
    referralPct: referrerSharePct,
    treasuryAmountUsd,
    referrerUsername: null,
  };
}

/** Get the referral tier for a given rolling 30-day volume. */
export function getReferralTier(volume30d: number) {
  for (let i = REFERRAL_TIERS.length - 1; i >= 0; i--) {
    if (volume30d >= REFERRAL_TIERS[i].minVolume) return REFERRAL_TIERS[i];
  }
  return REFERRAL_TIERS[0];
}

// ── Fee Attribution ──────────────────────────────────────────

// Dedup: track processed tradeIds to prevent double rewards (idempotent)
const processedTrades = new Set<string>();

/** Calculate and record fee allocation after a successful trade. */
export async function calculateFeeAllocation(
  tradeAmountUsd: number,
  referrerUsername: string | null,
  tradeId: string,
): Promise<FeeBreakdown> {
  // Idempotency guard
  if (processedTrades.has(tradeId)) {
    return calculateFees(tradeAmountUsd, 0);
  }
  processedTrades.add(tradeId);
  let referrerSharePct = 0;

  // If referrer exists, look up their current tier
  if (referrerUsername) {
    const vol30d = await getRollingVolume(referrerUsername);
    const tier = getReferralTier(vol30d);
    referrerSharePct = tier.sharePct;
  }

  const breakdown = calculateFees(tradeAmountUsd, referrerSharePct);
  breakdown.referrerUsername = referrerUsername;

  // Record in fee ledger
  try {
    await feeLedger.create({
      tradeId,
      tradeAmountUsd,
      platformFeeUsd: breakdown.platformFeeUsd,
      referralRewardUsd: breakdown.referralRewardUsd,
      treasuryAmountUsd: breakdown.treasuryAmountUsd,
      referrerUsername,
      chainId: '',
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-critical */ }

  // Record referral reward if applicable
  if (referrerUsername && breakdown.referralRewardUsd > 0) {
    await recordReferralReward(
      referrerUsername,
      tradeId,
      tradeAmountUsd,
      breakdown.platformFeeUsd,
      breakdown.referralRewardUsd,
    );
  }

  return breakdown;
}

/** Record a referral reward entry. */
export async function recordReferralReward(
  referrerUsername: string,
  tradeId: string,
  tradeVolume: number,
  feeGenerated: number,
  reward: number,
): Promise<void> {
  try {
    // Add to rewards collection
    await refRewards.create({
      referrerUsername,
      referredWallet: '',
      tradeId,
      tradeVolume,
      feeGenerated,
      reward,
      status: reward >= MIN_CLAIM_AMOUNT ? 'claimable' : 'pending',
      createdAt: new Date().toISOString(),
    });

    // Add to rolling volume log
    await refVolume.create({
      username: referrerUsername,
      volume: tradeVolume,
      feeGenerated,
      tradeId,
      date: new Date().toISOString(),
    });
  } catch { /* non-critical */ }
}

/** Get rolling 30-day volume for a referrer. */
export async function getRollingVolume(username: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - REFERRAL_ROLLING_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { records } = await refVolume.list({ limit: 1000 });
    return records
      .filter(r => r.data.username === username && r.data.date > cutoff)
      .reduce((sum, r) => sum + r.data.volume, 0);
  } catch {
    return 0;
  }
}

// ── Fee History & Analytics ──────────────────────────────────

export interface FeeRecord {
  id: string;
  date: string;
  tradeId: string;
  tradeValueUsd: number;
  platformFeeUsd: number;
  dexFeeUsd: number;
  networkFeeUsd: number;
  chainId: string;
  status: string;
}

export interface FeeAnalytics {
  todayVolume: number;
  todayFees: number;
  weekVolume: number;
  weekFees: number;
  monthVolume: number;
  monthFees: number;
  allTimeVolume: number;
  allTimeFees: number;
  tradeCount: number;
  avgFee: number;
}

export async function getFeeHistory(chainFilter?: string): Promise<FeeRecord[]> {
  try {
    const { records } = await feeLedger.list({ limit: 500 });
    let filtered = records;
    if (chainFilter && chainFilter !== 'all') {
      filtered = records.filter(r => r.data.chainId === chainFilter);
    }
    return filtered.map(r => ({
      id: r.id,
      date: r.data.timestamp,
      tradeId: r.data.tradeId,
      tradeValueUsd: r.data.tradeAmountUsd,
      platformFeeUsd: r.data.platformFeeUsd,
      dexFeeUsd: 0,
      networkFeeUsd: 0,
      chainId: r.data.chainId,
      status: 'confirmed',
    })).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function getFeeAnalytics(): Promise<FeeAnalytics> {
  try {
    const { records } = await feeLedger.list({ limit: 1000 });
    const now = Date.now();
    const today = now - 86400000;
    const week = now - 7 * 86400000;
    const month = now - 30 * 86400000;

    const todayRecords = records.filter(r => new Date(r.data.timestamp).getTime() > today);
    const weekRecords = records.filter(r => new Date(r.data.timestamp).getTime() > week);
    const monthRecords = records.filter(r => new Date(r.data.timestamp).getTime() > month);

    const allTimeFees = records.reduce((s, r) => s + r.data.platformFeeUsd, 0);
    const allTimeVolume = records.reduce((s, r) => s + r.data.tradeAmountUsd, 0);

    return {
      todayVolume: todayRecords.reduce((s, r) => s + r.data.tradeAmountUsd, 0),
      todayFees: todayRecords.reduce((s, r) => s + r.data.platformFeeUsd, 0),
      weekVolume: weekRecords.reduce((s, r) => s + r.data.tradeAmountUsd, 0),
      weekFees: weekRecords.reduce((s, r) => s + r.data.platformFeeUsd, 0),
      monthVolume: monthRecords.reduce((s, r) => s + r.data.tradeAmountUsd, 0),
      monthFees: monthRecords.reduce((s, r) => s + r.data.platformFeeUsd, 0),
      allTimeVolume,
      allTimeFees,
      tradeCount: records.length,
      avgFee: records.length > 0 ? allTimeFees / records.length : 0,
    };
  } catch {
    return { todayVolume: 0, todayFees: 0, weekVolume: 0, weekFees: 0, monthVolume: 0, monthFees: 0, allTimeVolume: 0, allTimeFees: 0, tradeCount: 0, avgFee: 0 };
  }
}

/** Claim referral rewards. */
export async function claimRewards(username: string): Promise<{ success: boolean; amount: number; error?: string }> {
  try {
    const { records } = await refRewards.list({ limit: 1000 });
    const claimable = records.filter(
      r => r.data.referrerUsername === username && r.data.status === 'claimable'
    );
    const total = claimable.reduce((sum, r) => sum + r.data.reward, 0);

    if (total < MIN_CLAIM_AMOUNT) {
      return { success: false, amount: 0, error: `Minimum claim: $${MIN_CLAIM_AMOUNT}` };
    }

    // Mark as claimed
    for (const record of claimable) {
      await refRewards.update(record.id, { status: 'claimed' });
    }

    return { success: true, amount: total };
  } catch (e: any) {
    return { success: false, amount: 0, error: e.message || 'CLAIM FAILED' };
  }
}