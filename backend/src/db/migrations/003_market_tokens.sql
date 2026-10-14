-- Migration 003: Market Tokens — Durable token storage
-- The trenches-store is in-memory only. This table persists discovered
-- tokens across server restarts so the terminal is populated immediately.

CREATE TABLE IF NOT EXISTS market_tokens (
  mint            TEXT PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT 'Unknown',
  symbol          TEXT NOT NULL DEFAULT '???',
  image           TEXT DEFAULT '',
  chain           TEXT NOT NULL DEFAULT 'sol',
  launchpad       TEXT NOT NULL DEFAULT 'pumpfun',
  spot_price      NUMERIC DEFAULT 0,
  virtual_mcap    NUMERIC DEFAULT 0,
  price_change_24h NUMERIC DEFAULT 0,
  bonding_curve_progress NUMERIC DEFAULT 0,
  holders         INTEGER DEFAULT 0,
  volume_24h      NUMERIC DEFAULT 0,
  liquidity       NUMERIC DEFAULT 0,
  buys_24h        INTEGER DEFAULT 0,
  sells_24h       INTEGER DEFAULT 0,
  uri             TEXT DEFAULT '',
  twitter         TEXT DEFAULT '',
  telegram        TEXT DEFAULT '',
  website         TEXT DEFAULT '',
  dex_id          TEXT DEFAULT '',
  pair_address    TEXT DEFAULT '',
  tx_hash         TEXT DEFAULT '',
  source          TEXT DEFAULT 'bootstrap',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_market_tokens_chain ON market_tokens(chain);
CREATE INDEX IF NOT EXISTS idx_market_tokens_launchpad ON market_tokens(launchpad);
CREATE INDEX IF NOT EXISTS idx_market_tokens_chain_lp ON market_tokens(chain, launchpad);
CREATE INDEX IF NOT EXISTS idx_market_tokens_created ON market_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_tokens_updated ON market_tokens(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_tokens_mcap ON market_tokens(virtual_mcap DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_market_tokens_volume ON market_tokens(volume_24h DESC NULLS LAST);