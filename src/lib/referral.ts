// Cupcak8 Swap Referral System — Gitlawb-persisted referral tracking
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
  status: 'pending' | 'claimable' | 'claim_requested' | 'processing' | 'paid' | 'rejected' | 'failed';
  chainId: string;
}

// ── Collection Visibility Model ──────────────────────────────────
//
// `ref_profiles` (inbox): Privacy for wallet addresses. Anyone can create;
// only the builder reads all records. Users' own profiles are found by
// matching walletAddress in the returned records (inbox returns all to
// the builder; in preview the caller is always the builder).
//
// `ref_usernames` (authenticated): Public username lookup table.
// Every signed-in user can read all entries to check availability and
// resolve referrer usernames from referral links. Contains ONLY the
// username string — no wallet addresses or private data. Written by
// profile creation. Requires builder approval in the Data tab.
//
// `ref_rewards` (authenticated): Signed-in users can read all records;
// the dashboard filters by the caller's own username client-side.
// Records are created by the fee-engine (running as the builder).
// Under 'authenticated', only the original author can edit — so
// regular users CANNOT modify reward records they did not create.
// Requires builder approval in the Data tab.
//
// `ref_volume` (authenticated): Same model as ref_rewards. Dashboard
// reads and filters by the caller's username. Fee-engine writes.
// Requires builder approval in the Data tab.
//
// `fee_ledger` (default / owner): Internal accounting only. Only the
// builder (fee-engine) reads and writes. Never exposed to users.
// ─────────────────────────────────────────────────────────────────

const profiles = gitlawb.db.collection<{
  username: string;
  walletAddress: string;
  referrerUsername: string | null;
}>('ref_profiles', { visibility: 'inbox' });

/** Public username lookup table — no wallet addresses, no private data. */
const usernames = gitlawb.db.collection<{
  username: string;
}>('ref_usernames', { visibility: 'authenticated' });

const rewards = gitlawb.db.collection<{
  referrerUsername: string;
  referredWallet: string;
  tradeId: string;
  tradeVolume: number;
  feeGenerated: number;
  reward: number;
  status: string; // pending | claimable | claimed | claim_pending
  createdAt: string;
  chainId: string;
}>('ref_rewards', { visibility: 'authenticated' });

const volumeLog = gitlawb.db.collection<{
  username: string;
  referredWallet: string;
  volume: number;
  date: string;
}>('ref_volume', { visibility: 'authenticated' });

// ── Username Validation ───────────────────────────────────────

/** Username must be 3–20 characters: letters, numbers, underscore only. */
export function isValidUsername(u: string): boolean {
  return /^[a-z][a-z0-9_]{2,19}$/.test(u.toLowerCase());
}

export function sanitizeUsername(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

/** Check if a username is available (case-insensitive).
 *  Uses the public ref_usernames collection (authenticated visibility)
 *  so any signed-in user can check availability without reading private profiles. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!isValidUsername(username)) return false;
  try {
    const { records } = await usernames.list({ limit: 1000 });
    return !records.some(r => r.data.username.toLowerCase() === username.toLowerCase());
  } catch {
    return false; // Conservative: assume taken on error
  }
}

// ── Referral URL ──────────────────────────────────────────────

export function getRefFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('ref');
}

export function getReferralLink(username: string): string {
  const base = window.location.origin + window.location.pathname;
  return `${base}?ref=${username}`;
}

// ── Profile Management ────────────────────────────────────────

export async function createProfile(username: string, walletAddress: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const clean = username.toLowerCase().trim();
    if (!isValidUsername(clean)) return { ok: false, error: 'Username must be 3-20 characters: letters, numbers, underscore only' };

    // Check username availability via the public lookup table
    const available = await isUsernameAvailable(clean);
    if (!available) return { ok: false, error: 'Username is already taken' };

    // Also check the inbox profiles for wallet dedup (builder can read all)
    const { records } = await profiles.list({ limit: 500 });
    const walletProfile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (walletProfile) return { ok: false, error: 'This wallet already has a profile' };

    // Create the private profile (inbox — only builder reads)
    await profiles.create({
      username: clean,
      walletAddress: walletAddress.toLowerCase(),
      referrerUsername: null,
    });

    // Register in the public username lookup table (authenticated — all signed-in users read)
    // No wallet addresses stored here — only the username string.
    await usernames.create({ username: clean }).catch(() => {
      // Non-critical: profile already created; username lookup may be slightly stale
    });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Profile creation failed' };
  }
}

export async function setReferrer(userWallet: string, referrerUsername: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const userProfile = records.find(r => r.data.walletAddress.toLowerCase() === userWallet.toLowerCase());
    if (!userProfile) return { ok: false, error: 'You need a profile first' };
    if (userProfile.data.referrerUsername) return { ok: false, error: 'Referrer already set — this cannot be changed' };

    // Verify referrer exists via the public username lookup (authenticated — any signed-in user can read)
    const { records: nameRecords } = await usernames.list({ limit: 1000 });
    const referrerEntry = nameRecords.find(r => r.data.username.toLowerCase() === referrerUsername.toLowerCase());
    if (!referrerEntry) return { ok: false, error: 'Referrer username not found' };

    // Self-referral check: compare against user's own username
    if (referrerEntry.data.username.toLowerCase() === userProfile.data.username.toLowerCase()) {
      return { ok: false, error: 'You cannot refer yourself' };
    }

    await profiles.update(userProfile.id, { referrerUsername: referrerEntry.data.username });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to set referrer' };
  }
}

// ── Tier Calculation ──────────────────────────────────────────

export function getTier(volume: number): ReferralTier {
  for (let i = REFERRAL_TIERS.length - 1; i >= 0; i--) {
    if (volume >= REFERRAL_TIERS[i].minVolume) return REFERRAL_TIERS[i];
  }
  return REFERRAL_TIERS[0];
}

/** Get referrer username for a wallet (used by trade engine for attribution). */
export async function getReferrerForWallet(walletAddress: string): Promise<string | null> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    return profile?.data.referrerUsername || null;
  } catch {
    return null;
  }
}

// ── Profile Dashboard Data ────────────────────────────────────

export async function getProfile(walletAddress: string): Promise<ReferralProfile | null> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return null;

    const username = profile.data.username;
    const recentVolume = await getRollingVolume(username);

    const { records: rewardRecords } = await rewards.list({ limit: 1000 });
    const myRewards = rewardRecords.filter(r => r.data.referrerUsername === username);

    // FIX: claimable = sum of ALL rewards with status 'claimable' or 'pending' whose
    // combined total exceeds MIN_CLAIM_AMOUNT (not individual rewards >= MIN_CLAIM)
    const claimableRewardsRaw = myRewards
      .filter(r => r.data.status === 'claimable')
      .reduce((sum, r) => sum + r.data.reward, 0);
    const claimableRewards = claimableRewardsRaw >= MIN_CLAIM_AMOUNT ? claimableRewardsRaw : 0;

    const pendingRewards = myRewards
      .filter(r => r.data.status === 'pending')
      .reduce((sum, r) => sum + r.data.reward, 0);
    const totalEarned = myRewards
      .filter(r => r.data.status !== 'reversed')
      .reduce((sum, r) => sum + r.data.reward, 0);

    const currentTier = getTier(recentVolume);
    const nextTierIdx = REFERRAL_TIERS.findIndex(t => t.name === currentTier.name) + 1;
    const nextTier = nextTierIdx < REFERRAL_TIERS.length ? REFERRAL_TIERS[nextTierIdx] : null;

    // Count referrals
    const allProfiles = records.filter(r => r.data.referrerUsername === username);
    const totalReferrals = allProfiles.length;

    return {
      username: profile.data.username,
      walletAddress: profile.data.walletAddress,
      referrerUsername: profile.data.referrerUsername,
      totalReferrals,
      activeReferrals: totalReferrals,
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

// ── Reward History ────────────────────────────────────────────

export async function getReferralHistory(walletAddress: string): Promise<ReferralRecord[]> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const { records: rewardRecords } = await rewards.list({ limit: 1000 });
    return rewardRecords
      .filter(r => r.data.referrerUsername === profile.data.username)
      .map(r => ({
        date: r.data.createdAt,
        wallet: r.data.referredWallet || '',
        tradeVolume: r.data.tradeVolume,
        feeGenerated: r.data.feeGenerated,
        reward: r.data.reward,
        status: r.data.status as 'pending' | 'claimable' | 'claim_requested' | 'processing' | 'paid' | 'rejected' | 'failed',
        chainId: r.data.chainId || '',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

/** Claim rewards via the fee engine. */
export { engineClaimRewards as claimRewards };

// ── Claim History ─────────────────────────────────────────────

export interface ClaimRecord {
  id: string;
  amount: number;
  asset: string;
  status: 'confirmed' | 'pending' | 'failed' | 'claim_requested' | 'processing';
  txHash: string;
  date: string;
}

export async function getClaimHistory(walletAddress: string): Promise<ClaimRecord[]> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const { records: claimRecords } = await rewards.list({ limit: 1000 });
    return claimRecords
      .filter(r => r.data.referrerUsername === profile.data.username && (r.data.status === 'paid' || r.data.status === 'claim_requested' || r.data.status === 'processing'))
      .map((r) => ({
        id: r.id,
        amount: r.data.reward,
        asset: 'USD',
        status: r.data.status === 'paid' ? 'confirmed' as const : 'claim_requested' as const,
        txHash: '',
        date: r.data.createdAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

// ── Referred Wallets ──────────────────────────────────────────

export interface ReferredWallet {
  wallet: string;
  firstSeen: string;
  lastActivity: string;
  volume30d: number;
  status: 'active' | 'inactive';
}

export async function getReferredWallets(walletAddress: string): Promise<ReferredWallet[]> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return [];

    const referred = records.filter(r => r.data.referrerUsername === profile.data.username);
    const { records: volRecords } = await volumeLog.list({ limit: 2000 });

    return referred.map(r => {
      const wallet = r.data.walletAddress.toLowerCase();
      // Filter volume by the referred wallet address when available,
      // otherwise fall back to profile-based attribution (pre-fix records)
      const walletVol = volRecords.filter(v => {
        if (v.data.username !== profile.data.username) return false;
        const volWallet = v.data.referredWallet?.toLowerCase();
        // Prefer exact wallet match when referredWallet is populated
        if (volWallet && volWallet.length > 0) return volWallet === wallet;
        // Fallback: attribute unassigned volume proportionally to first referred wallet
        // (imperfect but avoids showing $0 for all wallets)
        if (!volWallet || volWallet.length === 0) {
          // Only assign to the first referred wallet to avoid double-counting
          return referred[0]?.data.walletAddress.toLowerCase() === wallet;
        }
        return false;
      });
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
        volume30d: vol30d,
        status: vol30d > 0 ? 'active' : 'inactive',
      };
    });
  } catch {
    return [];
  }
}

// ── Referral Analytics ────────────────────────────────────────

export interface ReferralAnalytics {
  volume30d: number;
  volume7d: number;
  totalRewards: number;
  avgTradeValue: number;
  tradeCount: number;
}

export async function getReferralAnalytics(walletAddress: string): Promise<ReferralAnalytics> {
  try {
    const { records } = await profiles.list({ limit: 500 });
    const profile = records.find(r => r.data.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (!profile) return { volume30d: 0, volume7d: 0, totalRewards: 0, avgTradeValue: 0, tradeCount: 0 };

    const { records: volRecords } = await volumeLog.list({ limit: 2000 });
    const myVol = volRecords.filter(r => r.data.username === profile.data.username);

    const now = Date.now();
    const vol30d = myVol.filter(r => new Date(r.data.date).getTime() > now - 30 * 86400000);
    const vol7d = myVol.filter(r => new Date(r.data.date).getTime() > now - 7 * 86400000);

    const { records: rewardRecords } = await rewards.list({ limit: 1000 });
    const myRewards = rewardRecords.filter(r => r.data.referrerUsername === profile.data.username);
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