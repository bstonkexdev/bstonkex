// Cupcak8 Swap Indexer — Feature Flags
// Controls whether DexScreener, Indexer, or Hybrid is the canonical data source.

export type MarketDataSource = 'dexscreener' | 'indexer' | 'hybrid';

interface FeatureFlags {
  marketDataSource: MarketDataSource;
  indexerEnabled: boolean;
  reconciliationEnabled: boolean;
  candleEngineEnabled: boolean;
  solanaIndexingEnabled: boolean;
  robinhoodIndexingEnabled: boolean;
  maxBlocksPerBatch: number;
  indexerPollIntervalMs: number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  marketDataSource: 'hybrid',      // hybrid: indexer + DexScreener fallback
  indexerEnabled: true,            // direct blockchain indexing active
  reconciliationEnabled: true,
  candleEngineEnabled: true,
  solanaIndexingEnabled: false,    // Solana deferred — public RPC blocks browser requests
  robinhoodIndexingEnabled: true,  // enabled — uses env-driven RPC
  maxBlocksPerBatch: 2,
  indexerPollIntervalMs: 30000,    // 30s — respect public RPC rate limits
};

let _flags: FeatureFlags = { ...DEFAULT_FLAGS };

export function getFlags(): FeatureFlags {
  return { ..._flags };
}

export function setMarketDataSource(source: MarketDataSource): void {
  _flags.marketDataSource = source;
  _flags.indexerEnabled = source === 'indexer' || source === 'hybrid';
}

export function setFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  _flags[key] = value;
}

export function isIndexerSource(): boolean {
  return _flags.marketDataSource === 'indexer' || _flags.marketDataSource === 'hybrid';
}

export function isDexScreenerSource(): boolean {
  return _flags.marketDataSource === 'dexscreener' || _flags.marketDataSource === 'hybrid';
}
