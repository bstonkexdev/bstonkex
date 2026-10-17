-- Migration 007: Discovery Worker Tables
-- token_events: one row per detection from any source (PumpPortal WS, on-chain, EVM logs)
-- discovery_checkpoints: scanner resume position per source
-- market_tokens stays as one-row-per-token (upsert on mint)

-- ── Token Events ────────────────────────────────────────────
-- Every time a scanner detects a token creation, a row is inserted here.
-- UNIQUE(source, chain, token) prevents duplicate detections from the same source.
-- Coverage queries join on (chain, token) to compute overlap between sources.

CREATE TABLE IF NOT EXISTS token_events (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,           -- 'pumpportal' | 'onchain' | 'evm_logs'
  launchpad       TEXT NOT NULL,           -- 'pumpfun', 'raydium-launchlab', 'four-meme', etc.
  chain           TEXT NOT NULL DEFAULT 'solana',
  token           TEXT NOT NULL,           -- mint (Solana) or contract address (EVM, lowercase)
  tx_hash         TEXT NOT NULL DEFAULT '',
  event_time      TIMESTAMPTZ,            -- when the blockchain says the event happened
  seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- when our scanner saw it
  creator         TEXT DEFAULT '',
  name            TEXT DEFAULT '',
  symbol          TEXT DEFAULT '',
  metadata        JSONB DEFAULT '{}',     -- extra fields per source
  UNIQUE (source, chain, token)
);

CREATE INDEX IF NOT EXISTS idx_token_events_token ON token_events(chain, token);
CREATE INDEX IF NOT EXISTS idx_token_events_source ON token_events(source);
CREATE INDEX IF NOT EXISTS idx_token_events_seen ON token_events(seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_events_launchpad ON token_events(launchpad);

-- ── Discovery Checkpoints ───────────────────────────────────
-- Scanner resume positions. One row per scanner (e.g. 'solana:pumpfun', 'evm:four-meme').

CREATE TABLE IF NOT EXISTS discovery_checkpoints (
  scanner_id    TEXT PRIMARY KEY,
  last_slot     BIGINT DEFAULT 0,
  last_block    BIGINT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);