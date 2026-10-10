-- Migration: 002_nonce_purpose_binding
-- Adds explicit purpose binding to auth nonces and improves nonce indexing.
-- Safe and idempotent: all operations use IF NOT EXISTS.

-- Add purpose column to wallet_auth_nonces (defaults to wallet auth purpose)
ALTER TABLE wallet_auth_nonces ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'bstonkex_wallet_auth_v1';

-- Composite unique on (wallet_address, nonce, purpose) — prevents cross-purpose replay
-- The existing uq_auth_nonce UNIQUE (wallet_address, nonce) already prevents same-purpose replay.
-- Adding purpose to the unique ensures nonces are purpose-scoped.
-- We keep the old constraint for backward compatibility and add a new one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_auth_nonce_purpose') THEN
    ALTER TABLE wallet_auth_nonces ADD CONSTRAINT uq_auth_nonce_purpose UNIQUE (wallet_address, nonce, purpose);
  END IF;
END $$;

-- Index for faster purpose-scoped lookups
CREATE INDEX IF NOT EXISTS idx_auth_nonces_purpose ON wallet_auth_nonces (purpose);
