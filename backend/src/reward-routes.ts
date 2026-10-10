/**
 * BSTONKEX Reward API Routes — /auth/* and /rewards/* endpoints.
 *
 * Security properties:
 *   - All endpoints validate inputs (monetary precision, IDs, types)
 *   - Service-key endpoints REJECT session tokens and vice versa
 *   - Wallet identity always from verified session, never caller-supplied
 *   - Status transitions enforced (cannot claim already-claimed, etc.)
 *   - No trust in browser-submitted trade/fee amounts (service-key only)
 *   - Rate limiting on auth endpoints
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createNonce,
  verifyNonce,
  verifySignature,
  issueSessionToken,
  authenticateRequest,
  authenticateServiceKey,
  upsertWalletUser,
} from './auth.js';
import {
  processAllocationAtomic,
  getWalletRewardSummary,
  getAllocationsByWallet,
  getAllocationsByReferrer,
  getClaimsByWallet,
  insertRewardClaim,
  updateClaimStatus,
  insertRewardPayout,
  updatePayoutStatus,
  writeAuditLog,
  type AllocationInput,
} from './db/queries.js';
import { isDbConfigured } from './db/pool.js';

// ── Helpers ──────────────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function requireDb(res: ServerResponse): boolean {
  if (!isDbConfigured()) {
    json(res, 503, { error: 'DATABASE_NOT_CONFIGURED' });
    return false;
  }
  return true;
}

/** Require valid session token. Returns wallet from token (never from request body). */
function requireAuth(req: IncomingMessage, res: ServerResponse): string | null {
  const auth = authenticateRequest(req.headers.authorization);
  if (!auth.walletAddress) {
    json(res, 401, { error: auth.error || 'UNAUTHORIZED' });
    return null;
  }
  return auth.walletAddress;
}

/** Require service key. REJECTS session tokens. */
function requireServiceKey(req: IncomingMessage, res: ServerResponse): boolean {
  // Explicitly reject if a Bearer token is present (service-key endpoints must not accept sessions)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    json(res, 403, { error: 'SERVICE_KEY_REQUIRED_SESSION_TOKEN_REJECTED' });
    return false;
  }
  const serviceKey = req.headers['x-service-key'] as string | undefined;
  if (!authenticateServiceKey(serviceKey)) {
    json(res, 401, { error: 'SERVICE_KEY_REQUIRED' });
    return false;
  }
  return true;
}

/** Validate monetary amount: finite, non-negative, max 6 decimal places, max $10M */
function validateAmount(value: unknown, fieldName: string): { valid: boolean; value: number; error?: string } {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, value: 0, error: `${fieldName} must be a non-negative finite number` };
  }
  if (num > 10_000_000) {
    return { valid: false, value: 0, error: `${fieldName} exceeds maximum allowed value` };
  }
  // Check for more than 6 decimal places (NUMERIC(18,6))
  const str = String(num);
  const dotIndex = str.indexOf('.');
  if (dotIndex >= 0 && str.length - dotIndex - 1 > 6) {
    return { valid: false, value: 0, error: `${fieldName} has too many decimal places (max 6)` };
  }
  return { valid: true, value: num };
}

/** Validate tx hash format */
function validateTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash) || /^[a-fA-F0-9]{64}$/.test(hash);
}

// ── Auth Routes ──────────────────────────────────────────────

/** POST /auth/nonce — Get a nonce for wallet signature */
export async function handleAuthNonce(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const walletAddress = String(body.walletAddress || '');
    if (!walletAddress) {
      json(res, 400, { error: 'walletAddress required' });
      return;
    }

    // Validate EVM address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress.toLowerCase().trim())) {
      json(res, 400, { error: 'Invalid EVM wallet address format' });
      return;
    }

    if (!requireDb(res)) return;
    const clientIp = req.socket.remoteAddress;
    const result = await createNonce(walletAddress, clientIp);
    if (!result) {
      json(res, 429, { error: 'Rate limited or invalid wallet address' });
      return;
    }

    json(res, 200, {
      nonce: result.nonce,
      expiresAt: result.expiresAt,
      message: result.message,
    });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** POST /auth/verify — Verify signature and get session token */
export async function handleAuthVerify(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readBody(req);
    const walletAddress = String(body.walletAddress || '').toLowerCase().trim();
    const nonce = String(body.nonce || '');
    const signature = String(body.signature || '');

    if (!walletAddress || !nonce || !signature) {
      json(res, 400, { error: 'walletAddress, nonce, and signature required' });
      return;
    }

    // Validate formats
    if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
      json(res, 400, { error: 'Invalid wallet address format' });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(nonce)) {
      json(res, 400, { error: 'Invalid nonce format' });
      return;
    }

    if (!requireDb(res)) return;

    // 1. Consume nonce atomically (prevents replay)
    const nonceValid = await verifyNonce(walletAddress, nonce);
    if (!nonceValid) {
      json(res, 401, { error: 'Invalid, expired, or already-used nonce' });
      return;
    }

    // 2. Verify signature with viem (recovers signer and compares to wallet)
    const sigResult = await verifySignature(walletAddress, nonce, signature);
    if (!sigResult.valid) {
      json(res, 401, { error: sigResult.reason || 'Signature verification failed' });
      return;
    }

    // 3. Upsert user
    await upsertWalletUser(walletAddress);

    // 4. Issue session token
    const token = issueSessionToken(walletAddress);

    await writeAuditLog({ action: 'auth_verify', walletAddress });

    json(res, 200, {
      token,
      walletAddress,
    });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

// ── Reward Routes (session-authenticated) ────────────────────

/** GET /rewards/summary — Get user's reward summary (own wallet only) */
export async function handleRewardSummary(req: IncomingMessage, res: ServerResponse) {
  const wallet = requireAuth(req, res);
  if (!wallet) return;
  if (!requireDb(res)) return;

  try {
    const summary = await getWalletRewardSummary(wallet);
    json(res, 200, summary);
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** GET /rewards/cashback — Get user's cashback allocations (own wallet only) */
export async function handleRewardCashback(req: IncomingMessage, res: ServerResponse) {
  const wallet = requireAuth(req, res);
  if (!wallet) return;
  if (!requireDb(res)) return;

  try {
    const allocations = await getAllocationsByWallet(wallet);
    const cashback = allocations
      .filter(a => parseFloat(a.cashback_reward_final) > 0)
      .map(a => ({
        id: a.id,
        tradeId: a.trade_id,
        cashbackReward: a.cashback_reward_final,
        cashbackTierName: a.cashback_tier_name,
        cashbackTierRatePct: a.cashback_tier_rate_pct,
        status: a.status,
        createdAt: a.created_at,
      }));
    json(res, 200, { records: cashback });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** GET /rewards/referral — Get user's referral allocations (own wallet only) */
export async function handleRewardReferral(req: IncomingMessage, res: ServerResponse) {
  const wallet = requireAuth(req, res);
  if (!wallet) return;
  if (!requireDb(res)) return;

  try {
    // Users can only see their OWN referral allocations (as referrer)
    const allocations = await getAllocationsByWallet(wallet);
    const referral = allocations
      .filter(a => parseFloat(a.referral_reward_final) > 0)
      .map(a => ({
        id: a.id,
        tradeId: a.trade_id,
        referrerUsername: a.referrer_username,
        referralReward: a.referral_reward_final,
        referralPct: a.referral_pct,
        status: a.status,
        createdAt: a.created_at,
      }));
    json(res, 200, { records: referral });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** GET /rewards/claims — Get user's claim history (own wallet only) */
export async function handleRewardClaims(req: IncomingMessage, res: ServerResponse) {
  const wallet = requireAuth(req, res);
  if (!wallet) return;
  if (!requireDb(res)) return;

  try {
    const claims = await getClaimsByWallet(wallet);
    json(res, 200, { records: claims });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** POST /rewards/claim — Submit a claim request ($10 minimum) */
export async function handleClaimRequest(req: IncomingMessage, res: ServerResponse) {
  const wallet = requireAuth(req, res);
  if (!wallet) return;
  if (!requireDb(res)) return;

  try {
    const body = await readBody(req);
    const claimType = String(body.claimType || 'combined');
    if (!['cashback', 'referral', 'combined'].includes(claimType)) {
      json(res, 400, { error: 'claimType must be cashback, referral, or combined' });
      return;
    }

    // Get claimable amounts for THIS wallet only (from verified session)
    const summary = await getWalletRewardSummary(wallet);
    const claimable = claimType === 'cashback' ? summary.claimableCashback
      : claimType === 'referral' ? summary.claimableReferral
      : summary.claimableCashback + summary.claimableReferral;

    const MIN_CLAIM = 10.0;
    if (claimable < MIN_CLAIM) {
      json(res, 400, { error: `Minimum claim: $${MIN_CLAIM}`, claimable });
      return;
    }

    // Validate amount precision
    const amtCheck = validateAmount(claimable, 'claimable amount');
    if (!amtCheck.valid) {
      json(res, 400, { error: amtCheck.error });
      return;
    }

    // Create claim record
    const claim = await insertRewardClaim({
      walletAddress: wallet,
      claimType: claimType as 'cashback' | 'referral' | 'combined',
      amount: claimable,
      claimMinimum: MIN_CLAIM,
    });

    await writeAuditLog({
      action: 'claim_requested',
      walletAddress: wallet,
      details: { claimType, amount: claimable, claimId: claim.id },
    });

    json(res, 201, {
      claim,
      message: 'Claim requested. Status is claim_requested — no funds have been transferred.',
    });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

// ── Service-Key Routes (internal only) ───────────────────────

/** POST /rewards/allocation — Record a trade allocation (service key only) */
export async function handleAllocationRecord(req: IncomingMessage, res: ServerResponse) {
  if (!requireDb(res)) return;
  if (!requireServiceKey(req, res)) return;

  try {
    const body = await readBody(req);

    // Validate required fields
    const txHash = String(body.txHash || '');
    const walletAddress = String(body.walletAddress || '').toLowerCase().trim();

    if (!txHash || !validateTxHash(txHash)) {
      json(res, 400, { error: 'Valid txHash required (0x + 64 hex chars)' });
      return;
    }
    if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(walletAddress)) {
      json(res, 400, { error: 'Valid EVM walletAddress required' });
      return;
    }

    // Validate monetary amounts with precision checks
    const tradeAmt = validateAmount(body.tradeAmountUsd, 'tradeAmountUsd');
    if (!tradeAmt.valid) { json(res, 400, { error: tradeAmt.error }); return; }

    const feeAmt = validateAmount(body.platformFeeUsd, 'platformFeeUsd');
    if (!feeAmt.valid) { json(res, 400, { error: feeAmt.error }); return; }

    // Validate percentages (0-100)
    const refPct = Number(body.referralSharePct || 0);
    const cbPct = Number(body.cashbackRatePct || 0);
    if (refPct < 0 || refPct > 100 || cbPct < 0 || cbPct > 100) {
      json(res, 400, { error: 'Percentages must be 0-100' });
      return;
    }

    const logIndex = body.logIndex != null ? Number(body.logIndex) : null;
    if (logIndex !== null && (!Number.isInteger(logIndex) || logIndex < 0)) {
      json(res, 400, { error: 'logIndex must be a non-negative integer' });
      return;
    }

    const input: AllocationInput = {
      chainId: String(body.chainId || 'bsc'),
      txHash,
      logIndex,
      walletAddress,
      tradeAmountUsd: tradeAmt.value,
      platformFeeUsd: feeAmt.value,
      referrerUsername: body.referrerUsername ? String(body.referrerUsername).slice(0, 50) : null,
      referralSharePct: refPct,
      cashbackRatePct: cbPct,
      cashbackTierName: String(body.cashbackTierName || 'Novice').slice(0, 30),
      cashbackTierRatePct: Math.min(100, Math.max(0, Number(body.cashbackTierRatePct || 5))),
      tokenAddress: body.tokenAddress ? String(body.tokenAddress).slice(0, 100) : undefined,
      tokenSymbol: body.tokenSymbol ? String(body.tokenSymbol).slice(0, 20) : undefined,
      side: body.side === 'sell' ? 'sell' : 'buy',
      blockNumber: body.blockNumber && Number.isInteger(Number(body.blockNumber)) ? Number(body.blockNumber) : undefined,
    };

    const result = await processAllocationAtomic(input);

    await writeAuditLog({
      action: result.duplicate ? 'allocation_duplicate' : 'allocation_recorded',
      tradeId: txHash,
      walletAddress,
      details: {
        tradeId: result.tradeId,
        feeId: result.feeId,
        allocationId: result.allocationId,
        referralFinal: result.allocation.referral_reward_final,
        cashbackFinal: result.allocation.cashback_reward_final,
        capped: result.allocation.capped,
      },
    });

    json(res, result.duplicate ? 200 : 201, {
      tradeId: result.tradeId,
      feeId: result.feeId,
      allocationId: result.allocationId,
      duplicate: result.duplicate,
      allocation: result.allocation,
    });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** POST /rewards/settle — Mark a claim as paid (service key only, after verified payout) */
export async function handleSettle(req: IncomingMessage, res: ServerResponse) {
  if (!requireDb(res)) return;
  if (!requireServiceKey(req, res)) return;

  try {
    const body = await readBody(req);
    const claimId = Number(body.claimId || 0);
    const payoutTxHash = body.txHash ? String(body.txHash) : undefined;
    const chainId = body.chainId ? String(body.chainId) : undefined;

    if (!claimId || !Number.isInteger(claimId) || claimId <= 0) {
      json(res, 400, { error: 'Valid positive integer claimId required' });
      return;
    }

    // Validate tx hash if provided
    if (payoutTxHash && !validateTxHash(payoutTxHash)) {
      json(res, 400, { error: 'Invalid tx hash format' });
      return;
    }

    // Validate amount
    const amtCheck = validateAmount(body.amount, 'amount');
    if (!amtCheck.valid) {
      json(res, 400, { error: amtCheck.error });
      return;
    }

    const walletAddress = String(body.walletAddress || '').toLowerCase().trim();
    if (!walletAddress || !/^0x[a-f0-9]{40}$/.test(walletAddress)) {
      json(res, 400, { error: 'Valid walletAddress required' });
      return;
    }

    // Create payout record (unique per claim — prevents double payout)
    const payout = await insertRewardPayout({
      claimId,
      walletAddress,
      amount: amtCheck.value,
      chainId,
    });

    if (!payout.duplicate) {
      await updatePayoutStatus(payout.id, 'settled', payoutTxHash);
    }

    // Update claim status to paid
    const claim = await updateClaimStatus(claimId, 'paid', payoutTxHash);

    await writeAuditLog({
      action: 'claim_settled',
      tradeId: `claim:${claimId}`,
      walletAddress,
      details: { claimId, payoutId: payout.id, txHash: payoutTxHash },
    });

    json(res, 200, { claim, payoutId: payout.id, duplicate: payout.duplicate });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

/** POST /rewards/reversal — Reverse a trade's rewards (service key only) */
export async function handleReversal(req: IncomingMessage, res: ServerResponse) {
  if (!requireDb(res)) return;
  if (!requireServiceKey(req, res)) return;

  try {
    const body = await readBody(req);
    const tradeId = String(body.tradeId || '');
    const reason = String(body.reason || 'Trade reversed').slice(0, 200);

    if (!tradeId) {
      json(res, 400, { error: 'tradeId required' });
      return;
    }

    const { query } = await import('./db/pool.js');
    // Use parameterized queries — no SQL injection
    await query(
      `UPDATE verified_trades SET status = 'reverted' WHERE tx_hash = $1 OR id = $2`,
      [tradeId, parseInt(tradeId) || 0]
    );
    await query(
      `UPDATE reward_allocations SET status = 'reversed' WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1 OR id = $2)`,
      [tradeId, parseInt(tradeId) || 0]
    );
    await query(
      `UPDATE collected_platform_fees SET status = 'reversed' WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1 OR id = $2)`,
      [tradeId, parseInt(tradeId) || 0]
    );

    await writeAuditLog({ action: 'reversal', tradeId, details: { reason } });

    json(res, 200, { success: true, tradeId, reason });
  } catch (e: any) {
    json(res, 500, { error: 'Internal error' });
  }
}

// ── Router ───────────────────────────────────────────────────

export function routeRewards(req: IncomingMessage, res: ServerResponse, url: URL): boolean {
  const path = url.pathname;
  const method = req.method || 'GET';

  // Auth routes
  if (method === 'POST' && path === '/auth/nonce') { handleAuthNonce(req, res); return true; }
  if (method === 'POST' && path === '/auth/verify') { handleAuthVerify(req, res); return true; }

  // Session-authenticated reward routes
  if (method === 'GET' && path === '/rewards/summary') { handleRewardSummary(req, res); return true; }
  if (method === 'GET' && path === '/rewards/cashback') { handleRewardCashback(req, res); return true; }
  if (method === 'GET' && path === '/rewards/referral') { handleRewardReferral(req, res); return true; }
  if (method === 'GET' && path === '/rewards/claims') { handleRewardClaims(req, res); return true; }
  if (method === 'POST' && path === '/rewards/claim') { handleClaimRequest(req, res); return true; }

  // Service-key-only reward routes
  if (method === 'POST' && path === '/rewards/allocation') { handleAllocationRecord(req, res); return true; }
  if (method === 'POST' && path === '/rewards/settle') { handleSettle(req, res); return true; }
  if (method === 'POST' && path === '/rewards/reversal') { handleReversal(req, res); return true; }

  return false;
}
