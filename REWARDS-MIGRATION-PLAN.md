# BSTONKEX Rewards — Railway Backend Integration Analysis & Migration Plan

Date: 2025-07-02
Status: Analysis only — no files modified, no deployments changed.

---

## 1. Existing Railway Backend — Complete Inventory

### Deployment
| Property | Value |
|---|---|
| Provider | Railway (Nixpacks) |
| URL | `https://bstonkex-production-ec26.up.railway.app` (inferred from `realtime-ws.ts:201`) |
| Custom domain | `https://api.bstonkex.xyz` (used in admin components) |
| WebSocket | `wss://bstonkex-production-ec26.up.railway.app/ws` |
| Runtime | Node.js 20, TypeScript compiled to `dist/` |
| Dependencies | `ws` only (no database driver, no ORM, no Express) |
| Config files | `backend/railway.json`, `backend/nixpacks.toml`, `backend/.env.example` |

### Backend Source Files
| File | Purpose |
|---|---|
| `backend/src/server.ts` | HTTP + WebSocket server, CORS, routing |
| `backend/src/health.ts` | `/health`, `/ready`, `/ws/health` endpoints |
| `backend/src/market-pipeline.ts` | DexScreener polling → WS broadcast |
| `backend/src/degen-routes.ts` | HTTP route handlers for `/degen/*` |
| `backend/src/degen-mode.ts` | Session management, validation, audit (in-memory) |

### Existing HTTP Endpoints
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | Server health check | None |
| GET | `/ready` | Readiness check | None |
| GET | `/ws/health` | WebSocket health | None |
| POST | `/rpc/robinhood` | Alchemy RPC proxy (server-side key) | None |
| POST | `/degen/sessions` | Create degen session | Wallet string (not verified) |
| GET | `/degen/sessions/current?wallet=` | Get session by wallet | None |
| GET | `/degen/sessions/:id` | Get session by ID | None |
| POST | `/degen/sessions/:id/revoke` | Revoke session | Wallet string match |
| POST | `/degen/execute` | Execute degen trade | Session ID |
| POST | `/degen/validate` | Validate without executing | Session ID |
| GET | `/degen/audit` | Get audit log | None |
| GET | `/degen/stats` | Get monitoring stats | None |
| POST | `/degen/kill-switch` | Emergency disable | **None (unprotected!)** |

### WebSocket Protocol
- Path: `/ws`
- Messages: `ping`/`pong`, `subscribe`/`unsubscribe` to `market:{chainId}:{address}` channels
- Heartbeat: 15s interval, 3x staleness timeout
- Backpressure: 1MB buffer limit per client

### Backend Data Storage
**IN-MEMORY ONLY.** The backend has **no database whatsoever**:
- `degen-mode.ts:75-78`: `Map<string, DegenSession>`, `SessionEvent[]`, `Map<string, ExecutionResult>`, `Map<string, {count, resetAt}>`
- All degen sessions, audit events, and idempotency keys are lost on restart
- `backend/.env.example:38-39` explicitly says: *"Database (Gitlawb Data SDK) — Uses built-in gitlawb.db — no external DB needed"*
- The Gitlawb Data SDK is used **only in the frontend** (`src/lib/gitlawb.ts`), not in the backend

---

## 2. Frontend–Backend Integration Map

| Frontend File | Backend Connection | Purpose |
|---|---|---|
| `src/lib/engine/realtime-ws.ts:201` | `wss://...up.railway.app/ws` | WebSocket market data |
| `src/components/admin/BackendPanel.tsx` | `https://api.bstonkex.xyz/health` | Health monitoring |
| `src/components/admin/DeployButton.tsx` | `https://api.bstonkex.xyz/health` | Deploy verification |
| `src/components/admin/ExternalChecklist.tsx` | `https://api.bstonkex.xyz/health` | Checklist verification |
| `src/lib/engine/deploy-preflight.ts` | `https://api.bstonkex.xyz/health` | Preflight checks |
| `src/lib/engine/evm-adapter.ts:103` | `https://api.bstonkex.xyz/rpc/robinhood` (indirect) | RPC proxy for Robinhood |

**No reward-related code calls the backend.** All reward operations go through the Gitlawb Data SDK directly from the browser.

---

## 3. Reward Operations Currently Using Gitlawb SDK from Browser

### Write Operations (all browser-side)
| Function | File:Line | Collection(s) | Operation |
|---|---|---|---|
| `processAllocation()` | `reward-allocation.ts:249` | `reward_idempotency_keys`, `fee_ledger`, `ref_rewards`, `cashback_rewards`, `reward_audit_log` | 5 creates |
| `recordCashbackReward()` | `cashback-engine.ts:124` | `cashback_rewards`, `reward_idempotency_keys` | 2 creates |
| `recordReferralReward()` | `fee-engine.ts:135` | `ref_rewards`, `ref_volume` | 2 creates |
| `calculateFeeAllocation()` | `fee-engine.ts:83` | via `processAllocation()` + `ref_volume` | 6 creates |
| `claimCashback()` | `cashback-engine.ts:234` | `cashback_rewards` | N updates |
| `requestCashbackClaim()` | `reward-allocation.ts:350` | `cashback_rewards`, `reward_audit_log` | N updates + 1 create |
| `requestReferralClaim()` | `reward-allocation.ts:384` | `ref_rewards`, `reward_audit_log` | N updates + 1 create |
| `updateCashbackPolicy()` | `cashback-engine.ts:79` | `cashback_policy` | 1 update/create |
| `createProfile()` | `referral.ts:128` | `ref_profiles`, `ref_usernames` | 2 creates |
| `setReferrer()` | `referral.ts:161` | `ref_profiles` | 1 update |

### Read Operations (all browser-side)
| Function | File:Line | Collection(s) | Privacy Issue |
|---|---|---|---|
| `getUserCashbackRecords()` | `cashback-engine.ts:168` | `cashback_rewards` | **Reads ALL records, filters client-side** |
| `getProfile()` | `referral.ts:207` | `ref_profiles`, `ref_rewards`, `ref_volume` | **Reads ALL profiles** |
| `getReferralHistory()` | `referral.ts:262` | `ref_profiles`, `ref_rewards` | **Reads ALL rewards** |
| `getClaimHistory()` | `referral.ts:300` | `ref_profiles`, `ref_rewards` | **Reads ALL claims** |
| `getRollingVolume()` | `fee-engine.ts:167` | `ref_volume` | Reads ALL volume records |
| `getFeeHistory()` | `fee-engine.ts:206` | `fee_ledger` | Reads ALL fee records |
| `getFeeAnalytics()` | `fee-engine.ts:229` | `fee_ledger` | Reads ALL fee records |
| `isTradeAlreadyProcessed()` | `reward-allocation.ts:66` | `reward_idempotency_keys` | Reads ALL keys |
| `getCashbackPolicy()` | `cashback-engine.ts:67` | `cashback_policy` | Inbox (safe) |

---

## 4. Backend Capability Assessment

### 4.1 Wallet Signature Verification & Authenticated Identity
**NOT IMPLEMENTED.** The degen-mode `createSession()` accepts an `authorization` string but only checks it's non-empty (`degen-mode.ts:129`). No signature verification exists. No JWT, no session tokens, no auth middleware.

**What's needed:** Add `ethers` or `viem` to verify `personal_sign` signatures. Endpoint: `POST /auth/verify` — client signs a nonce, server recovers the address and issues a session token.

### 4.2 Private User-Specific Queries
**NOT POSSIBLE with current backend.** No database exists. The Gitlawb SDK's `authenticated` visibility lets all signed-in users read all records.

**What's needed:** Either:
- (a) Add PostgreSQL (Railway supports one-click Postgres) and move reward tables there, with `WHERE wallet_address = $1` queries.
- (b) Use the Gitlawb SDK server-side from the backend (requires the builder's auth token) and filter before returning to the client.

### 4.3 Atomic Idempotency
**NOT POSSIBLE with current backend.** The degen-mode uses `Map<string, ExecutionResult>` for idempotency (in-memory, lost on restart, no atomicity). The Gitlawb SDK has no unique constraints or `INSERT ... ON CONFLICT`.

**What's needed:** PostgreSQL `INSERT ... ON CONFLICT (trade_id, allocation_type) DO NOTHING` or Redis `SETNX`.

### 4.4 Unified 50% Cap Enforcement
**PARTIALLY IMPLEMENTED (frontend only).** `calculateAllocation()` in `reward-allocation.ts:131` correctly caps but runs in the browser. The backend has no reward logic.

**What's needed:** Move `calculateAllocation()` logic to the backend. Wrap the fee_ledger + ref_rewards + cashback_rewards writes in a single database transaction.

### 4.5 Claim Requests with $10 Minimum
**NOT IMPLEMENTED on backend.** The frontend checks `MIN_CLAIM_AMOUNT` but the update calls can fail silently (non-author on `authenticated` collections). No backend claim endpoint exists.

**What's needed:** `POST /rewards/claim` endpoint that:
1. Verifies user identity (wallet signature)
2. Sums `claimable` records server-side
3. Checks `$10` minimum
4. Transitions to `claim_requested` in a transaction
5. Returns the claimed amount

### 4.6 Verified Payout & Reversal Handling
**NOT IMPLEMENTED anywhere.** No payout processor exists. No reversal code exists. `paid` and `reversed` statuses are defined but never set.

**What's needed:** Payout integration (on-chain transfer or payment processor) + reversal webhook/handler.

---

## 5. Database Assessment

### Current State
**The Railway backend has NO database.** Only in-memory `Map` and `Array` structures. The frontend uses the Gitlawb Data SDK (a hosted JSON store at `playground.gitlawb.com`) which provides:
- CRUD operations (create, get, list, update, remove)
- Four visibility modes (owner, inbox, public, authenticated)
- Author-only editing on `authenticated`/`public` collections
- **NO unique constraints**
- **NO transactions**
- **NO server-side filtering** (only `mine: true` which filters by author)
- **NO atomic insert-if-absent**

### Recommendation
Add **Railway PostgreSQL** (native Railway service, same project). Railway Postgres supports:
- `UNIQUE` constraints and indexes
- `BEGIN`/`COMMIT` transactions
- `INSERT ... ON CONFLICT DO NOTHING` (exactly-once)
- `WHERE wallet_address = $1` (server-side privacy)
- Row-level security (optional)

Alternatively, Railway also supports **Redis** for idempotency keys only (via `SETNX` with TTL), but PostgreSQL is needed for the full reward ledger.

---

## 6. Trade Verification — Current State

### How trades are currently "verified"
1. `trade-engine.ts:139-148`: After a wallet submits a transaction, the frontend polls `getTransactionStatus()` via the chain adapter (direct RPC call).
2. On `confirmed` status, `calculateFeeAllocation()` is called with `trade.amountUsd` and `tradeId`.
3. **The `amountUsd` comes from the frontend's quote/estimate — it is NOT verified on-chain.**
4. **The `tradeId` is generated client-side.**
5. **The `referrerUsername` is looked up from Gitlawb (client-side).**

### Problems
- A malicious client can call `calculateFeeAllocation()` with an inflated `tradeAmountUsd` and generate arbitrary rewards.
- The platform fee (`tradeAmountUsd * 0.004`) is calculated from the client-submitted value, not from an on-chain fee receipt.
- There is no server-side reconciliation of trade events to fee collection.

### What's needed
The backend must independently verify:
1. **Transaction existence and confirmation** — `eth_getTransactionReceipt` via RPC
2. **Actual trade volume** — decode swap events (Transfer logs) from the receipt
3. **Platform fee collection** — verify fee transfer to treasury address
4. **Trade uniqueness** — the tx hash + log index is the canonical trade ID
5. **Wallet ownership** — the tx `from` address matches the authenticated user

---

## 7. Unresolved Security Blockers

| # | Blocker | Severity | Current State | Fix Required |
|---|---|---|---|---|
| 1 | **Privacy: all users read all reward records** | CRITICAL | `authenticated` visibility, client-side filter | Backend queries with `WHERE wallet = $1` |
| 2 | **Idempotency: race condition on concurrent trades** | CRITICAL | Two-phase commit, no atomicity | `INSERT ON CONFLICT DO NOTHING` in Postgres |
| 3 | **Cap bypass: legacy write paths** | HIGH | `recordCashbackReward`, `recordReferralReward` exported | Remove legacy paths; enforce cap in backend transaction |
| 4 | **Trade volume trust: client submits amountUsd** | CRITICAL | No on-chain verification | Backend decodes actual swap events |
| 5 | **Claim updates fail silently** | HIGH | Non-author update on `authenticated` | Backend claim endpoint with server-side update |
| 6 | **No wallet signature verification** | HIGH | Authorization string checked for non-empty only | `personal_sign` verification |
| 7 | **No payout processor** | MEDIUM | `paid` never set, correctly disclosed | Integrate payment rail |
| 8 | **No reversal handling** | MEDIUM | `reversed` status unused | Backend reversal handler |
| 9 | **Backend in-memory state lost on restart** | MEDIUM | Degen sessions, idempotency in `Map` | PostgreSQL persistence |
| 10 | **Kill-switch endpoint unauthenticated** | MEDIUM | `POST /degen/kill-switch` has no auth | Admin token or wallet signature |

---

## 8. Migration Plan — Reuse Existing Railway Backend

### Phase 1: Add Database (Prerequisite)
1. Provision **Railway PostgreSQL** in the existing Railway project.
2. Add `pg` (node-postgres) to `backend/package.json`.
3. Create schema migration file `backend/src/db/schema.sql`:

```sql
-- Reward allocations (one per trade, replaces fee_ledger)
CREATE TABLE reward_allocations (
  id            SERIAL PRIMARY KEY,
  trade_id      TEXT NOT NULL,
  allocation_type TEXT NOT NULL DEFAULT 'combined',
  wallet_address TEXT NOT NULL,
  trade_amount_usd NUMERIC(18,6) NOT NULL,
  platform_fee_usd NUMERIC(18,6) NOT NULL,
  referral_raw  NUMERIC(18,6) NOT NULL DEFAULT 0,
  referral_final NUMERIC(18,6) NOT NULL DEFAULT 0,
  cashback_raw  NUMERIC(18,6) NOT NULL DEFAULT 0,
  cashback_final NUMERIC(18,6) NOT NULL DEFAULT 0,
  combined_cap  NUMERIC(18,6) NOT NULL,
  capped        BOOLEAN NOT NULL DEFAULT false,
  treasury_retained NUMERIC(18,6) NOT NULL,
  referrer_username TEXT,
  tx_hash       TEXT,           -- on-chain verification
  chain_id      TEXT,
  status        TEXT NOT NULL DEFAULT 'confirmed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, allocation_type)  -- atomic idempotency
);

-- Cashback reward records
CREATE TABLE cashback_rewards (
  id            SERIAL PRIMARY KEY,
  allocation_id INTEGER REFERENCES reward_allocations(id),
  wallet_address TEXT NOT NULL,
  trade_id      TEXT NOT NULL,
  trade_volume  NUMERIC(18,6) NOT NULL,
  platform_fee_usd NUMERIC(18,6) NOT NULL,
  cashback_reward NUMERIC(18,6) NOT NULL,
  tier_name     TEXT NOT NULL,
  tier_rate_pct NUMERIC(6,2) NOT NULL,
  month_key     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, wallet_address)  -- one cashback per trade per wallet
);

-- Referral reward records
CREATE TABLE ref_rewards (
  id            SERIAL PRIMARY KEY,
  allocation_id INTEGER REFERENCES reward_allocations(id),
  referrer_username TEXT NOT NULL,
  referred_wallet TEXT NOT NULL,
  trade_id      TEXT NOT NULL,
  trade_volume  NUMERIC(18,6) NOT NULL,
  fee_generated NUMERIC(18,6) NOT NULL,
  reward        NUMERIC(18,6) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trade_id, referrer_username)  -- one referral per trade per referrer
);

-- Referral volume (rolling 30-day tier calculation)
CREATE TABLE ref_volume (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  referred_wallet TEXT NOT NULL,
  volume        NUMERIC(18,6) NOT NULL,
  fee_generated NUMERIC(18,6) NOT NULL,
  trade_id      TEXT NOT NULL,
  date          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ref_volume_user_date ON ref_volume(username, date);

-- User profiles
CREATE TABLE ref_profiles (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL UNIQUE,
  referrer_username TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Claim requests
CREATE TABLE claim_requests (
  id            SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  claim_type    TEXT NOT NULL, -- 'cashback' | 'referral'
  amount        NUMERIC(18,6) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'claim_requested',
  tx_hash       TEXT,          -- payout tx hash when settled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cashback policy (single row)
CREATE TABLE cashback_policy (
  id            SERIAL PRIMARY KEY CHECK (id = 1),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  rate_bps      INTEGER NOT NULL DEFAULT 0,
  eligible_fee_field TEXT NOT NULL DEFAULT 'platformFeeUsd',
  exclusions    TEXT[] NOT NULL DEFAULT '{}',
  claim_minimum NUMERIC(18,6) NOT NULL DEFAULT 10,
  last_updated  TIMESTAMPTZ,
  updated_by    TEXT
);

-- Audit log
CREATE TABLE reward_audit_log (
  id            SERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  trade_id      TEXT NOT NULL,
  details       JSONB NOT NULL DEFAULT '{}',
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Phase 2: Backend Reward API Endpoints
Add to `backend/src/server.ts` (route handler file: `backend/src/reward-routes.ts`):

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/auth/nonce` | Get sign-in nonce for wallet | None |
| `POST` | `/auth/verify` | Verify signature → issue JWT | Signature |
| `GET` | `/rewards/summary` | User's reward summary | JWT |
| `GET` | `/rewards/cashback` | User's cashback records | JWT |
| `GET` | `/rewards/referral` | User's referral records | JWT |
| `GET` | `/rewards/claims` | User's claim history | JWT |
| `POST` | `/rewards/claim` | Submit claim request ($10 min) | JWT |
| `POST` | `/rewards/allocation` | Record trade allocation (internal) | Service key |
| `GET` | `/rewards/policy` | Get cashback policy | None |
| `POST` | `/rewards/policy` | Update cashback policy | Admin JWT |
| `POST` | `/rewards/reversal` | Reverse a trade's rewards | Service key |

### Phase 3: Server-Side Allocation Logic
Move `calculateAllocation()` (the pure function) to `backend/src/reward-allocation.ts` (same logic). Wrap `processAllocation()` in a PostgreSQL transaction:

```typescript
async function processAllocation(input: AllocationInput): Promise<AllocationResult> {
  const result = calculateAllocation(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Atomic idempotency — unique constraint prevents duplicates
    const inserted = await client.query(
      `INSERT INTO reward_allocations (trade_id, allocation_type, wallet_address, ...)
       VALUES ($1, 'combined', $2, ...) ON CONFLICT (trade_id, allocation_type) DO NOTHING RETURNING id`,
      [input.tradeId, input.traderWallet, /* ... */]
    );
    if (inserted.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ...result, idempotent: true, processed: false };
    }
    // Write cashback + referral rewards
    // ...
    await client.query('COMMIT');
    return { ...result, processed: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

### Phase 4: Trade Verification
Add `backend/src/trade-verifier.ts`:
1. Accept `txHash` + `chainId` from the client
2. Call `eth_getTransactionReceipt` via the existing RPC proxy infrastructure
3. Decode swap events (Transfer logs) to determine actual volume
4. Verify platform fee was collected (treasury address Transfer event)
5. Use `txHash:logIndex` as the canonical `trade_id`
6. Only then call `processAllocation()`

### Phase 5: Frontend Migration
1. Replace Gitlawb Data SDK calls in reward files with `fetch()` to the Railway backend
2. Add auth flow: `POST /auth/nonce` → wallet signs → `POST /auth/verify` → store JWT
3. Keep the existing UI components unchanged — only swap the data layer
4. Preserve all existing tests (they test pure functions that remain unchanged)

### Phase 6: Claim & Settlement
1. `POST /rewards/claim` validates and transitions to `claim_requested`
2. Admin reviews in dashboard
3. On payout: on-chain transfer → `POST /rewards/settle` with tx hash → status `paid`
4. On failure: `POST /rewards/reversal` → status `reversed`

---

## 9. What Can Be Preserved Unchanged

| Component | Reason |
|---|---|
| All UI components (`CashbackDashboard`, `ReferralPage`, `ClaimFlow`, etc.) | Only data layer changes |
| `calculateAllocation()` pure function | Same logic, runs server-side |
| `cashback-tiers.ts` tier definitions | Static config |
| `config.ts` referral tiers, fee constants | Static config |
| All 206 existing tests | Test pure functions that remain unchanged |
| WebSocket market pipeline | Unrelated to rewards |
| Degen mode sessions | Unrelated to rewards |
| Health/monitoring endpoints | Unrelated to rewards |

---

## 10. Summary

The existing Railway backend is a **WebSocket gateway + market data pipeline + degen session manager** with **no database, no authentication, and no reward logic**. All reward operations run in the browser via the Gitlawb Data SDK, which lacks the server-side capabilities needed for production rewards (privacy, atomicity, trade verification).

**The migration requires adding PostgreSQL to the Railway project and building reward API endpoints on the existing backend.** The frontend UI and test suite can be preserved by swapping only the data layer (Gitlawb SDK calls → `fetch()` to Railway backend).
