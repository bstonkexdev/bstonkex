# BSTONKEX Cashback Security Hardening Plan

## Files to Create (3)

1. **`src/lib/engine/reward-allocation.ts`** — Unified reward allocation with 50% combined cap enforcement, idempotency key collection, and truthful claim statuses
2. **`src/lib/__tests__/reward-allocation.test.ts`** — Tests for cap enforcement, idempotency, claim statuses, boundary values
3. **`src/lib/__tests__/hardening-integration.test.ts`** — Integration tests for privacy filtering, concurrent processing, cap across systems

## Files to Modify (6)

1. **`src/lib/engine/cashback-engine.ts`** — Switch to unified allocation, use `ownerKey`-based privacy filtering, add `claim_requested` status, remove client-side idempotency Set
2. **`src/lib/engine/fee-engine.ts`** — Switch to unified allocation for referral rewards, enforce 50% cap, add idempotency key writes, fix claim statuses
3. **`src/lib/referral.ts`** — Filter rewards by `ownerKey` where possible, update claim status handling
4. **`src/components/reward/CashbackDashboard.tsx`** — Update claim button to use `claim_requested` status, add security disclosure
5. **`src/lib/rewards.ts`** — Handle new claim statuses in unified summary
6. **`src/lib/__tests__/cashback.test.ts`** — Add tests for cap enforcement on cashback calculation

## Architecture Decisions

### Privacy
The Gitlawb SDK has no server-side "run as user" capability. The `authenticated` visibility is the closest we can get: signed-in users read all records, but only the author can edit. We strengthen this by:
- Adding `ownerKey` matching (SDK-inferred identity) alongside wallet address filtering
- Documenting the platform limitation in the UI
- Keeping admin audit via a separate `reward_audit_log` (inbox) collection

### Idempotency
No atomic unique constraint exists in the SDK. Best available: a two-phase commit pattern using a dedicated `idempotency_keys` collection as a distributed lock. Still has a small race window. Documented as a known limitation.

### 50% Combined Cap
Enforced in a single `allocateTradeRewards()` function that calculates both referral and cashback from the same platform fee, caps combined allocation to 50%, and writes all records in one deterministic pass.

### Claim Statuses
New truthful states: `claim_requested` (user submitted), `processing` (backend acknowledged), `paid` (actual settlement confirmed), `rejected` (validation failed), `failed` (payout processor error). No record is marked `paid` without real settlement.