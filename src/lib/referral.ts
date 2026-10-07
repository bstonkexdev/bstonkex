// BSTONKEX Referral System — Gitlawb-persisted referral tracking
// Integrated with fee engine for real trade-attributed rewards
import { gitlawb } from './gitlawb';
import { REFERRAL_TIERS, MIN_CLAIM_AMOUNT, type ReferralTier } from './config';
import { getRollingVolume, claimRewards as engineClaimRewards } from './engine/fee-engine';

export interface ReferralProfile {
  username: string;
  walletAddress: string;
  referrerUsername: string | null;
  totalReferrals: number;
  activeReferrals: number;
  rollingVolume30d: number;
  pendingRewards: number;
  claimableRewards: number;
  totalEarned: number;
  currentTier: ReferralTier;
  nextTier: ReferralTier | null;
  amountToNextTier: number;
}

export interface ReferralRecord {
  date: string;
  wallet: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: 'pending' | 'claimed';
}

// Collections
const profiles = gitlawb.db.collection<{
  username: string;
  walletAddress: string;
  referrerUsername: string | null;
}>('ref_profiles', { visibility: 'inbox' });

const rewards = gitlawb.db.collection<{
  referralUsername: string;
  referredWallet: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: string;
  createdAt: string;
}>('ref_rewards');

const volumeLog = gitlawb.db.collection<{
  username: string;
  volume: number;
  date: string;
}>('ref_volume');

export function getRefFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('ref');
}

export async function createProfile(username: string, walletAddress: string): Promise<boolean> {
  try {
    const { records } = await profiles.list({ limit: 100 });
    const exists = records.find(r => r.data.username === username);
    if (exists) return false;
    await profiles.create({
      username,
      walletAddress: walletAddress.toLowerCase(),
      referrerUsername: null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function setReferrer(userWallet: string, referrerUsername: string): Promise<boolean> {
  try {
    const { records } = await profiles.list();
    const userProfile = records.find(r => r.data.walletAddress.toLowerCase() === userWallet.toLowerCase());
    if (!userProfile || userProfile.data.referrerUsername) return false;
    const referrerProfile = records.find(r => r.data.username === referrerUsername);
    if (!referrerProfile) return false;
    if (referrerProfile.data.walletAddress.toLowerCase() === userWallet.toLowerCase()) return false;
    await profiles.update(userProfile.id, { referrerUsername });
    return true;
  } catch {
    return false;
  }
}

export function getTier(volume: number): ReferralTier {
  for (let i = REFERRAL_TIERS.length - 1; i >= 0; i--) {
    if (volume >= REFERRAL_TIERS[i].minVolume) return REFERRAL_TIERS[i];
  }
  return REFERRAL_TIERS[0];
}

/** Get referrer username for a wallet (used by trade engine for attribution). */
export async function getReferrerForWallet(walletAddress: string): Promise<string | null> {
  try {
    const { records } = await profiles.list();
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    return profile?.data.referrerUsername || null;
  } catch {
    return null;
  }
}

export async function getProfile(walletAddress: string): Promise<ReferralProfile | null> {
  try {
    const { records } = await profiles.list();
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return null;

    // Use the fee engine's rolling volume calculation
    const recentVolume = await getRollingVolume(profile.data.username);

    const { records: rewardRecords } = await rewards.list();
    const myRewards = rewardRecords.filter(r => r.data.referralUsername === profile.data.username);
    const pendingRewards = myRewards
      .filter(r => r.data.status === 'pending')
      .reduce((sum, r) => sum + r.data.reward, 0);
    const claimableRewards = myRewards
      .filter(r => r.data.status === 'pending' && r.data.reward >= MIN_CLAIM_AMOUNT)
      .reduce((sum, r) => sum + r.data.reward, 0);
    const totalEarned = myRewards.reduce((sum, r) => sum + r.data.reward, 0);

    const currentTier = getTier(recentVolume);
    const nextTierIdx = REFERRAL_TIERS.findIndex(t => t.name === currentTier.name) + 1;
    const nextTier = nextTierIdx < REFERRAL_TIERS.length ? REFERRAL_TIERS[nextTierIdx] : null;

    // Count referrals
    const allProfiles = records.filter(r => r.data.referrerUsername === profile.data.username);
    const totalReferrals = allProfiles.length;

    return {
      username: profile.data.username,
      walletAddress: profile.data.walletAddress,
      referrerUsername: profile.data.referrerUsername,
      totalReferrals,
      activeReferrals: totalReferrals, // Would need activity tracking
      rollingVolume30d: recentVolume,
      pendingRewards,
      claimableRewards,
      totalEarned,
      currentTier,
      nextTier,
      amountToNextTier: nextTier ? Math.max(0, nextTier.minVolume - recentVolume) : 0,
    };
  } catch {
    return null;
  }
}

export function getReferralLink(username: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?ref=${username}`;
}

export async function getReferralHistory(walletAddress: string): Promise<ReferralRecord[]> {
  try {
    const { records } = await profiles.list();
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const { records: rewardRecords } = await rewards.list();
    return rewardRecords
      .filter(r => r.data.referralUsername === profile.data.username)
      .map(r => ({
        date: r.data.createdAt,
        wallet: r.data.referredWallet,
        tradeVolume: r.data.tradeVolume,
        feeGenerated: r.data.feeGenerated,
        reward: r.data.reward,
        status: r.data.status as 'pending' | 'claimed',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Claim rewards via the fee engine. */
export { engineClaimRewards as claimRewards };

// ── Claim History ────────────────────────────────────────────

export interface ClaimRecord {
  id: string;
  amount: number;
  asset: string;
  status: 'confirmed' | 'pending' | 'failed';
  txHash: string;
  date: string;
}

export async function getClaimHistory(walletAddress: string): Promise<ClaimRecord[]> {
  try {
    const { records } = await profiles.list({ limit: 100 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const { records: claimRecords } = await rewards.list({ limit: 1000 });
    return claimRecords
      .filter(r => r.data.referralUsername === profile.data.username && r.data.status === 'claimed')
      .map((r, i) => ({
        id: r.id,
        amount: r.data.reward,
        asset: 'USD',
        status: 'confirmed' as const,
        txHash: '',
        date: r.data.createdAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// ── Referred Wallets ─────────────────────────────────────────

export interface ReferredWallet {
  wallet: string;
  firstSeen: string;
  lastActivity: string;
  volume30d: number;
  status: 'active' | 'inactive';
}

export async function getReferredWallets(walletAddress: string): Promise<ReferredWallet[]> {
  try {
    const { records } = await profiles.list({ limit: 100 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const referred = records.filter(r => r.data.referrerUsername === profile.data.username);
    const { records: volRecords } = await volumeLog.list({ limit: 1000 });

    return referred.map(r => {
      const walletVol = volRecords.filter(v => v.data.username === profile.data.username);
      const recentDate = walletVol.length > 0
        ? walletVol.sort((a, b) => b.data.date.localeCompare(a.data.date))[0].data.date
        : r.createdAt;
      const vol30d = walletVol
        .filter(v => new Date(v.data.date).getTime() > Date.now() - 30 * 86400000)
        .reduce((s, v) => s + v.data.volume, 0);

      return {
        wallet: r.data.walletAddress,
        firstSeen: r.createdAt,
        lastActivity: recentDate,
        volume30d,
        status: vol30d > 0 ? 'active' : 'inactive',
      };
    });
  } catch {
    return [];
  }
}

// ── Referral Analytics ───────────────────────────────────────

export interface ReferralAnalytics {
  volume30d: number;
  volume7d: number;
  totalRewards: number;
  avgTradeValue: number;
  tradeCount: number;
}

export async function getReferralAnalytics(walletAddress: string): Promise<ReferralAnalytics> {
  try {
    const { records } = await profiles.list({ limit: 100 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return { volume30d: 0, volume7d: 0, totalRewards: 0, avgTradeValue: 0, tradeCount: 0 };

    const { records: volRecords } = await volumeLog.list({ limit: 1000 });
    const myVol = volRecords.filter(r => r.data.username === profile.data.username);

    const now = Date.now();
    const vol30d = myVol.filter(r => new Date(r.data.date).getTime() > now - 30 * 86400000);
    const vol7d = myVol.filter(r => new Date(r.data.date).getTime() > now - 7 * 86400000);

    const { records: rewardRecords } = await rewards.list({ limit: 1000 });
    const myRewards = rewardRecords.filter(r => r.data.referralUsername === profile.data.username);
    const totalRewards = myRewards.reduce((s, r) => s + r.data.reward, 0);
    const totalVolume = myVol.reduce((s, r) => s + r.data.volume, 0);

    return {
      volume30d: vol30d.reduce((s, r) => s + r.data.volume, 0),
      volume7d: vol7d.reduce((s, r) => s + r.data.volume, 0),
      totalRewards,
      avgTradeValue: myVol.length > 0 ? totalVolume / myVol.length : 0,
      tradeCount: myVol.length,
    };
  } catch {
    return { volume30d: 0, volume7d: 0, totalRewards: 0, avgTradeValue: 0, tradeCount: 0 };
  }
}