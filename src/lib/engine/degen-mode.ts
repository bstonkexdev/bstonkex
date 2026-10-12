// Cupcak8 Swap Degen Mode Engine — Passwordless / reduced-confirmation manual trading
// Degen Mode = user still manually chooses every trade, just skips repeated wallet confirmation
// NO automated trading, NO bot, NO background execution
import type { ChainId } from '../config';

// ── Types ──────────────────────────────────────────────────

export type DegenStatus = 'off' | 'enabling' | 'on' | 'error';

// ── State ──────────────────────────────────────────────────

let degenOn = false;
let degenWallet: string | null = null;
let degenChain: ChainId | null = null;
let listeners: Array<(on: boolean, wallet: string | null, chain: ChainId | null) => void> = [];

function notify() {
  listeners.forEach(fn => fn(degenOn, degenWallet, degenChain));
}

// ── Public API ─────────────────────────────────────────────

export function onDegenChange(cb: (on: boolean, wallet: string | null, chain: ChainId | null) => void): () => void {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

export function isDegenOn(): boolean {
  return degenOn;
}

export function getDegenWallet(): string | null {
  return degenWallet;
}

export function getDegenChain(): ChainId | null {
  return degenChain;
}

/** Enable degen mode for a specific wallet + chain */
export function enableDegen(walletAddress: string, chainId: ChainId): void {
  degenOn = true;
  degenWallet = walletAddress;
  degenChain = chainId;
  notify();
}

/** Disable degen mode — user still sees normal wallet confirmation */
export function disableDegen(): void {
  degenOn = false;
  degenWallet = null;
  degenChain = null;
  notify();
}

/** Auto-disable on wallet disconnect or wallet change */
export function onWalletDisconnect(): void {
  if (degenOn) disableDegen();
}

/** Auto-disable on chain change (user must re-enable for new chain) */
export function onChainChange(): void {
  if (degenOn) disableDegen();
}

/** Check if degen is active for the current wallet + chain */
export function isDegenActiveFor(walletAddress: string | null, chainId: ChainId): boolean {
  if (!degenOn || !degenWallet || !degenChain) return false;
  if (!walletAddress) return false;
  return degenWallet.toLowerCase() === walletAddress.toLowerCase() && degenChain === chainId;
}

// ── Trade-in-progress lock (prevents double-click) ─────────

let _tradeInProgress = false;

export function acquireTradeLock(): boolean {
  if (_tradeInProgress) return false;
  _tradeInProgress = true;
  return true;
}

export function releaseTradeLock(): void {
  _tradeInProgress = false;
}

// ── Helpers ────────────────────────────────────────────────

export function getNativeSymbol(chainId: ChainId): string {
  const map: Record<string, string> = { bsc: 'BNB', solana: 'SOL', base: 'ETH', robinhood: 'ETH' };
  return map[chainId] || 'TOKEN';
}
