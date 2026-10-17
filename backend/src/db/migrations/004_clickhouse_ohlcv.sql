-- Cupcak8 Swap — ClickHouse OHLCV Schema
-- This migration is ClickHouse-only. On PostgreSQL it's a no-op.
-- The chart-engine uses PostgreSQL-native tables instead.

DO $$
BEGIN
  -- Only run on PostgreSQL (not ClickHouse).
  -- ClickHouse doesn't support DO blocks, so this is the PG-safe path.
  -- The actual ClickHouse schema should be applied via a separate ClickHouse migration tool.
  RAISE NOTICE 'Migration 004: ClickHouse OHLCV schema skipped (PostgreSQL detected)';
END $$;