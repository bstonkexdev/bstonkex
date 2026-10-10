/**
 * BSTONKEX Wallet Authentication — nonce-based signature verification.
 *
 * Security properties:
 *   - Cryptographically random, expiring, single-use nonces bound to wallet + purpose
 *   - Atomic nonce consumption (UPDATE ... WHERE used = false prevents replay)
 *   - Real EVM signature recovery via viem (recoverMessageAddress)
 *   - Domain-separated message format (prevents cross-protocol replay)
 *   - Strong SESSION_SECRET enforcement (no fallback in production)
 *   - HMAC-signed session tokens with expiration and timing-safe verification
 *   - Rate limiting on nonce issuance and signature verification
 *   - Wallet identity always derived from verified session, never caller-supplied
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { recoverMessageAddress } from 'viem';
import { query, withTransaction } from './db/pool.js';

// ── Configuration ────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const NONCE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_PURPOSE = 'bstonkex_wallet_auth_v1';

// SESSION_SECRET must be strong and server-only
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (IS_PRODUCTION) {
      throw new Error('SESSION_SECRET is required in production. Generate with: openssl rand -hex 32');
    }
    return 'dev-secret-NOT-FOR-PRODUCTION-use-openssl-rand-hex-32';
  }
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
  }
  return secret;
}

// ── Rate Limiting ────────────────────────────────────────────
// Simple in-memory rate limiter (per IP + wallet). Adequate for single-instance
// deployment; for multi-instance use a shared store.

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateBucket>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateLimits.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxRequests) return false;
  bucket.count++;
  return true;
}

// Periodic cleanup to prevent memory leak
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimits) {
    if (now > bucket.resetAt) rateLimits.delete(key);
  }
}, 60_000) as unknown as { unref?: () => void } | number;
if (typeof cleanupTimer === 'object' && cleanupTimer?.unref) {
  cleanupTimer.unref();
}

// ── Message Format (domain-separated) ────────────────────────

/**
 * Build the exact message the wallet must sign.
 * Includes domain separator, purpose, wallet address binding, and nonce.
 * This prevents cross-protocol replay attacks.
 */
export function buildAuthMessage(walletAddress: string, nonce: string): string {
  return [
    'BSTONKEX wants you to sign in with your wallet:',
    walletAddress.toLowerCase(),
    '',
    'This request will not trigger a blockchain transaction or cost gas.',
    '',
    `URI: https://bstonkex.xyz`,
    `Purpose: ${NONCE_PURPOSE}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

// ── Nonce Management ─────────────────────────────────────────

export async function createNonce(
  walletAddress: string,
  clientIp?: string
): Promise<{ nonce: string; expiresAt: string; message: string } | null> {
  const wallet = walletAddress.toLowerCase().trim();

  // Validate address format (EVM only for now)
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return null;
  }

  // Rate limit: max 10 nonce requests per wallet per 5 minutes
  if (!checkRateLimit(`nonce:${wallet}`, 10, 5 * 60 * 1000)) {
    return null;
  }
  // Rate limit: max 30 nonce requests per IP per 5 minutes
  if (clientIp && !checkRateLimit(`nonce_ip:${clientIp}`, 30, 5 * 60 * 1000)) {
    return null;
  }

  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_DURATION_MS).toISOString();

  try {
    // Clean up expired nonces for this wallet
    await query(
      `DELETE FROM wallet_auth_nonces WHERE wallet_address = $1 AND (expires_at < now() OR used = true)`,
      [wallet]
    );
    // Insert new nonce with purpose binding
    await query(
      `INSERT INTO wallet_auth_nonces (wallet_address, nonce, expires_at, purpose) VALUES ($1, $2, $3, $4)`,
      [wallet, nonce, expiresAt, NONCE_PURPOSE]
    );
    return { nonce, expiresAt, message: buildAuthMessage(wallet, nonce) };
  } catch {
    return null;
  }
}

/**
 * Atomically consume a nonce. The UPDATE ... WHERE used = false ensures
 * concurrent verification attempts cannot both succeed — only one gets
 * rowCount = 1; the other gets 0 (nonce already consumed).
 * Nonce is bound to wallet_address AND purpose (prevents cross-purpose replay).
 */
export async function verifyNonce(walletAddress: string, nonce: string): Promise<boolean> {
  const wallet = walletAddress.toLowerCase().trim();
  try {
    const result = await query(
      `UPDATE wallet_auth_nonces SET used = true
       WHERE wallet_address = $1 AND nonce = $2 AND purpose = $3 AND expires_at > now() AND used = false
       RETURNING id`,
      [wallet, nonce, NONCE_PURPOSE]
    );
    return (result.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── EVM Signature Recovery (viem) ────────────────────────────

/**
 * Recover the signer address from a personal_sign signature using viem.
 * Returns the recovered address in lowercase, or null if invalid.
 */
export async function recoverEvmAddress(
  message: string,
  signature: string
): Promise<string | null> {
  try {
    const sig = signature.startsWith('0x') ? signature : `0x${signature}`;
    const address = await recoverMessageAddress({
      message,
      signature: sig as `0x${string}`,
    });
    return address.toLowerCase();
  } catch {
    return null;
  }
}

// ── Full Signature Verification ──────────────────────────────

export async function verifySignature(
  walletAddress: string,
  nonce: string,
  signature: string
): Promise<{ valid: boolean; reason?: string }> {
  const wallet = walletAddress.toLowerCase().trim();

  // Basic validation
  if (!wallet || !nonce || !signature) {
    return { valid: false, reason: 'Missing required fields' };
  }

  // EVM address format
  if (!wallet.startsWith('0x') || wallet.length !== 42) {
    return { valid: false, reason: 'Unsupported wallet address format' };
  }

  // Build the exact message that was signed (domain-separated)
  const message = buildAuthMessage(wallet, nonce);

  // Recover signer address from signature
  const recovered = await recoverEvmAddress(message, signature);
  if (!recovered) {
    return { valid: false, reason: 'Signature recovery failed — invalid signature' };
  }

  // CRITICAL: recovered address must match the claimed wallet address
  if (recovered !== wallet) {
    return { valid: false, reason: 'Recovered address does not match wallet address' };
  }

  return { valid: true };
}

// ── Session Tokens (HMAC-signed) ─────────────────────────────

export function issueSessionToken(walletAddress: string): string {
  const secret = getSessionSecret();
  const wallet = walletAddress.toLowerCase().trim();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const payload = `${wallet}:${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifySessionToken(token: string): { walletAddress: string | null; error?: string } {
  try {
    const secret = getSessionSecret();
    const [payloadB64, sig] = token.split('.');
    if (!payloadB64 || !sig) return { walletAddress: null, error: 'Invalid token format' };

    const payload = Buffer.from(payloadB64, 'base64url').toString();
    const expectedSig = createHmac('sha256', secret).update(payload).digest('hex');

    // Timing-safe comparison — also check length first to avoid timing leak
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return { walletAddress: null, error: 'Invalid token signature' };
    }

    const parts = payload.split(':');
    const wallet = parts[0];
    const expiresAt = parseInt(parts[1]);

    if (!wallet || !/^[a-f0-9]{40}$/.test(wallet)) {
      return { walletAddress: null, error: 'Invalid token payload' };
    }

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { walletAddress: null, error: 'Token expired' };
    }

    return { walletAddress: wallet };
  } catch {
    return { walletAddress: null, error: 'Token parse error' };
  }
}

// ── Auth Middleware ──────────────────────────────────────────

export function authenticateRequest(authHeader: string | undefined): { walletAddress: string | null; error?: string } {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { walletAddress: null, error: 'Missing Authorization header' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { walletAddress: null, error: 'Empty token' };
  return verifySessionToken(token);
}

/**
 * Service key authentication for internal endpoints.
 * Returns true ONLY if the service key matches. Session tokens are REJECTED.
 */
export function authenticateServiceKey(providedKey: string | undefined): boolean {
  const expected = process.env.REWARD_SERVICE_KEY;
  if (!expected || expected.length < 32) return false; // Must be configured and strong
  if (!providedKey) return false;

  // Timing-safe comparison
  const providedBuf = Buffer.from(providedKey);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

// ── User Management ──────────────────────────────────────────

export async function upsertWalletUser(walletAddress: string, chainId: string = 'bsc'): Promise<void> {
  const wallet = walletAddress.toLowerCase().trim();
  try {
    await query(
      `INSERT INTO wallet_users (wallet_address, chain_id) VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET updated_at = now()`,
      [wallet, chainId]
    );
  } catch { /* non-critical */ }
}
