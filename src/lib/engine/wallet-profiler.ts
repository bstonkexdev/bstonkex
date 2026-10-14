// Cupcak8 Swap — Wallet Profiler & Heuristic Engine
// Evaluates trader addresses and assigns dynamic tags:
//   SmartMoney, KOL, Sniper, Cabal, Followed, Creator
//
// Architecture from blueprint:
//   [Trade UTP] → wallet-profiler.ts (evaluate trader_address)
//   → queries wallet cache + historical performance
//   → updates dynamic tags → appends to UTP

import type { WalletTags } from './trade-stream';

// ── Wallet Profile ───────────────────────────────────────────

export interface WalletProfile {
  address: string;
  tags: WalletTags;
  winRate: number;        // 0-100%
  totalTrades: number;
  avgHoldTime: number;    // seconds
  pnl: number;            // USD
  lastActive: number;     // timestamp
  firstSeen: number;      // timestamp
}

// ── Tag Heuristics ───────────────────────────────────────────

const SMART_MONEY_WIN_RATE = 60;      // >60% win rate = smart money
const SMART_MONEY_TRADES = 50;        // >50 trades = experienced
const KOL_HOLD_TIME = 300;            // <5min hold = KOL (fast flip)
const SNIPER_FIRST_TRADE = 60;        // <60s after launch = sniper
const CABAL_COORDINATED = 3;          // >3 wallets buying same token in <10s

// ── Wallet Cache ─────────────────────────────────────────────

const walletCache = new Map<string, WalletProfile>();
const followedWallets = new Set<string>();

// ── Evaluate Wallet Tags ─────────────────────────────────────

export function evaluateWalletTags(
  address: string,
  mint: string,
  tradeTimestamp: number,
  tokenCreatedAt?: number,
): WalletTags {
  const profile = walletCache.get(address);

  const tags: WalletTags = {
    isSmartMoney: false,
    isKOL: false,
    isSniper: false,
    isCabal: false,
    isFollowed: followedWallets.has(address),
    isCreator: false,
  };

  if (!profile) return tags;

  // Smart Money: High win rate + many trades
  if (profile.winRate >= SMART_MONEY_WIN_RATE && profile.totalTrades >= SMART_MONEY_TRADES) {
    tags.isSmartMoney = true;
  }

  // KOL: Very short hold times (fast flips)
  if (profile.avgHoldTime < KOL_HOLD_TIME && profile.totalTrades > 20) {
    tags.isKOL = true;
  }

  // Sniper: First trade within 60s of token launch
  if (tokenCreatedAt && tradeTimestamp - tokenCreatedAt < SNIPER_FIRST_TRADE * 1000) {
    tags.isSniper = true;
  }

  return tags;
}

// ── Update Wallet Profile ────────────────────────────────────

export function updateWalletProfile(
  address: string,
  trade: { mint: string; side: 'buy' | 'sell'; priceUsd: number; timestamp: number },
): void {
  let profile = walletCache.get(address);
  if (!profile) {
    profile = {
      address,
      tags: {
        isSmartMoney: false,
        isKOL: false,
        isSniper: false,
        isCabal: false,
        isFollowed: followedWallets.has(address),
        isCreator: false,
      },
      winRate: 0,
      totalTrades: 0,
      avgHoldTime: 0,
      pnl: 0,
      lastActive: trade.timestamp,
      firstSeen: trade.timestamp,
    };
    walletCache.set(address, profile);
  }

  profile.totalTrades += 1;
  profile.lastActive = trade.timestamp;

  // Simple P&L tracking (would need full position tracking for accuracy)
  if (trade.side === 'buy') {
    profile.pnl -= trade.priceUsd;
  } else {
    profile.pnl += trade.priceUsd;
  }

  // Update win rate heuristic (simplified)
  if (profile.pnl > 0) {
    profile.winRate = Math.min(100, profile.winRate + 1);
  } else {
    profile.winRate = Math.max(0, profile.winRate - 0.5);
  }

  // Re-evaluate tags
  profile.tags = evaluateWalletTags(address, trade.mint, trade.timestamp);
}

// ── Follow/Unfollow Wallet ───────────────────────────────────

export function followWallet(address: string): void {
  followedWallets.add(address);
  const profile = walletCache.get(address);
  if (profile) profile.tags.isFollowed = true;
}

export function unfollowWallet(address: string): void {
  followedWallets.delete(address);
  const profile = walletCache.get(address);
  if (profile) profile.tags.isFollowed = false;
}

export function isWalletFollowed(address: string): boolean {
  return followedWallets.has(address);
}

// ── Get Wallet Profile ───────────────────────────────────────

export function getWalletProfile(address: string): WalletProfile | null {
  return walletCache.get(address) || null;
}

/** Get all followed wallets. */
export function getFollowedWallets(): string[] {
  return [...followedWallets];
}

/** Get top wallets by win rate. */
export function getTopWallets(limit = 10): WalletProfile[] {
  return [...walletCache.values()]
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, limit);
}

// ── Cabal Detection ──────────────────────────────────────────

// Track recent buys per token for cabal detection
const recentBuys = new Map<string, Array<{ address: string; timestamp: number }>>();

export function checkCabal(mint: string, address: string, timestamp: number): boolean {
  if (!recentBuys.has(mint)) recentBuys.set(mint, []);
  const buys = recentBuys.get(mint)!;

  // Add this buy
  buys.push({ address, timestamp });

  // Clean old entries (>10s window)
  const window = 10_000;
  const cutoff = timestamp - window;
  const recent = buys.filter(b => b.timestamp > cutoff);
  recentBuys.set(mint, recent);

  // Check for coordinated buying (3+ wallets in 10s)
  const uniqueWallets = new Set(recent.map(b => b.address));
  return uniqueWallets.size >= CABAL_COORDINATED;
}

// ── Stats ────────────────────────────────────────────────────

export interface WalletProfilerStats {
  totalProfiles: number;
  followedWallets: number;
  smartMoneyCount: number;
}

export function getWalletProfilerStats(): WalletProfilerStats {
  let smartMoney = 0;
  for (const profile of walletCache.values()) {
    if (profile.tags.isSmartMoney) smartMoney++;
  }
  return {
    totalProfiles: walletCache.size,
    followedWallets: followedWallets.size,
    smartMoneyCount: smartMoney,
  };
}