-- 006_market_launches.sql
-- Market section tables: launchpads, tokens, trades, candles, ingestion_checkpoints, adapter_events_log.

CREATE TABLE IF NOT EXISTS launchpads (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  chain         TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'other',
  factory_ids   TEXT[] NOT NULL DEFAULT '{}',
  graduation_dex TEXT,
  event_sig     TEXT,
  ingestion_method TEXT NOT NULL DEFAULT 'solana_rpc',
  status        TEXT NOT NULL DEFAULT 'disabled',
  status_reason TEXT,
  last_event_at TIMESTAMPTZ,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
  chain_id      TEXT NOT NULL,
  address       TEXT NOT NULL,
  name          TEXT,
  symbol        TEXT,
  logo_url      TEXT,
  launchpad_id  TEXT REFERENCES launchpads(id),
  factory_id    TEXT,
  creator       TEXT,
  created_at_ts BIGINT,
  curve_state   JSONB,
  graduated_at  TIMESTAMPTZ,
  graduation_pool TEXT,
  market_state  TEXT DEFAULT 'unknown',
  price_usd     NUMERIC,
  market_cap    NUMERIC,
  liquidity     NUMERIC,
  volume_24h    NUMERIC,
  holders_est   INTEGER,
  bonding_pct   NUMERIC,
  website       TEXT,
  twitter       TEXT,
  telegram      TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS trades (
  id            BIGSERIAL PRIMARY KEY,
  chain_id      TEXT NOT NULL,
  token_address TEXT NOT NULL,
  pair          TEXT,
  source        TEXT,
  wallet        TEXT,
  side          TEXT NOT NULL,
  token_amount  NUMERIC,
  quote_amount  NUMERIC,
  usd_amount    NUMERIC,
  price_usd     NUMERIC,
  tx_sig        TEXT NOT NULL,
  slot_or_block BIGINT,
  block_time    TIMESTAMPTZ,
  launchpad_id  TEXT,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(chain_id, token_address, block_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_sig ON trades(tx_sig);

CREATE TABLE IF NOT EXISTS candles (
  chain_id      TEXT NOT NULL,
  token_address TEXT NOT NULL,
  interval      TEXT NOT NULL,
  open_time     TIMESTAMPTZ NOT NULL,
  open          NUMERIC,
  high          NUMERIC,
  low           NUMERIC,
  close         NUMERIC,
  volume        NUMERIC,
  trades        INTEGER DEFAULT 0,
  PRIMARY KEY (chain_id, token_address, interval, open_time)
);

CREATE TABLE IF NOT EXISTS token_logos (
  chain_id      TEXT NOT NULL,
  address       TEXT NOT NULL,
  cdn_url       TEXT,
  source        TEXT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, address)
);

CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
  adapter       TEXT PRIMARY KEY,
  chain         TEXT NOT NULL,
  last_slot     BIGINT,
  last_block    BIGINT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adapter_events_log (
  id            BIGSERIAL PRIMARY KEY,
  adapter       TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  token         TEXT,
  tx_sig        TEXT,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_time    TIMESTAMPTZ,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_adapter_events_adapter ON adapter_events_log(adapter, seen_at DESC);