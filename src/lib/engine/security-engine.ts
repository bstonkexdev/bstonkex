// BSTONKEX Security Engine — Centralized trade validation & security checks
// Non-authoritative: frontend validation only. Authoritative state from blockchain/backend.
import type { ChainId } from '../config';
import { CHAINS, PLATFORM_FEE_PCT } from '../config';

// ── Check Result Model ───────────────────────────────────────

export type CheckStatus = 'pass' | 'warning' | 'block' | 'unknown';
export type CheckSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface SecurityCheck {
  id: string;
  check: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  source: 'frontend' | 'backend' | 'blockchain' | 'config';
  timestamp: number;
}

export interface TradeReadinessResult {
  ready: boolean;
  checks: SecurityCheck[];
  blockingChecks: SecurityCheck[];
  warningChecks: SecurityCheck[];
  allPassed: boolean;
}

// ── Trusted Spender Allowlist ────────────────────────────────

// Known trusted execution contracts per chain
const TRUSTED_SPENDERS: Record<string, string[]> = {
  bsc: [
    '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch v4
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x
    '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // PancakeSwap Router v2
  ],
  base: [
    '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch v4
    '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x
    '0x2626664c2603336E57B271c5C0b26F421741e481', // Base Uniswap Router
  ],
  solana: [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  ],
  robinhood: [
    '0x1111111254fb6c44bac0bed2854e76f90643097d',
  ],
};

// ── Security Checks ──────────────────────────────────────────

export function checkWallet(wallet: { connected: boolean; address: string | null }): SecurityCheck {
  return {
    id: 'wallet', check: 'WALLET',
    status: wallet.connected && wallet.address ? 'pass' : 'block',
    severity: 'critical',
    message: wallet.connected ? `${wallet.address?.slice(0, 6)}...${wallet.address?.slice(-4)}` : 'Wallet not connected',
    source: 'frontend', timestamp: Date.now(),
  };
}

export function checkNetwork(walletChain: ChainId | null, requiredChain: ChainId): SecurityCheck {
  const match = walletChain === requiredChain;
  const chainName = CHAINS[requiredChain]?.name || requiredChain;
  return {
    id: 'network', check: 'NETWORK',
    status: match ? 'pass' : walletChain ? 'block' : 'unknown',
    severity: 'critical',
    message: match ? `Connected to ${chainName}` : walletChain ? `Connected: ${CHAINS[walletChain]?.name || walletChain} · Required: ${chainName}` : 'Network unknown',
    source: 'frontend', timestamp: Date.now(),
  };
}

export function checkBalance(
  balance: number | null,
  tradeAmount: number,
  networkFeeReserve: number,
  nativePrice: number,
): SecurityCheck {
  if (balance == null) {
    return { id: 'balance', check: 'BALANCE', status: 'unknown', severity: 'high', message: 'Balance unavailable', source: 'frontend', timestamp: Date.now() };
  }
  const balanceUsd = balance * nativePrice;
  const requiredUsd = tradeAmount + (networkFeeReserve * nativePrice);
  const sufficient = balanceUsd >= requiredUsd;
  return {
    id: 'balance', check: 'BALANCE',
    status: sufficient ? 'pass' : 'block',
    severity: 'critical',
    message: sufficient
      ? `Balance: $${balanceUsd.toFixed(2)}`
      : `Insufficient: $${balanceUsd.toFixed(2)} available, $${requiredUsd.toFixed(2)} required`,
    source: 'frontend', timestamp: Date.now(),
  };
}

export function checkQuote(quote: { available: boolean; quoteId: string; remainingSeconds: number } | null): SecurityCheck {
  if (!quote) {
    return { id: 'quote', check: 'QUOTE', status: 'unknown', severity: 'medium', message: 'No quote', source: 'frontend', timestamp: Date.now() };
  }
  if (!quote.available) {
    return { id: 'quote', check: 'QUOTE', status: 'block', severity: 'high', message: 'Quote unavailable — no route found', source: 'frontend', timestamp: Date.now() };
  }
  if (quote.remainingSeconds <= 0) {
    return { id: 'quote', check: 'QUOTE', status: 'block', severity: 'high', message: 'Quote expired — refresh required', source: 'frontend', timestamp: Date.now() };
  }
  return {
    id: 'quote', check: 'QUOTE',
    status: 'pass', severity: 'medium',
    message: `Valid for ${quote.remainingSeconds}s`,
    source: 'frontend', timestamp: Date.now(),
  };
}

export function checkPriceImpact(priceImpact: number): SecurityCheck {
  let status: CheckStatus = 'pass';
  let severity: CheckSeverity = 'info';
  let message = `Impact: ${priceImpact.toFixed(2)}%`;

  if (priceImpact >= 15) { status = 'block'; severity = 'critical'; message = `EXTREME: ${priceImpact.toFixed(2)}%`; }
  else if (priceImpact >= 5) { status = 'warning'; severity = 'high'; message = `HIGH: ${priceImpact.toFixed(2)}%`; }
  else if (priceImpact >= 1) { status = 'warning'; severity = 'medium'; message = `${priceImpact.toFixed(2)}%`; }

  return { id: 'priceImpact', check: 'PRICE IMPACT', status, severity, message, source: 'frontend', timestamp: Date.now() };
}

export function checkSlippage(slippage: number): SecurityCheck {
  let status: CheckStatus = 'pass';
  let severity: CheckSeverity = 'info';
  let message = `${slippage}%`;

  if (slippage >= 10) { status = 'warning'; severity = 'high'; message = `VERY HIGH: ${slippage}%`; }
  else if (slippage >= 3) { status = 'warning'; severity = 'medium'; message = `HIGH: ${slippage}%`; }

  return { id: 'slippage', check: 'SLIPPAGE', status, severity, message, source: 'frontend', timestamp: Date.now() };
}

export function checkRoute(route: string[], dex: string | undefined): SecurityCheck {
  if (route.length === 0) {
    return { id: 'route', check: 'ROUTE', status: 'block', severity: 'high', message: 'No route available', source: 'frontend', timestamp: Date.now() };
  }
  return {
    id: 'route', check: 'ROUTE',
    status: 'pass', severity: 'low',
    message: `${route.join(' → ')}${dex ? ` (${dex})` : ''}`,
    source: 'frontend', timestamp: Date.now(),
  };
}

export function checkSpender(chainId: ChainId, spender: string | undefined): SecurityCheck {
  if (!spender) {
    return { id: 'spender', check: 'SPENDER', status: 'unknown', severity: 'medium', message: 'Spender unknown', source: 'frontend', timestamp: Date.now() };
  }
  const trusted = TRUSTED_SPENDERS[chainId] || [];
  const isTrusted = trusted.some(t => t.toLowerCase() === spender.toLowerCase());
  return {
    id: 'spender', check: 'SPENDER',
    status: isTrusted ? 'pass' : 'warning',
    severity: isTrusted ? 'low' : 'high',
    message: isTrusted ? 'Verified execution target' : `Unknown: ${spender.slice(0, 8)}...${spender.slice(-4)}`,
    source: 'config', timestamp: Date.now(),
  };
}

export function checkFee(platformFeePct: number): SecurityCheck {
  const expected = PLATFORM_FEE_PCT * 100;
  const match = Math.abs(platformFeePct - expected) < 0.01;
  return {
    id: 'fee', check: 'FEE',
    status: match ? 'pass' : 'warning',
    severity: match ? 'info' : 'medium',
    message: `BSTONKEX: ${platformFeePct.toFixed(2)}%`,
    source: 'config', timestamp: Date.now(),
  };
}

// ── Full Trade Readiness ─────────────────────────────────────

export interface TradeReadinessParams {
  wallet: { connected: boolean; address: string | null };
  walletChain: ChainId | null;
  requiredChain: ChainId;
  balance: number | null;
  tradeAmount: number;
  networkFeeReserve: number;
  nativePrice: number;
  quote: { available: boolean; quoteId: string; remainingSeconds: number } | null;
  priceImpact: number;
  slippage: number;
  route: string[];
  dex: string | undefined;
  spender: string | undefined;
  platformFeePct: number;
}

export function checkTradeReadiness(params: TradeReadinessParams): TradeReadinessResult {
  const checks: SecurityCheck[] = [
    checkWallet(params.wallet),
    checkNetwork(params.walletChain, params.requiredChain),
    checkBalance(params.balance, params.tradeAmount, params.networkFeeReserve, params.nativePrice),
    checkQuote(params.quote),
    checkPriceImpact(params.priceImpact),
    checkSlippage(params.slippage),
    checkRoute(params.route, params.dex),
    checkSpender(params.requiredChain, params.spender),
    checkFee(params.platformFeePct),
  ];

  const blockingChecks = checks.filter(c => c.status === 'block');
  const warningChecks = checks.filter(c => c.status === 'warning');
  const allPassed = checks.every(c => c.status === 'pass' || c.status === 'unknown');
  const ready = blockingChecks.length === 0;

  return { ready, checks, blockingChecks, warningChecks, allPassed };
}

// ── Helpers ──────────────────────────────────────────────────

export function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'pass': return '✓';
    case 'warning': return '⚠';
    case 'block': return '✗';
    case 'unknown': return '?';
  }
}

export function statusColor(status: CheckStatus): string {
  switch (status) {
    case 'pass': return 'var(--green)';
    case 'warning': return 'var(--amber)';
    case 'block': return 'var(--red)';
    case 'unknown': return 'var(--text-dim)';
  }
}

export function severityColor(severity: CheckSeverity): string {
  switch (severity) {
    case 'info': return 'var(--text-dim)';
    case 'low': return 'var(--green)';
    case 'medium': return 'var(--amber)';
    case 'high': return 'var(--red)';
    case 'critical': return 'var(--red)';
  }
}