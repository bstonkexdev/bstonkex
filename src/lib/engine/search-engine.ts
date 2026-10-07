// BSTONKEX Search Engine — type detection, cross-chain search, command palette
import { DEXSCREENER_API, type ChainId, CHAINS, CONFIGURED_CHAINS, shortenAddress } from '../config';
import { searchTokens, type SearchResult } from '../market';
import { cacheGetOrCompute, CACHE_KEYS, TTL } from './cache';
import { isSandboxed } from './sandbox';

// ── Search Result Types ──────────────────────────────────────

export type SearchCategory = 'token' | 'pair' | 'wallet' | 'transaction' | 'contract' | 'command' | 'page' | 'username';

export interface UnifiedSearchResult {
  category: SearchCategory;
  chainId?: ChainId;
  address?: string;
  symbol?: string;
  name?: string;
  logo?: string | null;
  price?: number | null;
  change24h?: number | null;
  volume24h?: number | null;
  liquidity?: number | null;
  marketCap?: number | null;
  dex?: string;
  pair?: string;
  meta?: string;
  action?: () => void;
}

// ── Input Type Detection ─────────────────────────────────────

export function detectInputType(input: string): { type: SearchCategory; chainId?: ChainId } {
  const q = input.trim();
  if (!q) return { type: 'command' };

  // Command: starts with /
  if (q.startsWith('/')) return { type: 'command' };

  // Username: starts with @
  if (q.startsWith('@')) return { type: 'username' };

  // EVM address: 0x + 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(q)) return { type: 'contract' };

  // Transaction hash (long hex, 64+ chars after 0x)
  if (/^0x[a-fA-F0-9]{64,}$/.test(q)) return { type: 'transaction' };

  // Solana address: base58, 32-44 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q) && q.length >= 32) return { type: 'contract' };

  // Pair: contains /
  if (q.includes('/')) return { type: 'pair' };

  // Default: token symbol/name
  return { type: 'token' };
}

// ── Command Registry ─────────────────────────────────────────

export interface Command {
  id: string;
  label: string;
  description: string;
  category: 'navigation' | 'trading' | 'search' | 'user' | 'settings';
  action: string; // page or action identifier
  keywords: string[];
}

export const COMMANDS: Command[] = [
  // Navigation
  { id: 'home', label: 'Go Home', description: 'Open dashboard', category: 'navigation', action: 'landing', keywords: ['home', 'dashboard', 'landing'] },
  { id: 'markets', label: 'Open Markets', description: 'Market discovery', category: 'navigation', action: 'markets', keywords: ['markets', 'discover', 'tokens'] },
  { id: 'trade', label: 'Open Trade', description: 'Trading terminal', category: 'navigation', action: 'trade', keywords: ['trade', 'swap', 'exchange'] },
  { id: 'activity', label: 'Open Activity', description: 'Live market activity', category: 'navigation', action: 'activity', keywords: ['activity', 'trades', 'live'] },
  { id: 'portfolio', label: 'Open Portfolio', description: 'Your portfolio', category: 'navigation', action: 'portfolio', keywords: ['portfolio', 'positions', 'holdings'] },
  { id: 'watchlist', label: 'Open Watchlist', description: 'Your watchlist', category: 'navigation', action: 'watchlist', keywords: ['watchlist', 'watch', 'favorites'] },
  { id: 'referrals', label: 'Open Referrals', description: 'Referral center', category: 'navigation', action: 'referrals', keywords: ['referral', 'referrals', 'earn', 'affiliate'] },
  { id: 'fees', label: 'Open Fees', description: 'Fee dashboard', category: 'navigation', action: 'fees', keywords: ['fees', 'fee', 'cost'] },
  { id: 'alerts', label: 'Open Alerts', description: 'Alert manager', category: 'navigation', action: 'activity', keywords: ['alerts', 'alert', 'notification'] },

  // Search
  { id: 'search-token', label: 'Search Token', description: 'Find tokens by symbol or name', category: 'search', action: 'search:token', keywords: ['token', 'search', 'find'] },
  { id: 'search-market', label: 'Search Market', description: 'Find trading pairs', category: 'search', action: 'search:market', keywords: ['market', 'pair', 'search'] },
  { id: 'search-wallet', label: 'Search Wallet', description: 'Look up wallet address', category: 'search', action: 'search:wallet', keywords: ['wallet', 'address', 'lookup'] },
  { id: 'search-tx', label: 'Search Transaction', description: 'Look up transaction hash', category: 'search', action: 'search:tx', keywords: ['transaction', 'tx', 'hash'] },

  // User
  { id: 'connect', label: 'Connect Wallet', description: 'Connect your wallet', category: 'user', action: 'connect', keywords: ['connect', 'wallet', 'login'] },
  { id: 'disconnect', label: 'Disconnect Wallet', description: 'Disconnect current wallet', category: 'user', action: 'disconnect', keywords: ['disconnect', 'logout'] },
  { id: 'network', label: 'Change Network', description: 'Switch active chain', category: 'user', action: 'network', keywords: ['network', 'chain', 'switch'] },
  { id: 'notifications', label: 'View Notifications', description: 'Open notification panel', category: 'user', action: 'notifications', keywords: ['notifications', 'notif', 'bell'] },
  { id: 'copy-referral', label: 'Copy Referral Link', description: 'Copy your referral link', category: 'user', action: 'copy-referral', keywords: ['referral', 'link', 'copy', 'share'] },
  { id: 'claim-rewards', label: 'Claim Rewards', description: 'Claim referral rewards', category: 'user', action: 'claim-rewards', keywords: ['claim', 'rewards', 'earn'] },
];

export function searchCommands(query: string): Command[] {
  const q = query.toLowerCase().replace('/', '');
  if (!q) return COMMANDS;
  return COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(q) ||
    cmd.description.toLowerCase().includes(q) ||
    cmd.keywords.some(k => k.includes(q))
  );
}

// ── Unified Search ───────────────────────────────────────────

export async function unifiedSearch(query: string): Promise<{
  tokens: SearchResult[];
  commands: Command[];
  detected: { type: SearchCategory; chainId?: ChainId };
}> {
  const q = query.trim();
  const detected = detectInputType(q);

  if (!q) return { tokens: [], commands: COMMANDS.slice(0, 8), detected };

  // Command search
  if (detected.type === 'command') {
    return { tokens: [], commands: searchCommands(q), detected };
  }

  // Username search
  if (detected.type === 'username') {
    return { tokens: [], commands: [{ id: 'username', label: `@${q.slice(1)}`, description: 'View referral profile', category: 'user', action: `username:${q.slice(1)}`, keywords: [] }], detected };
  }

  // Token/pair search via DexScreener
  const [tokens, commands] = await Promise.all([
    searchTokens(q).catch(() => []),
    Promise.resolve(searchCommands(q)),
  ]);

  return { tokens, commands, detected };
}

// ── Recent Searches (local storage) ──────────────────────────

const RECENT_KEY = 'bstonkex_recent_searches';
const MAX_RECENT = 10;

export function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

export function addRecentSearch(query: string) {
  const q = query.trim();
  if (!q || q.length < 2) return;
  const recent = getRecentSearches().filter(r => r !== q);
  recent.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
}

// ── Helpers ──────────────────────────────────────────────────

export function isEvmAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function isSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) && s.length >= 32;
}

export function isTxHash(s: string): boolean {
  return /^0x[a-fA-F0-9]{64,}$/.test(s);
}