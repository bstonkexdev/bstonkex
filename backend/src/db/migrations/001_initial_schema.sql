-- BSTONKEX Reward System — Initial Schema
-- Migration: 001_initial_schema
-- All monetary columns use NUMERIC(18,6) — never floating-point.
-- All timestamps are TIMESTAMPTZ (UTC).
-- All status fields are explicit TEXT with CHECK constraints.

-- ── wallet_users ──────────────────────────────────────────────
-- Maps wallet addresses to platform users.
CREATE TABLE IF NOT EXISTS wallet_users (
  id              SERIAL PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  chain_id        TEXT NOT NULL DEFAULT 'bsc',
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_wallet_users_address UNIQUE (wallet_address)
);

-- ── wallet_auth_nonces ────────────────────────────────────────
-- Single-use nonces for wallet signature verification.
CREATE TABLE IF NOT EXISTS wallet_auth_nonces (
  id              SERIAL PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  nonce           TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  used            BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_auth_nonce UNIQUE (wallet_address, nonce)
);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_wallet ON wallet_auth_nonces (wallet_address);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expiry ON wallet_auth_nonces (expires_at);

-- ── verified_trades ───────────────────────────────────────────
-- On-chain verified trades. Identity is (chain_id, tx_hash, log_index).
-- log_index is NULL for chains/protocols that do not emit indexed logs.
CREATE TABLE IF NOT EXISTS verified_trades (
  id                SERIAL PRIMARY KEY,
  chain_id          TEXT NOT NULL,
  tx_hash           TEXT NOT NULL,
  log_index         INTEGER,
  wallet_address    TEXT NOT NULL,
  trade_amount_usd  NUMERIC(18,6) NOT NULL CHECK (trade_amount_usd >= 0),
  token_address     TEXT,
  token_symbol      TEXT,
  side              TEXT NOT NULL DEFAULT 'buy' CHECK (side IN ('buy','sell')),
  status            TEXT NOT NULL DEFAULT 'verified'
                      CHECK (status IN ('pending','verified','failed','reverted')),
  block_number      BIGINT,
  verified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_verified_trade UNIQUE (chain_id, tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_verified_trades_wallet ON verified_trades (wallet_address);
CREATE INDEX IF NOT EXISTS idx_verified_trades_status ON verified_trades (status);
CREATE INDEX IF NOT EXISTS idx_verified_trades_chain ON verified_trades (chain_id);

-- ── collected_platform_fees ───────────────────────────────────
-- Platform fees collected from verified trades.
CREATE TABLE IF NOT EXISTS collected_platform_fees (
  id                SERIAL PRIMARY KEY,
  trade_id          INTEGER NOT NULL REFERENCES verified_trades(id) ON DELETE RESTRICT,
  chain_id          TEXT NOT NULL,
  tx_hash           TEXT NOT NULL,
  platform_fee_usd  NUMERIC(18,6) NOT NULL CHECK (platform_fee_usd >= 0),
  fee_bps           INTEGER NOT NULL DEFAULT 40 CHECK (fee_bps >= 0),
  treasury_address  TEXT,
  status            TEXT NOT NULL DEFAULT 'collected'
                      CHECK (status IN ('collected','reversed')),
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fee_per_trade UNIQUE (trade_id)
);
CREATE INDEX IF NOT EXISTS idx_fees_trade ON collected_platform_fees (trade_id);
CREATE INDEX IF NOT EXISTS idx_fees_chain ON collected_platform_fees (chain_id);

-- ── reward_allocations ────────────────────────────────────────
-- Referral + cashback allocation per trade. Enforces 50% combined cap.
CREATE TABLE IF NOT EXISTS reward_allocations (
  id                      SERIAL PRIMARY KEY,
  trade_id                INTEGER NOT NULL REFERENCES verified_trades(id) ON DELETE RESTRICT,
  fee_id                  INTEGER NOT NULL REFERENCES collected_platform_fees(id) ON DELETE RESTRICT,
  allocation_type         TEXT NOT NULL DEFAULT 'combined'
                            CHECK (allocation_type IN ('combined','referral_only','cashback_only')),
  wallet_address          TEXT NOT NULL,
  referrer_username       TEXT,
  referral_reward_raw     NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (referral_reward_raw >= 0),
  referral_reward_final   NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (referral_reward_final >= 0),
  cashback_reward_raw     NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (cashback_reward_raw >= 0),
  cashback_reward_final   NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (cashback_reward_final >= 0),
  combined_cap            NUMERIC(18,6) NOT NULL CHECK (combined_cap >= 0),
  capped                  BOOLEAN NOT NULL DEFAULT false,
  treasury_retained       NUMERIC(18,6) NOT NULL CHECK (treasury_retained >= 0),
  cashback_tier_name      TEXT,
  cashback_tier_rate_pct  NUMERIC(6,2),
  referral_pct            NUMERIC(6,2),
  status                  TEXT NOT NULL DEFAULT 'allocated'
                            CHECK (status IN ('allocated','pending','claimable','reversed')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_allocation_per_trade UNIQUE (trade_id, allocation_type),
  -- Combined final rewards must never exceed the cap
  CONSTRAINT chk_combined_cap CHECK (
    referral_reward_final + cashback_reward_final <= combined_cap + 0.000001
  )
);
CREATE INDEX IF NOT EXISTS idx_allocations_wallet ON reward_allocations (wallet_address);
CREATE INDEX IF NOT EXISTS idx_allocations_trade ON reward_allocations (trade_id);
CREATE INDEX IF NOT EXISTS idx_allocations_referrer ON reward_allocations (referrer_username);
CREATE INDEX IF NOT EXISTS idx_allocations_status ON reward_allocations (status);

-- ── reward_claims ─────────────────────────────────────────────
-- User claim requests. $10 minimum enforced at application layer.
CREATE TABLE IF NOT EXISTS reward_claims (
  id              SERIAL PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  claim_type      TEXT NOT NULL CHECK (claim_type IN ('cashback','referral','combined')),
  amount          NUMERIC(18,6) NOT NULL CHECK (amount >= 0),
  status          TEXT NOT NULL DEFAULT 'claim_requested'
                    CHECK (status IN ('claim_requested','processing','paid','rejected','failed')),
  tx_hash         TEXT,
  claim_minimum   NUMERIC(18,6) NOT NULL DEFAULT 10.000000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_wallet ON reward_claims (wallet_address);
CREATE INDEX IF NOT EXISTS idx_claims_status ON reward_claims (status);
CREATE INDEX IF NOT EXISTS idx_claims_created ON reward_claims (created_at);

-- ── reward_payouts ────────────────────────────────────────────
-- Payout records linked to claims. One payout per claim.
CREATE TABLE IF NOT EXISTS reward_payouts (
  id              SERIAL PRIMARY KEY,
  claim_id        INTEGER NOT NULL REFERENCES reward_claims(id) ON DELETE RESTRICT,
  wallet_address  TEXT NOT NULL,
  amount          NUMERIC(18,6) NOT NULL CHECK (amount >= 0),
  chain_id        TEXT,
  tx_hash         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','settled','failed','reversed')),
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payout_per_claim UNIQUE (claim_id)
);
CREATE INDEX IF NOT EXISTS idx_payouts_wallet ON reward_payouts (wallet_address);
CREATE INDEX IF NOT EXISTS idx_payouts_claim ON reward_payouts (claim_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON reward_payouts (status);

-- ── reward_audit_logs ─────────────────────────────────────────
-- Append-only audit trail for all reward operations.
CREATE TABLE IF NOT EXISTS reward_audit_logs (
  id              SERIAL PRIMARY KEY,
  action          TEXT NOT NULL,
  trade_id        TEXT,
  wallet_address  TEXT,
  details         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON reward_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_trade ON reward_audit_logs (trade_id);
CREATE INDEX IF NOT EXISTS idx_audit_wallet ON reward_audit_logs (wallet_address);
CREATE INDEX IF NOT EXISTS idx_audit_created ON reward_audit_logs (created_at);
