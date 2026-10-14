-- Cupcak8 Swap — ClickHouse OHLCV Schema
-- Persistent trade storage + automatic candle aggregation via materialized views.
-- Replaces in-memory chart-engine.ts with real time-series database.

-- 1. Raw Swaps Table (all DEX trades from all chains)
CREATE TABLE IF NOT EXISTS trades (
    mint LowCardinality(String),
    chain LowCardinality(String),
    launchpad LowCardinality(String),
    price_usd Float64,
    volume_usd Float64,
    side Enum8('buy' = 1, 'sell' = 2),
    trader_address String,
    tx_hash String,
    trade_time DateTime64(3)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(trade_time)
ORDER BY (mint, chain, trade_time);

-- 2. 1-Minute OHLCV Aggregation Table (auto-populated by materialized view)
CREATE TABLE IF NOT EXISTS ohlc_1m (
    mint LowCardinality(String),
    chain LowCardinality(String),
    bucket DateTime,
    open AggregateFunction(argMin, Float64, DateTime64(3)),
    high AggregateFunction(max, Float64),
    low AggregateFunction(min, Float64),
    close AggregateFunction(argMax, Float64, DateTime64(3)),
    volume AggregateFunction(sum, Float64),
    buy_volume AggregateFunction(sumIf, Float64, UInt8),
    sell_volume AggregateFunction(sumIf, Float64, UInt8),
    trade_count AggregateFunction(count, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (mint, chain, bucket);

-- 3. Materialized View: Auto-populate 1m Candles on Raw Swaps Insert
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ohlc_1m TO ohlc_1m AS
SELECT
    mint,
    chain,
    toStartOfMinute(trade_time) AS bucket,
    argMinState(price_usd, trade_time) AS open,
    maxState(price_usd) AS high,
    minState(price_usd) AS low,
    argMaxState(price_usd, trade_time) AS close,
    sumState(volume_usd) AS volume,
    sumIfState(volume_usd, side = 'buy') AS buy_volume,
    sumIfState(volume_usd, side = 'sell') AS sell_volume,
    countState() AS trade_count
FROM trades
GROUP BY mint, chain, bucket;

-- 4. 5-Minute OHLCV Aggregation Table
CREATE TABLE IF NOT EXISTS ohlc_5m (
    mint LowCardinality(String),
    chain LowCardinality(String),
    bucket DateTime,
    open AggregateFunction(argMin, Float64, DateTime64(3)),
    high AggregateFunction(max, Float64),
    low AggregateFunction(min, Float64),
    close AggregateFunction(argMax, Float64, DateTime64(3)),
    volume AggregateFunction(sum, Float64),
    buy_volume AggregateFunction(sumIf, Float64, UInt8),
    sell_volume AggregateFunction(sumIf, Float64, UInt8),
    trade_count AggregateFunction(count, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (mint, chain, bucket);

-- 5. Materialized View: Auto-populate 5m Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ohlc_5m TO ohlc_5m AS
SELECT
    mint,
    chain,
    toStartOfFiveMinutes(trade_time) AS bucket,
    argMinState(price_usd, trade_time) AS open,
    maxState(price_usd) AS high,
    minState(price_usd) AS low,
    argMaxState(price_usd, trade_time) AS close,
    sumState(volume_usd) AS volume,
    sumIfState(volume_usd, side = 'buy') AS buy_volume,
    sumIfState(volume_usd, side = 'sell') AS sell_volume,
    countState() AS trade_count
FROM trades
GROUP BY mint, chain, bucket;

-- 6. 15-Minute OHLCV Aggregation Table
CREATE TABLE IF NOT EXISTS ohlc_15m (
    mint LowCardinality(String),
    chain LowCardinality(String),
    bucket DateTime,
    open AggregateFunction(argMin, Float64, DateTime64(3)),
    high AggregateFunction(max, Float64),
    low AggregateFunction(min, Float64),
    close AggregateFunction(argMax, Float64, DateTime64(3)),
    volume AggregateFunction(sum, Float64),
    buy_volume AggregateFunction(sumIf, Float64, UInt8),
    sell_volume AggregateFunction(sumIf, Float64, UInt8),
    trade_count AggregateFunction(count, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (mint, chain, bucket);

-- 7. Materialized View: Auto-populate 15m Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ohlc_15m TO ohlc_15m AS
SELECT
    mint,
    chain,
    toStartOfFifteenMinutes(trade_time) AS bucket,
    argMinState(price_usd, trade_time) AS open,
    maxState(price_usd) AS high,
    minState(price_usd) AS low,
    argMaxState(price_usd, trade_time) AS close,
    sumState(volume_usd) AS volume,
    sumIfState(volume_usd, side = 'buy') AS buy_volume,
    sumIfState(volume_usd, side = 'sell') AS sell_volume,
    countState() AS trade_count
FROM trades
GROUP BY mint, chain, bucket;

-- 8. 1-Hour OHLCV Aggregation Table
CREATE TABLE IF NOT EXISTS ohlc_1h (
    mint LowCardinality(String),
    chain LowCardinality(String),
    bucket DateTime,
    open AggregateFunction(argMin, Float64, DateTime64(3)),
    high AggregateFunction(max, Float64),
    low AggregateFunction(min, Float64),
    close AggregateFunction(argMax, Float64, DateTime64(3)),
    volume AggregateFunction(sum, Float64),
    buy_volume AggregateFunction(sumIf, Float64, UInt8),
    sell_volume AggregateFunction(sumIf, Float64, UInt8),
    trade_count AggregateFunction(count, UInt64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (mint, chain, bucket);

-- 9. Materialized View: Auto-populate 1h Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ohlc_1h TO ohlc_1h AS
SELECT
    mint,
    chain,
    toStartOfHour(trade_time) AS bucket,
    argMinState(price_usd, trade_time) AS open,
    maxState(price_usd) AS high,
    minState(price_usd) AS low,
    argMaxState(price_usd, trade_time) AS close,
    sumState(volume_usd) AS volume,
    sumIfState(volume_usd, side = 'buy') AS buy_volume,
    sumIfState(volume_usd, side = 'sell') AS sell_volume,
    countState() AS trade_count
FROM trades
GROUP BY mint, chain, bucket;

-- Query examples:
-- Get 1m candles for a token:
--   SELECT mint, bucket, argMinMerge(open), maxMerge(high), minMerge(low),
--          argMaxMerge(close), sumMerge(volume), countMerge(trade_count)
--   FROM ohlc_1m WHERE mint = '...' AND bucket > now() - INTERVAL 1 DAY
--   GROUP BY mint, bucket ORDER BY bucket;

-- Get latest price for a token:
--   SELECT price_usd FROM trades WHERE mint = '...' ORDER BY trade_time DESC LIMIT 1;

-- Get top tokens by volume:
--   SELECT mint, sum(volume_usd) as vol FROM trades
--   WHERE trade_time > now() - INTERVAL 1 HOUR
--   GROUP BY mint ORDER BY vol DESC LIMIT 50;