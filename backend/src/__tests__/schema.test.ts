/**
 * Schema Constraint Tests — verify database constraints, duplicates, rollbacks.
 *
 * Requires DATABASE_URL to point to a DISPOSABLE test database.
 * NEVER run against production data.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/bstonkex_test npm run test:db
 *
 * If DATABASE_URL is not set, tests are skipped with a clear message.
 */

import { getPool, isDbConfigured, pingDb, closePool, withTransaction, query } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

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
  console.log(`  ○ ${label} (skipped)`);
}

async function expectError(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
    failed++;
    console.error(`  ✗ ${label} — expected error but none was thrown`);
  } catch {
    passed++;
    console.log(`  ✓ ${label}`);
  }
}

// ── Tests ────────────────────────────────────────────────────

async function testConnection(): Promise<void> {
  console.log('\n── Connection Tests ──');

  if (!isDbConfigured()) {
    skip('DATABASE_URL not set — all DB tests skipped');
    return;
  }

  const ok = await pingDb();
  assert(ok, 'Database is reachable');

  if (!ok) {
    skip('Database unreachable — remaining tests skipped');
    return;
  }

  // Test connection failure handling (bad query)
  await expectError(
    () => query('SELECT * FROM nonexistent_table_xyz'),
    'Invalid query throws error'
  );
}

async function testMigrations(): Promise<void> {
  console.log('\n── Migration Tests ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Run migrations (idempotent)
  const result = await runMigrations();
  assert(Array.isArray(result.applied), 'Migrations run without error');
  console.log(`  Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);

  // Verify all expected tables exist
  const tables = [
    'wallet_users', 'wallet_auth_nonces', 'verified_trades',
    'collected_platform_fees', 'reward_allocations',
    'reward_claims', 'reward_payouts', 'reward_audit_logs',
    'schema_migrations',
  ];
  for (const table of tables) {
    const res = await query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS exists`,
      [table]
    );
    assert(res.rows[0]?.exists === true, `Table "${table}" exists`);
  }
}

async function testWalletUserConstraints(): Promise<void> {
  console.log('\n── wallet_users Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Insert unique wallet
  await query(`DELETE FROM wallet_users WHERE wallet_address = '0xtest_aaa'`);
  await query(
    `INSERT INTO wallet_users (wallet_address, chain_id) VALUES ('0xtest_aaa', 'bsc')`
  );
  passed++;
  console.log('  ✓ Insert unique wallet');

  // Duplicate wallet should fail
  await expectError(
    () => query(`INSERT INTO wallet_users (wallet_address, chain_id) VALUES ('0xtest_aaa', 'bsc')`),
    'Duplicate wallet_address rejected (UNIQUE constraint)'
  );

  // Cleanup
  await query(`DELETE FROM wallet_users WHERE wallet_address = '0xtest_aaa'`);
}

async function testVerifiedTradeConstraints(): Promise<void> {
  console.log('\n── verified_trades Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  const base = {
    chain_id: 'bsc',
    tx_hash: '0xtest_trade_1',
    log_index: 0,
    wallet_address: '0xtest_trader',
    trade_amount_usd: 1000.50,
    side: 'buy',
    status: 'verified',
  };

  // Cleanup
  await query(`DELETE FROM verified_trades WHERE tx_hash = '0xtest_trade_1'`);

  // Insert unique trade
  await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [base.chain_id, base.tx_hash, base.log_index, base.wallet_address, base.trade_amount_usd, base.side, base.status]
  );
  passed++;
  console.log('  ✓ Insert unique trade');

  // Duplicate (chain_id, tx_hash, log_index) should fail
  await expectError(
    () => query(
      `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [base.chain_id, base.tx_hash, base.log_index, base.wallet_address, base.trade_amount_usd, base.side, base.status]
    ),
    'Duplicate trade (chain_id, tx_hash, log_index) rejected'
  );

  // Different log_index should succeed
  await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [base.chain_id, base.tx_hash, 1, base.wallet_address, 500, 'sell', 'verified']
  );
  passed++;
  console.log('  ✓ Different log_index accepted');

  // NULL log_index — second insert should fail (same chain+tx_hash+NULL)
  await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
     VALUES ('bsc', '0xtest_trade_null', NULL, '0xtest_trader', 100, 'buy', 'verified')`
  );
  await expectError(
    () => query(
      `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
       VALUES ('bsc', '0xtest_trade_null', NULL, '0xtest_trader', 100, 'buy', 'verified')`
    ),
    'Duplicate trade with NULL log_index rejected'
  );

  // Negative amount should fail
  await expectError(
    () => query(
      `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
       VALUES ('bsc', '0xtest_neg', 0, '0xtest_trader', -1, 'buy', 'verified')`
    ),
    'Negative trade_amount_usd rejected (CHECK constraint)'
  );

  // Invalid status should fail
  await expectError(
    () => query(
      `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
       VALUES ('bsc', '0xtest_badstatus', 0, '0xtest_trader', 100, 'buy', 'bogus')`
    ),
    'Invalid status rejected (CHECK constraint)'
  );

  // Cleanup
  await query(`DELETE FROM verified_trades WHERE tx_hash IN ('0xtest_trade_1', '0xtest_trade_null', '0xtest_neg', '0xtest_badstatus')`);
}

async function testFeeConstraints(): Promise<void> {
  console.log('\n── collected_platform_fees Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Need a trade first
  await query(`DELETE FROM collected_platform_fees WHERE tx_hash = '0xtest_fee_trade'`);
  await query(`DELETE FROM verified_trades WHERE tx_hash = '0xtest_fee_trade'`);
  const tradeRes = await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
     VALUES ('bsc', '0xtest_fee_trade', 0, '0xtest_trader', 1000, 'buy', 'verified') RETURNING id`
  );
  const tradeId = tradeRes.rows[0].id;

  // Insert fee
  await query(
    `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps)
     VALUES ($1, 'bsc', '0xtest_fee_trade', 4.0, 40)`,
    [tradeId]
  );
  passed++;
  console.log('  ✓ Insert fee linked to trade');

  // Second fee for same trade should fail
  await expectError(
    () => query(
      `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps)
       VALUES ($1, 'bsc', '0xtest_fee_trade', 4.0, 40)`,
      [tradeId]
    ),
    'Duplicate fee per trade rejected (UNIQUE constraint)'
  );

  // Fee with invalid trade_id should fail (FK)
  await expectError(
    () => query(
      `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps)
       VALUES (999999, 'bsc', '0xtest_ghost', 4.0, 40)`
    ),
    'Fee with nonexistent trade_id rejected (FK constraint)'
  );

  // Negative fee should fail
  await expectError(
    () => query(
      `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps)
       VALUES ($1, 'bsc', '0xtest_negfee', -1, 40)`,
      [tradeId]
    ),
    'Negative platform_fee_usd rejected (CHECK constraint)'
  );

  // Cleanup
  await query(`DELETE FROM collected_platform_fees WHERE tx_hash IN ('0xtest_fee_trade', '0xtest_ghost', '0xtest_negfee')`);
  await query(`DELETE FROM verified_trades WHERE tx_hash = '0xtest_fee_trade'`);
}

async function testAllocationConstraints(): Promise<void> {
  console.log('\n── reward_allocations Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Setup: trade + fee
  await query(`DELETE FROM reward_allocations WHERE trade_id IN (SELECT id FROM verified_trades WHERE tx_hash = '0xtest_alloc_trade')`);
  await query(`DELETE FROM collected_platform_fees WHERE tx_hash = '0xtest_alloc_trade'`);
  await query(`DELETE FROM verified_trades WHERE tx_hash = '0xtest_alloc_trade'`);

  const tradeRes = await query(
    `INSERT INTO verified_trades (chain_id, tx_hash, log_index, wallet_address, trade_amount_usd, side, status)
     VALUES ('bsc', '0xtest_alloc_trade', 0, '0xtest_alloc_wallet', 10000, 'buy', 'verified') RETURNING id`
  );
  const tradeId = tradeRes.rows[0].id;

  const feeRes = await query(
    `INSERT INTO collected_platform_fees (trade_id, chain_id, tx_hash, platform_fee_usd, fee_bps)
     VALUES ($1, 'bsc', '0xtest_alloc_trade', 40, 40) RETURNING id`,
    [tradeId]
  );
  const feeId = feeRes.rows[0].id;

  // Insert allocation
  await query(
    `INSERT INTO reward_allocations (trade_id, fee_id, allocation_type, wallet_address, referrer_username,
      referral_reward_raw, referral_reward_final, cashback_reward_raw, cashback_reward_final,
      combined_cap, treasury_retained, status)
     VALUES ($1, $2, 'combined', '0xtest_alloc_wallet', 'testreferrer',
      12, 12, 4, 4, 20, 24, 'allocated')`,
    [tradeId, feeId]
  );
  passed++;
  console.log('  ✓ Insert allocation linked to trade + fee');

  // Duplicate (trade_id, allocation_type) should fail
  await expectError(
    () => query(
      `INSERT INTO reward_allocations (trade_id, fee_id, allocation_type, wallet_address,
        referral_reward_final, cashback_reward_final, combined_cap, treasury_retained, status)
       VALUES ($1, $2, 'combined', '0xtest_alloc_wallet', 12, 4, 20, 24, 'allocated')`,
      [tradeId, feeId]
    ),
    'Duplicate allocation (trade_id, allocation_type) rejected'
  );

  // Different allocation_type for same trade should succeed
  await query(
    `INSERT INTO reward_allocations (trade_id, fee_id, allocation_type, wallet_address,
      referral_reward_final, cashback_reward_final, combined_cap, treasury_retained, status)
     VALUES ($1, $2, 'cashback_only', '0xtest_alloc_wallet', 0, 4, 20, 36, 'allocated')`,
    [tradeId, feeId]
  );
  passed++;
  console.log('  ✓ Different allocation_type accepted');

  // Over-cap allocation should fail (referral+cashback > cap)
  await expectError(
    () => query(
      `INSERT INTO reward_allocations (trade_id, fee_id, allocation_type, wallet_address,
        referral_reward_raw, referral_reward_final, cashback_reward_raw, cashback_reward_final,
        combined_cap, treasury_retained, status)
       VALUES ($1, $2, 'referral_only', '0xtest_alloc_wallet', 30, 30, 15, 15, 20, 0, 'allocated')`,
      [tradeId, feeId]
    ),
    'Over-cap allocation rejected (CHECK combined_cap constraint)'
  );

  // Cleanup
  await query(`DELETE FROM reward_allocations WHERE trade_id = $1`, [tradeId]);
  await query(`DELETE FROM collected_platform_fees WHERE tx_hash = '0xtest_alloc_trade'`);
  await query(`DELETE FROM verified_trades WHERE tx_hash = '0xtest_alloc_trade'`);
}

async function testTransactionRollback(): Promise<void> {
  console.log('\n── Transaction Rollback Tests ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  const testWallet = '0xtest_rollback_wallet';

  // Cleanup
  await query(`DELETE FROM reward_audit_logs WHERE wallet_address = $1`, [testWallet]);

  // Transaction that fails should roll back
  await expectError(
    () => withTransaction(async (client) => {
      await client.query(
        `INSERT INTO reward_audit_logs (action, wallet_address, details) VALUES ('test_tx', $1, '{}')`,
        [testWallet]
      );
      // This will fail — table doesn't exist
      await client.query('SELECT * FROM nonexistent_table_xyz');
    }),
    'Transaction with error rolls back'
  );

  // Verify the audit log insert was rolled back
  const res = await query(
    `SELECT COUNT(*) AS count FROM reward_audit_logs WHERE wallet_address = $1`,
    [testWallet]
  );
  assert(parseInt(res.rows[0].count) === 0, 'No rows committed after rollback');

  // Successful transaction should commit
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO reward_audit_logs (action, wallet_address, details) VALUES ('test_tx_ok', $1, '{}')`,
      [testWallet]
    );
    await client.query(
      `INSERT INTO reward_audit_logs (action, wallet_address, details) VALUES ('test_tx_ok2', $1, '{}')`,
      [testWallet]
    );
  });
  const res2 = await query(
    `SELECT COUNT(*) AS count FROM reward_audit_logs WHERE wallet_address = $1`,
    [testWallet]
  );
  assert(parseInt(res2.rows[0].count) === 2, 'Both rows committed after successful transaction');

  // Cleanup
  await query(`DELETE FROM reward_audit_logs WHERE wallet_address = $1`, [testWallet]);
}

async function testClaimConstraints(): Promise<void> {
  console.log('\n── reward_claims Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Valid claim
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_claim_wallet'`);
  await query(
    `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
     VALUES ('0xtest_claim_wallet', 'cashback', 25.50, 'claim_requested')`
  );
  passed++;
  console.log('  ✓ Insert valid claim');

  // Negative amount should fail
  await expectError(
    () => query(
      `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
       VALUES ('0xtest_claim_wallet', 'cashback', -10, 'claim_requested')`
    ),
    'Negative claim amount rejected'
  );

  // Invalid claim_type should fail
  await expectError(
    () => query(
      `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
       VALUES ('0xtest_claim_wallet', 'bogus_type', 10, 'claim_requested')`
    ),
    'Invalid claim_type rejected (CHECK constraint)'
  );

  // Invalid status should fail
  await expectError(
    () => query(
      `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
       VALUES ('0xtest_claim_wallet', 'cashback', 10, 'bogus_status')`
    ),
    'Invalid claim status rejected (CHECK constraint)'
  );

  // Cleanup
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_claim_wallet'`);
}

async function testPayoutConstraints(): Promise<void> {
  console.log('\n── reward_payouts Constraints ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  // Need a claim first
  await query(`DELETE FROM reward_payouts WHERE wallet_address = '0xtest_payout_wallet'`);
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_payout_wallet'`);
  const claimRes = await query(
    `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
     VALUES ('0xtest_payout_wallet', 'cashback', 25, 'claim_requested') RETURNING id`
  );
  const claimId = claimRes.rows[0].id;

  // Valid payout
  await query(
    `INSERT INTO reward_payouts (claim_id, wallet_address, amount, chain_id, status)
     VALUES ($1, '0xtest_payout_wallet', 25, 'bsc', 'pending')`,
    [claimId]
  );
  passed++;
  console.log('  ✓ Insert payout linked to claim');

  // Duplicate payout for same claim should fail
  await expectError(
    () => query(
      `INSERT INTO reward_payouts (claim_id, wallet_address, amount, chain_id, status)
       VALUES ($1, '0xtest_payout_wallet', 25, 'bsc', 'pending')`,
      [claimId]
    ),
    'Duplicate payout per claim rejected (UNIQUE constraint)'
  );

  // Payout with invalid claim_id should fail (FK)
  await expectError(
    () => query(
      `INSERT INTO reward_payouts (claim_id, wallet_address, amount, chain_id, status)
       VALUES (999999, '0xtest_payout_wallet', 25, 'bsc', 'pending')`
    ),
    'Payout with nonexistent claim_id rejected (FK constraint)'
  );

  // Cleanup
  await query(`DELETE FROM reward_payouts WHERE wallet_address = '0xtest_payout_wallet'`);
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_payout_wallet'`);
}

async function testNumericPrecision(): Promise<void> {
  console.log('\n── Numeric Precision Tests ──');
  if (!isDbConfigured()) { skip('No database'); return; }

  await query(`DELETE FROM reward_audit_logs WHERE wallet_address = '0xtest_numeric'`);
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_numeric'`);

  // Insert claim with 6 decimal places
  await query(
    `INSERT INTO reward_claims (wallet_address, claim_type, amount, status)
     VALUES ('0xtest_numeric', 'cashback', 10.123456, 'claim_requested')`
  );
  const res = await query(
    `SELECT amount FROM reward_claims WHERE wallet_address = '0xtest_numeric'`
  );
  const amount = parseFloat(res.rows[0].amount);
  assert(Math.abs(amount - 10.123456) < 0.000001, 'NUMERIC(18,6) preserves 6 decimal places');

  // Cleanup
  await query(`DELETE FROM reward_claims WHERE wallet_address = '0xtest_numeric'`);
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('BSTONKEX Schema Constraint Tests');
  console.log('================================');

  if (!isDbConfigured()) {
    console.log('\n⚠ DATABASE_URL is not set.');
    console.log('  To run these tests, set DATABASE_URL to a DISPOSABLE test database:');
    console.log('  DATABASE_URL=postgresql://user:pass@localhost:5432/bstonkex_test npm run test:db');
    console.log('\n  NEVER run these tests against production data.');
    process.exit(0);
  }

  try {
    await testConnection();
    await testMigrations();
    await testWalletUserConstraints();
    await testVerifiedTradeConstraints();
    await testFeeConstraints();
    await testAllocationConstraints();
    await testTransactionRollback();
    await testClaimConstraints();
    await testPayoutConstraints();
    await testNumericPrecision();
  } finally {
    await closePool();
  }

  console.log('\n================================');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
