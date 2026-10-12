// Cupcak8 Swap Unified Reward Aggregation — connects to Railway backend
// Rule calculations live in reward-rules.ts (pure functions).
// Backend API calls live in reward-api.ts (authenticated).

// ── New: Backend API + Rules ─────────────────────────────────
export {
  REFERRAL_TIERS, CASHBACK_TIERS, MIN_CLAIM_USD, COMBINED_CAP_PCT,
  getReferralTier, getCashbackTier, getReferralTierProgress, getCashbackTierProgress,
  calculateCappedRewards,
  type ReferralTier, type CashbackTier,
} from './reward-rules';

export {
  fetchSummary, fetchCashback, fetchReferrals, fetchClaims, submitClaim,
  isAuthenticated, getSessionToken, setSessionToken, logout,
} from './reward-api';

export type {
  BackendRewardSummary, CashbackRecord, ReferralRecord,
  ClaimRequestResult, AuthNonce, AuthSession, LoadState,
} from './reward-types';

// ── Legacy: Unified types (backward compatibility) ──────────
import { fetchSummary, fetchCashback, fetchReferrals, fetchClaims } from './reward-api';

// Use referral.ts ClaimRecord for backward compatibility
import type { ClaimRecord } from './referral';
export type { ClaimRecord };

export interface UnifiedTier {
  name: string;
  sharePct: number;
  minVolume: number;
}

export interface UnifiedReferralProfile {
  username: string;
  walletAddress: string;
  referrerUsername: string | null;
  totalReferrals: number;
  activeReferrals: number;
  rollingVolume30d: number;
  pendingRewards: number;
  claimableRewards: number;
  totalEarned: number;
  currentTier: UnifiedTier | null;
  nextTier: UnifiedTier | null;
  amountToNextTier: number;
}

export interface UnifiedCashbackPolicy {
  enabled: boolean;
  rateBps: number;
  eligibleFeeField: string;
  claimMinimum: number;
  exclusions: string[];
}

export interface UnifiedRewardSummary {
  referralRewards: number;
  cashbackEarned: number;
  combinedClaimable: number;
  pendingRewards: number;
  currentTier: string;
  tierSharePct: number;
  rollingVolume30d: number;
  cashbackPolicy: UnifiedCashbackPolicy;
  referralProfile: UnifiedReferralProfile | null;
}

export interface UnifiedHistoryEntry {
  date: string;
  source: 'referral' | 'cashback';
  tradeId: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: string;
  chainId: string;
}

/** Backward-compatible summary from backend. */
export async function getUnifiedSummary(_walletAddress: string): Promise<UnifiedRewardSummary> {
  const s = await fetchSummary();
  return {
    referralRewards: s.totalReferralEarned,
    cashbackEarned: s.totalCashbackEarned,
    combinedClaimable: s.claimableCashback + s.claimableReferral,
    pendingRewards: s.pendingCashback + s.pendingReferral,
    currentTier: '—',
    tierSharePct: 0,
    rollingVolume30d: 0,
    cashbackPolicy: {
      enabled: true,
      rateBps: 500,
      eligibleFeeField: 'platformFeeUsd',
      claimMinimum: 10,
      exclusions: [],
    },
    referralProfile: null,
  };
}

/** Backward-compatible history from backend. */
export async function getUnifiedHistory(_walletAddress: string): Promise<UnifiedHistoryEntry[]> {
  const [referrals, cashback] = await Promise.all([fetchReferrals(), fetchCashback()]);
  return [
    ...referrals.map(r => ({
      date: r.createdAt, source: 'referral' as const, tradeId: String(r.tradeId),
      tradeVolume: 0, feeGenerated: 0, reward: parseFloat(r.referralReward),
      status: r.status, chainId: '',
    })),
    ...cashback.map(c => ({
      date: c.createdAt, source: 'cashback' as const, tradeId: String(c.tradeId),
      tradeVolume: 0, feeGenerated: 0, reward: parseFloat(c.cashbackReward),
      status: c.status, chainId: '',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

/** Backward-compatible claim history from backend. */
export async function getUnifiedClaimHistory(_walletAddress: string): Promise<ClaimRecord[]> {
  const claims = await fetchClaims();
  return claims.map(c => ({
    id: String(c.id),
    amount: parseFloat(c.amount),
    asset: 'USD',
    status: c.status === 'paid' ? 'confirmed' as const
      : c.status === 'claim_requested' ? 'claim_requested' as const
      : c.status === 'processing' ? 'processing' as const
      : c.status === 'rejected' ? 'failed' as const
      : 'failed' as const,
    txHash: c.tx_hash || '',
    date: c.created_at,
  }));
}
