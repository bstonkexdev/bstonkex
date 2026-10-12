// Cupcak8 Swap Degen Mode — Execution service (simplified)
// Degen Mode = passwordless manual trading, no session management
import type { ChainId } from '../config';
import { isDegenActiveFor } from './degen-mode';

// ── Types ──────────────────────────────────────────────────

export interface DegenExecuteParams {
  quoteId: string;
  token: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  amount: number;
  amountUsd: number;
  slippage: number;
  chainId: ChainId;
  walletAddress: string;
  clientRequestId: string;
}

export interface DegenExecuteResult {
  success: boolean;
  status: string;
  executionId?: string;
  transactionHash?: string;
  error?: string;
}

// ── Check if degen is active for current context ───────────

export function isDegenAuthorized(walletAddress: string, chainId: ChainId): boolean {
  return isDegenActiveFor(walletAddress, chainId);
}

/** Validate that a degen trade can proceed — checks wallet + chain only */
export function validateDegenTrade(params: {
  walletAddress: string;
  chainId: ChainId;
}): { valid: boolean; reason?: string } {
  if (!isDegenActiveFor(params.walletAddress, params.chainId)) {
    return { valid: false, reason: 'DEGEN MODE NOT ACTIVE FOR THIS WALLET/CHAIN' };
  }
  return { valid: true };
}
