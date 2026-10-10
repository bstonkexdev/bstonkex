# BSTONKEX Database Migrations

## Overview

Migrations are versioned SQL files in `backend/src/db/migrations/`. They are applied
in lexical order (001_, 002_, …) and tracked in a `schema_migrations` table. Each
migration runs inside a transaction — if it fails, nothing is committed.

## Prerequisites

- Railway PostgreSQL service provisioned in the same Railway project as the backend.
- `DATABASE_URL` environment variable set in Railway (Railway injects this automatically
  when you link a PostgreSQL service to your backend service).

## Railway Setup Steps

1. In the Railway dashboard, click **+ New** → **Database** → **PostgreSQL**.
2. In your backend service's **Variables** tab, add a reference to the PostgreSQL
   service's `DATABASE_URL`. Railway can auto-link it if you use the service
   reference feature.
3. Deploy the backend. On startup, the server:
   - Verifies the database connection.
   - Runs any pending migrations automatically.
   - Logs the schema status to the console.
   - Reports `database: false` and `rewardProcessing: false` on `/ready` if
     PostgreSQL is unreachable (the server still starts and serves WebSocket
     and /degen/* routes).

## Manual Migration

To run migrations manually (e.g. from a CI pipeline or local shell):

```bash
cd backend
npm install
npm run build
DATABASE_URL=postgresql://user:pass@host:5432/dbname npm run migrate
```

The migration runner is idempotent — running it multiple times is safe.

## Adding New Migrations

1. Create a new file in `backend/src/db/migrations/` with a numeric prefix:
   ```
   002_add_indexes.sql
   ```
2. Write your DDL. Use `IF NOT EXISTS` / `IF EXISTS` where possible for safety.
3. Deploy. The runner applies the new migration and records it in `schema_migrations`.

## Schema

| Table | Purpose |
|---|---|
| `wallet_users` | Wallet address ↔ platform user mapping |
| `wallet_auth_nonces` | Single-use nonces for wallet signature verification |
| `verified_trades` | On-chain verified trades (unique per chain+tx_hash+log_index) |
| `collected_platform_fees` | Platform fees collected (one per trade, FK to verified_trades) |
| `reward_allocations` | Referral + cashback allocation per trade (unique per trade+type, 50% cap CHECK) |
| `reward_claims` | User claim requests ($10 minimum enforced at app layer) |
| `reward_payouts` | Payout records (one per claim, FK to reward_claims) |
| `reward_audit_logs` | Append-only audit trail |
| `schema_migrations` | Tracks applied migrations |

## Running Tests

Schema constraint tests require a **disposable test database**. Never run against
production data.

```bash
cd backend
npm install
npm run build

# Point to a LOCAL test database (not production!)
DATABASE_URL=postgresql://user:pass@localhost:5432/bstonkex_test npm run test:db
```

Tests cover:
- Unique trade identity (chain_id, tx_hash, log_index)
- Unique reward allocation per trade + allocation type
- Foreign-key integrity (fees→trades, allocations→fees, payouts→claims)
- CHECK constraints (negative amounts, over-cap allocations, invalid statuses)
- NUMERIC(18,6) precision preservation
- Transaction rollback on error
- Transaction commit on success

If `DATABASE_URL` is not set, the test runner exits gracefully with instructions.

## Security Notes

- `DATABASE_URL` is **server-side only**. It is never included in the frontend
  bundle, never logged, and never written to committed files.
- The `.env.example` file contains only a placeholder, not a real connection string.
- On Railway, `DATABASE_URL` is injected at runtime and accessible only to the
  backend process.

## Health Endpoints

After migration, verify:

```
GET /health   → includes PostgreSQL dependency status
GET /ready    → checks.database: true/false, checks.rewardProcessing: true/false
```

When PostgreSQL is unreachable but `DATABASE_URL` is set, `/ready` returns **503**
with `ready: false` and `rewardProcessing: false`. WebSocket and /degen/* routes
remain available regardless of database status.
