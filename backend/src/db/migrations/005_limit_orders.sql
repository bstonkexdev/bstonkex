-- Migration 005: Limit Orders — Persistent SL/TP storage
-- Orders survive server restarts, unlike the in-memory trenches-store.

CREATE TABLE IF NOT EXISTS limit_orders (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('limit', 'stop_loss', 'take_profit')),
  mint            TEXT NOT NULL,
  chain           TEXT NOT NULL DEFAULT 'sol',
  symbol          TEXT NOT NULL DEFAULT '???',
  user_address    TEXT NOT NULL,
  target_price    NUMERIC NOT NULL,
  amount_sol      NUMERIC,
  amount_tokens   NUMERIC,
  slippage_bps    INTEGER NOT NULL DEFAULT 500,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'executed', 'failed', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_at    TIMESTAMPTZ,
  executed_at     TIMESTAMPTZ,
  tx_hash         TEXT,
  bundle_id       TEXT,
  error           TEXT
);

-- Indexes for order matching queries
CREATE INDEX IF NOT EXISTS idx_limit_orders_mint ON limit_orders(mint);
CREATE INDEX IF NOT EXISTS idx_limit_orders_status ON limit_orders(status);
CREATE INDEX IF NOT EXISTS idx_limit_orders_user ON limit_orders(user_address);
CREATE INDEX IF NOT EXISTS idx_limit_orders_mint_status ON limit_orders(mint, status);
CREATE INDEX IF NOT EXISTS idx_limit_orders_active ON limit_orders(mint, status, target_price) WHERE status = 'active';