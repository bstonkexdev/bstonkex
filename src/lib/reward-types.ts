// Cupcak8 Swap Reward Backend Types — matches Railway API responses

export interface AuthNonce {
  nonce: string;
  expiresAt: string;
  message: string;
}

export interface AuthSession {
  token: string;
  walletAddress: string;
}

export interface BackendRewardSummary {
  totalCashbackEarned: number;
  totalReferralEarned: number;
  claimableCashback: number;
  claimableReferral: number;
  pendingCashback: number;
  pendingReferral: number;
  totalClaimed: number;
  totalAllocations: number;
}

export interface CashbackRecord {
  id: number;
  tradeId: number;
  cashbackReward: string;
  cashbackTierName: string | null;
  cashbackTierRatePct: string | null;
  status: string;
  createdAt: string;
}

export interface ReferralRecord {
  id: number;
  tradeId: number;
  referrerUsername: string | null;
  referralReward: string;
  referralPct: string | null;
  status: string;
  createdAt: string;
}

export interface ClaimRecord {
  id: number;
  wallet_address: string;
  claim_type: 'cashback' | 'referral' | 'combined';
  amount: string;
  status: 'claim_requested' | 'processing' | 'paid' | 'rejected' | 'failed';
  tx_hash: string | null;
  claim_minimum: string;
  created_at: string;
  updated_at: string;
}

export interface ClaimRequestResult {
  claim: ClaimRecord;
  message: string;
}

export type LoadState = 'idle' | 'loading' | 'loaded' | 'error';
