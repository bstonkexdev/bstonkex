# BSTONKEX Rewards Security Audit — Final Report

Date: 2025-07-02
Scope: All reward code paths after `reward-allocation.ts` integration. No new features — audit only.
Files inspected: `gitlawb.ts`, `reward-allocation.ts`, `cashback-engine.ts`, `fee-engine.ts`, `referral.ts`, `rewards.ts`, `cashback-tiers.ts`, `config.ts`, `CashbackDashboard.tsx`, `ReferralPage.tsx`, all 12 test files.

---

## 1. Privacy

### Collections and their visibility

| Collection | Visibility | Created by | Read access | Write access |
|---|---|---|---|---|
| `cashback_rewards` | `authenticated` | allocation engine (builder) | **All signed-in users** | Author only (builder) |
| `ref_rewards` | `authenticated` | allocation engine (builder) | **All signed-in users** | Author only (builder) |
| `ref_volume` | default `owner` | fee engine (builder) | Builder only | Builder only |
| `fee_ledger` | default `owner` | allocation engine (builder) | Builder only | Builder only |
| `ref_profiles` | `inbox` | user (anyone) | Builder only | Creator |
| `ref_usernames` | `authenticated` | profile creation | All signed-in users | Author only |
| `reward_idempotency_keys` | `inbox` | allocation engine | Builder only | Builder only |
| `reward_audit_log` | `inbox` | allocation engine | Builder only | Builder only |
| `cashback_policy` | `inbox` | admin | Builder only | Builder only |

### Findings

**F1.1 — Any signed-in user can read all `cashback_rewards` and `ref_rewards` records. (LAUNCH BLOCKER)**
The `authenticated` visibility is enforced by the platform: every signed-in user gets `list()` access to the full collection. The client-side wallet filter in `getUserCashbackRecords()` (cashback-engine.ts:173) and the username filter in `getReferralHistory()` (referral.ts:269) prevent the UI from *displaying* other users' data but do not prevent the data from reaching the client. A user with DevTools can call `list()` directly and read every user's trade volumes, wallet addresses, fee amounts, and reward balances.

**This is not access control.** The SDK documentation (gitlawb.ts:24) states: *"authenticated — signed-in users read all records and create; authors edit their own."* There is no `WHERE ownerKey = current_user` server-side filter available in the SDK.

**F1.2 — The SDK's `owner` visibility cannot be used for reward records.**
Reward records are created by the allocation engine running under the builder's identity. Under `owner` visibility, only the creating user sees their own records — so if the engine creates a record for wallet `0xABC`, the user at `0xABC` cannot read it. There is no SDK API to create a record *on behalf of* another user with their `ownerKey`. The `mine: true` filter in `list()` (gitlawb.ts:349) filters by `ownerKey`, which is the *author*, not the subject.

**F1.3 — Client-side wallet filtering is present but is explicitly not security.**
`getUserCashbackRecords()` filters by `walletAddress.toLowerCase()`. `getReferralHistory()` filters by `referrerUsername`. These prevent accidental UI leakage but are trivially bypassed.

### Privacy conclusion

**Server-enforced read isolation cannot be achieved with the available SDK.** This is a **launch blocker** for multi-user deployments where financial privacy matters. None of the four visibility modes achieves "users see only their own records with a working dashboard":
- `authenticated`: all users see all records (current — **leaks financial data**)
- `owner`: only the author sees records (users can't see their own rewards)
- `inbox`: only the builder reads (no user dashboard)
- `public`: everyone reads and writes (worst option)

**A trusted backend service that authenticates the user and queries with `WHERE wallet_address = $1` server-side is required.**

---

## 2. Atomic Idempotency

### Current mechanism

`reward-allocation.ts` uses a two-phase commit:
1. `isTradeAlreadyProcessed(tradeId, type)` — `list()` and check for matching record (lines 66-74)
2. `writeIdempotencyKey(tradeId, type)` — `create()` a record (lines 80-89)
3. If step 1 returns false, write reward records

### Race condition analysis

**F2.1 — Exactly-once processing is NOT guaranteed. (LAUNCH BLOCKER)**
Two concurrent calls for the same `tradeId` can both pass step 1 before either completes step 2. The SDK `create()` is a plain HTTP POST — there is no `INSERT ... ON CONFLICT DO NOTHING`, no unique constraint, no compare-and-swap, and no transaction API. The SDK exposes only `create`, `get`, `list`, `update`, `remove`.

Race timeline:
```
Request A: isTradeAlreadyProcessed("T1") → false
Request B: isTradeAlreadyProcessed("T1") → false
Request A: writeIdempotencyKey("T1") → success
Request A: create cashback reward → success
Request B: writeIdempotencyKey("T1") → success (duplicate key record)
Request B: create cashback reward → success (DUPLICATE REWARD)
```

**F2.2 — `isTradeAlreadyProcessed` fails open on error (line 72-73).** Returns `false` on network failure, allowing duplicate processing. Availability-over-consistency tradeoff, but increases duplicate risk under load.

**F2.3 — `writeIdempotencyKey` silently ignores errors (line 88).** If the write fails, the guard is not recorded but reward writes proceed anyway.

**F2.4 — Legacy `recordCashbackReward()` uses allocation type `cashback_only` vs `processAllocation()` using `combined`.** A trade processed via the unified path can be reprocessed via the legacy path (different composite key). Real bypass path.

### Idempotency conclusion

**Exactly-once processing cannot be guaranteed with the available SDK.** A database with unique constraints or server-side transactions is required.

---

## 3. Combined Reward Cap

### Flow trace

1. `calculateFeeAllocation()` (fee-engine.ts:83) → `processAllocation()` (reward-allocation.ts:249) → `calculateAllocation()` (pure, line 131)
2. `calculateAllocation()` computes `platformFeeUsd = tradeAmountUsd * PLATFORM_FEE_PCT`
3. `combinedCap = platformFeeUsd * 0.50`
4. Raw rewards derive from the **same** `platformFeeUsd`
5. If `combinedRaw > combinedCap`, scales proportionally
6. Conservation: `combinedFinal + treasuryRetained == platformFeeUsd`

### Cap enforcement analysis

**F3.1 — The pure function correctly enforces the 50% cap.** Both rewards derive from the same fee. Conservation holds in all 42 tested combinations. Max tiers (35% + 15% = 50%) exactly hit the cap without excess.

**F3.2 — But the pure function is NOT the only write path. (CAP BYPASS RISK)**
- `recordCashbackReward()` (cashback-engine.ts:124) writes cashback **independently** — takes `cashbackReward` as a parameter with no cap check against referral rewards.
- `recordReferralReward()` (fee-engine.ts:135) writes referral **independently** — no cap check against cashback.
- Both are still exported. If any caller uses them instead of `processAllocation()`, the 50% cap is not enforced.

**F3.3 — Duplicate events can exceed the cap.** Due to F2.1, two concurrent `processAllocation()` calls can each write a fee ledger entry, doubling total rewards. The cap applies per-call, not per-trade-aggregate.

**F3.4 — Reversed/refunded fees are not handled.** The `reversed` status exists in the data model but is never set by any code. No reversal path exists.

### Cap conclusion

**The 50% cap is correctly enforced in the unified `calculateAllocation()` but NOT across all write paths.** Legacy functions can bypass it. Duplicates can exceed it.

---

## 4. Claims and Settlement

### $10 minimum enforcement

**F4.1 — The $10 minimum IS enforced in authoritative code, not just the UI.**
- `claimCashback()` (cashback-engine.ts:246): checks `policy.claimMinimum` (defaults to `MIN_CLAIM_AMOUNT = 10`)
- `requestCashbackClaim()` (reward-allocation.ts:361): checks `MIN_CLAIM_AMOUNT`
- `requestReferralClaim()` (reward-allocation.ts:394): checks `MIN_CLAIM_AMOUNT`
- `cashback-tiers.ts:143`: `availableToClaim` is 0 below minimum

**F4.2 — `claimCashback()` reads `policy.claimMinimum` from `cashback_policy` (inbox).** The policy is readable only by the builder. In published mode, a regular user's `getCashbackPolicy()` returns `DEFAULT_POLICY` with `claimMinimum: 10`. The default is safe. But `updateCashbackPolicy()` has no code-level admin gate — only the UI checks admin status.

### Claim status lifecycle

**F4.3 — Statuses are correctly distinguished:**
- `pending`: below threshold, accumulating
- `claimable`: meets threshold, user can request
- `claim_requested`: user submitted claim request
- `processing`: backend acknowledged (never set by frontend)
- `paid`: actual settlement confirmed (never set by any code)
- `rejected`: validation failed
- `failed`: payout processor error (never set)
- `reversed`: trade reverted (never set)

**F4.4 — `claimCashback()` transitions to `claim_requested`, not `paid`.** (cashback-engine.ts:254) Correct.
**F4.5 — `requestCashbackClaim()` and `requestReferralClaim()` also transition to `claim_requested`.** Correct.
**F4.6 — No code path sets `paid`, `processing`, `failed`, or `reversed`.** Confirmed by inspection.

**F4.7 — UI disclosure is truthful.** CashbackDashboard.tsx:
- Line 222-224: *"Submitting will mark rewards as 'claim_requested' — no funds will be transferred to your wallet."*
- Line 41: *"No funds have been transferred — a verified payout processor is required for actual settlement."*
- Line 324: *"Settlement is ledger-only."*

**F4.8 — BUT claim updates can silently fail. (CLAIM RELIABILITY BUG)**
On `authenticated` visibility, only the author (allocation engine / builder) can `update()` records. When a regular user calls `claimCashback()`, the `update()` calls throw (non-author). The code catches these and tries `claim_pending` as fallback, then returns `success: true` anyway. **The user sees a success message but no record was actually updated.** The claim request is lost.

### Claims conclusion

$10 minimum is enforced in code. `paid` is never falsely set. But claim submission is unreliable — updates fail silently on `authenticated` collections.

**No actual payout processor exists.** All claims are ledger-only. This is correctly disclosed in the UI.

---

## 5. Regression Verification

### Commands run

```
npx tsc -b
```
**0 TypeScript errors in all reward files.** Pre-existing errors in ~20 unrelated component files remain unchanged.

```
npx vitest run
```
**205 passed, 1 failed** across 12 test files (206 total).

### Integration test failure analysis

`integration.test.ts:93-101` — "all configured chains have valid config":
```typescript
for (const chainId of CONFIGURED_CHAINS) {  // ChainConfig[] (objects)
  const chain = CHAINS[chainId];            // CHAINS is Record<ChainId, ChainConfig>
  expect(chain).toBeDefined();              // FAILS — object is not a valid key
}
```

**Root cause:** `CONFIGURED_CHAINS` is `ChainConfig[]` (from `ALL_CHAINS.filter(c => c.configured)` in config.ts:84). The test uses each config object as a string key into `CHAINS`. `CHAINS[{...}]` returns `undefined`. Should be `CHAINS[chainId.id]`.

**This is a pre-existing type mismatch in the test, completely unrelated to reward changes.** It tests chain configuration, not rewards.

### Test results

| File | Tests | Status |
|---|---|---|
| `reward-allocation.test.ts` | 24 | PASS |
| `cashback-tiers.test.ts` | 33 | PASS |
| `security-engine.test.ts` | 33 | PASS |
| `referral.test.ts` | 23 | PASS |
| `runtime-validation.test.ts` | 17 | PASS |
| `chain-validation.test.ts` | 18 | PASS |
| `fee-engine.test.ts` | 13 | PASS |
| `cashback.test.ts` | 9 | PASS |
| `market-stream.test.ts` | 7 | PASS |
| `solana-wallet.test.ts` | 8 | PASS |
| `candle-engine.test.ts` | 6 | PASS |
| `integration.test.ts` | 14/15 | **1 FAIL** (pre-existing) |

---

## Summary of Actual Guarantees

| Property | Status | Evidence |
|---|---|---|
| Read isolation per user | **NOT IMPLEMENTED** | `authenticated` allows all signed-in users to read all records |
| Write isolation per user | **ENFORCED** | Platform enforces author-only editing on `authenticated` collections |
| Exactly-once processing | **NOT GUARANTEED** | No atomic insert-if-absent; race in two-phase commit |
| 50% cap in unified path | **ENFORCED** | `calculateAllocation()` correctly caps; conservation holds |
| 50% cap across all paths | **NOT ENFORCED** | Legacy `recordCashbackReward`/`recordReferralReward` bypass |
| $10 claim minimum | **ENFORCED** | Checked in all three claim functions |
| `paid` never falsely set | **ENFORCED** | No code path sets `paid` |
| Claim request reliability | **NOT GUARANTEED** | Updates fail silently on `authenticated` collections |
| Reversal/refund handling | **NOT IMPLEMENTED** | `reversed` status exists but is never set |

## Launch Recommendation

**Do not launch the reward system publicly.** Three critical blockers:

1. **Privacy:** All signed-in users can read all reward records (wallet addresses, trade volumes, fee amounts). Requires a trusted backend query layer.
2. **Idempotency:** Duplicate reward creation is possible under concurrent requests. Requires a database with unique constraints.
3. **Cap bypass:** Legacy write paths can allocate more than 50% of fees. Must remove legacy paths or enforce the cap at the database level.

**Minimum infrastructure needed for production:**
- A backend service (Node.js/PostgreSQL or equivalent) that:
  - Authenticates users and validates wallet ownership
  - Queries reward records with `WHERE wallet_address = $1` server-side
  - Uses `INSERT ... ON CONFLICT DO NOTHING` for idempotency
  - Enforces `SUM(reward) <= 0.5 * platform_fee` per trade in a transaction
  - Processes claim requests and updates statuses authoritatively
  - Integrates with a payout processor or on-chain transfer mechanism
- The frontend should call this backend, not the Gitlawb Data SDK directly for financial records.
