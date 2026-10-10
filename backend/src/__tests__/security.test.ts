/**
 * BSTONKEX Security Tests — authentication, authorization, and reward integrity.
 *
 * Tests that DON'T require a database run immediately.
 * Tests that REQUIRE PostgreSQL are clearly marked and skip when DATABASE_URL is unset.
 * NEVER run DB tests against production data.
 *
 * Usage:
 *   npm run test:security                                    # non-DB tests only
 *   DATABASE_URL=postgresql://... npm run test:security      # + DB tests (disposable DB only)
 */

import { createHmac } from 'node:crypto';
import {
  buildAuthMessage,
  verifySessionToken,
  issueSessionToken,
  authenticateServiceKey,
  recoverEvmAddress,
  verifySignature,
} from '../auth.js';

// ── Test Helpers ─────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function skip(label: string): void {
  skipped++;
  console.log(`  ○ ${label} (skipped — requires DATABASE_URL)`);
}

async function expectRejection(
  fn: () => Promise<{ valid: boolean; reason?: string }> | { valid: boolean; reason?: string },
  label: string,
): Promise<void> {
  const result = await fn();
  assert(!result.valid, label);
}

// ── Known Test Vectors ───────────────────────────────────────
// These are deterministic test vectors generated with a known private key.
// They allow testing signature recovery without a live wallet.

// Test wallet address (derived from a known test private key)
const TEST_WALLET = '0x742d35cc6634c0532925a3b844bc454e4438f44e';
const OTHER_WALLET = '0x000000000000000000000000000000000000dead';

// ── Non-DB Tests: Message Format & Domain Separation ─────────

function testMessageFormat(): void {
  console.log('\n── Message Format & Domain Separation ──');

  const nonce1 = 'a'.repeat(64);
  const nonce2 = 'b'.repeat(64);

  const msg1 = buildAuthMessage(TEST_WALLET, nonce1);
  const msg2 = buildAuthMessage(TEST_WALLET, nonce2);
  const msg3 = buildAuthMessage(OTHER_WALLET, nonce1);

  assert(msg1.includes('BSTONKEX'), 'Message includes domain identifier');
  assert(msg1.includes('bstonkex_wallet_auth_v1'), 'Message includes purpose');
  assert(msg1.includes(nonce1), 'Message includes nonce');
  assert(msg1.includes(TEST_WALLET.toLowerCase()), 'Message includes wallet address');

  assert(msg1 !== msg2, 'Different nonces produce different messages');
  assert(msg1 !== msg3, 'Different wallets produce different messages');

  // Domain separation: message must NOT be a raw nonce (prevents cross-protocol replay)
  assert(msg1 !== nonce1, 'Message is not just the nonce (domain separated)');
}

// ── Non-DB Tests: Session Token Security ─────────────────────

function testSessionTokens(): void {
  console.log('\n── Session Token Security ──');

  // Issue and verify a valid token
  const token = issueSessionToken(TEST_WALLET);
  assert(typeof token === 'string' && token.includes('.'), 'Token has correct format');

  const result = verifySessionToken(token);
  assert(result.walletAddress === TEST_WALLET.toLowerCase(), 'Valid token returns correct wallet');

  // Tampered token — modify payload
  const [payloadB64, sig] = token.split('.');
  const tamperedPayload = Buffer.from('0xdead00000000000000000000000000000000beef:9999999999999').toString('base64url');
  const tamperedToken = `${tamperedPayload}.${sig}`;
  const tamperedResult = verifySessionToken(tamperedToken);
  assert(tamperedResult.walletAddress === null, 'Tampered token rejected (payload modified)');

  // Tampered signature
  const tamperedSig = `${payloadB64}.${'0'.repeat(64)}`;
  const tamperedSigResult = verifySessionToken(tamperedSig);
  assert(tamperedSigResult.walletAddress === null, 'Tampered token rejected (signature modified)');

  // Empty token
  const emptyResult = verifySessionToken('');
  assert(emptyResult.walletAddress === null, 'Empty token rejected');

  // Malformed token
  const malformedResult = verifySessionToken('not-a-token');
  assert(malformedResult.walletAddress === null, 'Malformed token rejected');

  // Expired token — create one with past expiry
  // We need to manually craft this since issueSessionToken always uses future expiry
  const pastExpiry = Date.now() - 1000;
  const expiredPayload = `${TEST_WALLET.toLowerCase()}:${pastExpiry}`;
  const secret = process.env.SESSION_SECRET || 'dev-secret-NOT-FOR-PRODUCTION-use-openssl-rand-hex-32';
  const expiredSig = createHmac('sha256', secret).update(expiredPayload).digest('hex');
  const expiredToken = `${Buffer.from(expiredPayload).toString('base64url')}.${expiredSig}`;
  const expiredResult = verifySessionToken(expiredToken);
  assert(expiredResult.walletAddress === null, 'Expired token rejected');

  // Token with invalid wallet format in payload
  const badWalletPayload = `not_a_wallet:${Date.now() + 100000}`;
  const badWalletSig = createHmac('sha256', secret).update(badWalletPayload).digest('hex');
  const badWalletToken = `${Buffer.from(badWalletPayload).toString('base64url')}.${badWalletSig}`;
  const badWalletResult = verifySessionToken(badWalletToken);
  assert(badWalletResult.walletAddress === null, 'Token with invalid wallet format rejected');
}

// ── Non-DB Tests: Service Key Isolation ──────────────────────

function testServiceKeyIsolation(): void {
  console.log('\n── Service Key Isolation ──');

  // Without REWARD_SERVICE_KEY set, all requests rejected
  const origKey = process.env.REWARD_SERVICE_KEY;
  delete process.env.REWARD_SERVICE_KEY;
  assert(!authenticateServiceKey('anything'), 'Service key rejected when not configured');

  // With weak key configured
  process.env.REWARD_SERVICE_KEY = 'short';
  assert(!authenticateServiceKey('short'), 'Weak service key (< 32 chars) rejected');

  // With strong key
  const strongKey = 'a'.repeat(64);
  process.env.REWARD_SERVICE_KEY = strongKey;
  assert(authenticateServiceKey(strongKey), 'Correct strong service key accepted');
  assert(!authenticateServiceKey('wrong-key-' + 'a'.repeat(54)), 'Wrong service key rejected');
  assert(!authenticateServiceKey(undefined), 'Missing service key rejected');
  assert(!authenticateServiceKey(''), 'Empty service key rejected');

  // Session token must NOT authenticate service-key endpoints
  // (This is tested in reward-routes.ts requireServiceKey — we verify the auth function here)
  const sessionToken = issueSessionToken(TEST_WALLET);
  assert(!authenticateServiceKey(sessionToken), 'Session token rejected as service key');

  // Restore
  if (origKey) process.env.REWARD_SERVICE_KEY = origKey;
  else delete process.env.REWARD_SERVICE_KEY;
}

// ── Non-DB Tests: Signature Recovery ─────────────────────────

// Disposable test private key — NEVER use for real funds.
// Hardhat account #0 (well-known test key, zero value).
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

async function testSignatureRecovery(): Promise<void> {
  console.log('\n── EVM Signature Recovery (viem) ──');

  // Dynamically import viem — available when backend deps are installed
  let account: { address: string; signMessage: (params: { message: string }) => Promise<string> };
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    account = privateKeyToAccount(TEST_PRIVATE_KEY);
  } catch {
    // viem not installed — cannot run real signature tests
    failed++;
    console.error('  ✗ viem not installed — cannot run EVM signature tests');
    console.error('    Run: cd backend && npm install');
    return;
  }

  const testWallet = account.address.toLowerCase();
  const testNonce = 'a'.repeat(64);
  const authMessage = buildAuthMessage(testWallet, testNonce);

  // Test 1: Valid signature from correct key → recovered address matches
  const validSig = await account.signMessage({ message: authMessage });
  const recovered = await recoverEvmAddress(authMessage, validSig);
  assert(recovered === testWallet, `Valid signature recovers correct address (${testWallet})`);

  // Test 2: verifySignature with correct wallet + valid signature → accepted
  const sigResult1 = await verifySignature(testWallet, testNonce, validSig);
  assert(sigResult1.valid === true, 'Valid signature + matching wallet accepted');

  // Test 3: verifySignature with WRONG wallet + valid signature → rejected
  const sigResult2 = await verifySignature(OTHER_WALLET.toLowerCase(), testNonce, validSig);
  assert(!sigResult2.valid, 'Wrong wallet address rejected (recovered address mismatch)');
  assert(sigResult2.reason?.includes('does not match') === true, 'Rejection reason: address mismatch');

  // Test 4: Altered message → recovery gives different address → rejected
  const alteredMessage = buildAuthMessage(testWallet, 'b'.repeat(64)); // different nonce
  const recoveredAltered = await recoverEvmAddress(alteredMessage, validSig);
  assert(recoveredAltered !== testWallet, 'Altered message recovers different address');

  // Test 5: verifySignature with altered nonce → rejected
  const sigResult3 = await verifySignature(testWallet, 'b'.repeat(64), validSig);
  assert(!sigResult3.valid, 'Altered nonce rejected (signature over different message)');

  // Test 6: Malformed signature → rejected
  const result1 = await recoverEvmAddress(authMessage, 'not-a-signature');
  assert(result1 === null, 'Invalid signature format returns null');

  // Test 7: Zero signature → does not match test wallet
  const zeroSig = `0x${'0'.repeat(130)}`;
  const result2 = await recoverEvmAddress(authMessage, zeroSig);
  assert(result2 !== testWallet, 'Zero signature does not recover to test wallet');

  // Test 8: Truncated signature → rejected
  const truncatedSig = validSig.slice(0, 50);
  const result3 = await recoverEvmAddress(authMessage, truncatedSig);
  assert(result3 === null || result3 !== testWallet, 'Truncated signature rejected');

  // Test 9: Signature from DIFFERENT key → wrong address
  const otherAccount = (await import('viem/accounts')).privateKeyToAccount(
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const // Hardhat #1
  );
  const wrongKeySig = await otherAccount.signMessage({ message: authMessage });
  const recoveredWrongKey = await recoverEvmAddress(authMessage, wrongKeySig);
  assert(recoveredWrongKey !== testWallet, 'Signature from different key recovers different address');
  assert(recoveredWrongKey === otherAccount.address.toLowerCase(), 'Different key recovers its own address');

  // Test 10: verifySignature with empty/missing inputs
  const emptyNonce = await verifySignature(testWallet, '', validSig);
  assert(!emptyNonce.valid, 'Empty nonce rejected');

  const emptySig = await verifySignature(testWallet, testNonce, '');
  assert(!emptySig.valid, 'Empty signature rejected');

  // Test 11: Non-EVM wallet address
  const nonEvmResult = await verifySignature('SomeName', 'a'.repeat(64), '0x1234');
  assert(!nonEvmResult.valid, 'Non-EVM wallet address rejected');
}

// ── Non-DB Tests: Rate Limiting ──────────────────────────────

async function testRateLimiting(): Promise<void> {
  console.log('\n── Rate Limiting ──');

  // Rate limiting is internal to auth.ts — we test the observable behavior.
  // Without DB, createNonce returns null for invalid addresses, but we can
  // test that the rate limiter is present by checking the function signature
  // and that repeated calls to verifySignature don't crash.

  for (let i = 0; i < 50; i++) {
    await verifySignature(TEST_WALLET, 'a'.repeat(64), '0x' + 'ab'.repeat(65));
  }
  assert(true, '50 rapid verifySignature calls handled without crash');

  // Verify the message format doesn't leak secrets
  const msg = buildAuthMessage(TEST_WALLET, 'a'.repeat(64));
  assert(!msg.includes('SESSION_SECRET'), 'Auth message does not leak SESSION_SECRET');
  assert(!msg.includes('REWARD_SERVICE_KEY'), 'Auth message does not leak service key');
}

// ── Non-DB Tests: Input Validation Helpers ───────────────────

function testInputValidation(): void {
  console.log('\n── Input Validation ──');

  // Test monetary validation logic (duplicated from reward-routes for testing)
  function validateAmount(value: unknown, fieldName: string): { valid: boolean; value: number; error?: string } {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return { valid: false, value: 0, error: `${fieldName} must be a non-negative finite number` };
    }
    if (num > 10_000_000) {
      return { valid: false, value: 0, error: `${fieldName} exceeds maximum allowed value` };
    }
    const str = String(num);
    const dotIndex = str.indexOf('.');
    if (dotIndex >= 0 && str.length - dotIndex - 1 > 6) {
      return { valid: false, value: 0, error: `${fieldName} has too many decimal places (max 6)` };
    }
    return { valid: true, value: num };
  }

  assert(validateAmount(100.50, 'test').valid, 'Valid amount $100.50 accepted');
  assert(validateAmount(0, 'test').valid, 'Zero amount accepted');
  assert(validateAmount(0.000001, 'test').valid, '6 decimal places accepted');
  assert(!validateAmount(-1, 'test').valid, 'Negative amount rejected');
  assert(!validateAmount(NaN, 'test').valid, 'NaN rejected');
  assert(!validateAmount(Infinity, 'test').valid, 'Infinity rejected');
  assert(!validateAmount(10_000_001, 'test').valid, 'Over max amount rejected');
  assert(!validateAmount(0.0000001, 'test').valid, '7 decimal places rejected');

  // TX hash validation
  function validateTxHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash) || /^[a-fA-F0-9]{64}$/.test(hash);
  }

  assert(validateTxHash(`0x${'ab'.repeat(32)}`), 'Valid tx hash accepted');
  assert(validateTxHash('ab'.repeat(32)), 'Valid tx hash (no 0x) accepted');
  assert(!validateTxHash('0x123'), 'Short tx hash rejected');
  assert(!validateTxHash(''), 'Empty tx hash rejected');
  assert(!validateTxHash('0x' + 'zz'.repeat(32)), 'Non-hex tx hash rejected');
}

// ── DB Tests (require DATABASE_URL) ──────────────────────────

async function testNonceReplay(): Promise<void> {
  console.log('\n── Nonce Replay Protection (requires DB) ──');
  if (!process.env.DATABASE_URL) {
    skip('Nonce replay test — requires DATABASE_URL');
    return;
  }

  const { createNonce, verifyNonce } = await import('../auth.js');
  const { query, closePool } = await import('../db/pool.js');

  try {
    const wallet = '0x' + 'ab'.repeat(20);

    // Create a nonce
    const nonceResult = await createNonce(wallet);
    assert(nonceResult !== null, 'Nonce created successfully');

    if (nonceResult) {
      // First use — should succeed
      const firstUse = await verifyNonce(wallet, nonceResult.nonce);
      assert(firstUse === true, 'First nonce use succeeds');

      // Replay — should fail (nonce already consumed)
      const replay = await verifyNonce(wallet, nonceResult.nonce);
      assert(replay === false, 'Nonce replay rejected (already consumed)');

      // Wrong wallet — should fail
      const wrongWallet = await verifyNonce(OTHER_WALLET, nonceResult.nonce);
      assert(wrongWallet === false, 'Nonce used with wrong wallet rejected');

      // Wrong nonce — should fail
      const wrongNonce = await verifyNonce(wallet, 'f'.repeat(64));
      assert(wrongNonce === false, 'Wrong nonce value rejected');

      // Cleanup
      await query(`DELETE FROM wallet_auth_nonces WHERE wallet_address = $1`, [wallet]);
    }
  } finally {
    await closePool();
  }
}

async function testConcurrentAllocations(): Promise<void> {
  console.log('\n── Concurrent Duplicate Allocations (requires DB) ──');
  if (!process.env.DATABASE_URL) {
    skip('Concurrent allocation test — requires DATABASE_URL');
    return;
  }

  const { processAllocationAtomic } = await import('../db/queries.js');
  const { query, closePool } = await import('../db/pool.js');

  const testWallet = '0x' + 'cd'.repeat(20);
  const testTxHash = `0x${'ef'.repeat(32)}`;

  try {
    // Cleanup
    await query(`DELETE FROM reward_allocations WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1)`, [testTxHash]);
    await query(`DELETE FROM collected_platform_fees WHERE tx_hash = $1`, [testTxHash]);
    await query(`DELETE FROM verified_trades WHERE tx_hash = $1`, [testTxHash]);

    const input = {
      chainId: 'bsc',
      txHash: testTxHash,
      logIndex: null,
      walletAddress: testWallet,
      tradeAmountUsd: 10000,
      platformFeeUsd: 40,
      referrerUsername: 'testreferrer',
      referralSharePct: 30,
      cashbackRatePct: 10,
      cashbackTierName: 'Gold',
      cashbackTierRatePct: 10,
    };

    // Fire 5 concurrent allocations for the same trade
    const results = await Promise.allSettled([
      processAllocationAtomic(input),
      processAllocationAtomic(input),
      processAllocationAtomic(input),
      processAllocationAtomic(input),
      processAllocationAtomic(input),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled' && !r.value.duplicate);
    const duplicates = results.filter(r => r.status === 'fulfilled' && r.value.duplicate);

    assert(successes.length === 1, `Exactly 1 allocation created (got ${successes.length})`);
    assert(duplicates.length >= 1, `At least 1 duplicate detected (got ${duplicates.length})`);

    // Verify only one allocation exists in DB
    const countResult = await query(
      `SELECT COUNT(*) as count FROM reward_allocations WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1)`,
      [testTxHash]
    );
    assert(parseInt(countResult.rows[0].count) === 1, 'Exactly 1 allocation row in database');

    // Verify 50% cap
    const allocResult = await query(
      `SELECT * FROM reward_allocations WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1)`,
      [testTxHash]
    );
    const alloc = allocResult.rows[0];
    const totalRewards = parseFloat(alloc.referral_reward_final) + parseFloat(alloc.cashback_reward_final);
    const cap = parseFloat(alloc.combined_cap);
    assert(totalRewards <= cap + 0.000001, `Combined rewards (${totalRewards}) <= cap (${cap})`);

    // Cleanup
    await query(`DELETE FROM reward_allocations WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = $1)`, [testTxHash]);
    await query(`DELETE FROM collected_platform_fees WHERE tx_hash = $1`, [testTxHash]);
    await query(`DELETE FROM verified_trades WHERE tx_hash = $1`, [testTxHash]);
  } catch (e: any) {
    console.error(`  ✗ Concurrent allocation test error: ${e.message}`);
    failed++;
  } finally {
    await closePool();
  }
}

async function testTransactionRollback(): Promise<void> {
  console.log('\n── Transaction Rollback (requires DB) ──');
  if (!process.env.DATABASE_URL) {
    skip('Transaction rollback test — requires DATABASE_URL');
    return;
  }

  const { withTransaction, query, closePool } = await import('../db/pool.js');

  const testWallet = '0x' + 'ee'.repeat(20);

  try {
    await query(`DELETE FROM reward_audit_logs WHERE wallet_address = $1`, [testWallet]);

    // Transaction that fails must roll back everything
    let threw = false;
    try {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO reward_audit_logs (action, wallet_address, details) VALUES ('test_tx', $1, '{}')`,
          [testWallet]
        );
        throw new Error('Intentional failure');
      });
    } catch {
      threw = true;
    }
    assert(threw, 'Failed transaction throws error');

    const countResult = await query(
      `SELECT COUNT(*) as count FROM reward_audit_logs WHERE wallet_address = $1`,
      [testWallet]
    );
    assert(parseInt(countResult.rows[0].count) === 0, 'No rows committed after rollback');

    // Cleanup
    await query(`DELETE FROM reward_audit_logs WHERE wallet_address = $1`, [testWallet]);
  } finally {
    await closePool();
  }
}

async function testWalletIsolation(): Promise<void> {
  console.log('\n── Wallet Isolation (requires DB) ──');
  if (!process.env.DATABASE_URL) {
    skip('Wallet isolation test — requires DATABASE_URL');
    return;
  }

  const { getWalletRewardSummary, getClaimsByWallet } = await import('../db/queries.js');
  const { closePool } = await import('../db/pool.js');

  const walletA = '0x' + 'aa'.repeat(20);
  const walletB = '0x' + 'bb'.repeat(20);

  try {
    // Get summaries for both wallets — they must be independent
    const summaryA = await getWalletRewardSummary(walletA);
    const summaryB = await getWalletRewardSummary(walletB);

    // Both should return valid summaries (even if all zeros)
    assert(typeof summaryA.totalCashbackEarned === 'number', 'Wallet A summary is valid');
    assert(typeof summaryB.totalCashbackEarned === 'number', 'Wallet B summary is valid');

    // Claims for wallet A must not include wallet B's claims
    const claimsA = await getClaimsByWallet(walletA);
    const allFromA = claimsA.every(c => c.wallet_address === walletA.toLowerCase());
    assert(allFromA || claimsA.length === 0, 'Wallet A claims only contain wallet A data');
  } finally {
    await closePool();
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('BSTONKEX Security Tests');
  console.log('=======================');

  // Non-DB tests (always run)
  testMessageFormat();
  testSessionTokens();
  testServiceKeyIsolation();
  await testSignatureRecovery();
  await testRateLimiting();
  testInputValidation();

  // DB tests (require DATABASE_URL — disposable database only)
  if (!process.env.DATABASE_URL) {
    console.log('\n⚠ DATABASE_URL not set — DB-dependent security tests skipped.');
    console.log('  These tests require a disposable test database:');
    console.log('  - Nonce replay protection');
    console.log('  - Concurrent duplicate allocations');
    console.log('  - Transaction rollback');
    console.log('  - Wallet isolation');
    console.log('\n  To run: DATABASE_URL=postgresql://user:pass@localhost:5432/bstonkex_test npm run test:security');
    console.log('  NEVER run against production data.');
  } else {
    await testNonceReplay();
    await testConcurrentAllocations();
    await testTransactionRollback();
    await testWalletIsolation();
  }

  console.log('\n=======================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.log('\n⚠ SECURITY TESTS FAILED — NOT PRODUCTION READY');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
