// Cupcak8 Swap Indexer — Canonical Types
// All types represent REAL blockchain data. No fakes, no mocks.

export type ChainId = 'bsc' | 'base' | 'solana' | 'robinhood';
export type EventType = 'SWAP' | 'MINT' | 'BURN' | 'POOL_CREATED' | 'TRANSFER' | 'UNKNOWN';
export type TradeSide = 'BUY' | 'SELL';
export type FinalityStatus = 'pending' | 'confirmed' | 'finalized';
export type DataSource = 'indexer' | 'dexscreener' | 'hybrid';

export interface MarketEvent {
  id: string;              // deterministic: chain:txHash:logIndex
  chain: ChainId;
  eventType: EventType;
  txHash: string;
  blockNumber: number | null;
  blockHash: string | null;
  slot: number | null;     // Solana only
  logIndex: number | null; // EVM only
  timestamp: number;
  marketId: string;        // chain:dex:poolAddress
  poolId: string;
  tokenIn: string;         // contract/mint address
  tokenOut: string;
  amountIn: string;        // raw string to preserve precision
  amountOut: string;
  price: number | null;    // derived USD price
  usdValue: number | null;
  wallet: string;
  dex: string;
  status: FinalityStatus;
}

export interface NormalizedTrade {
  id: string;              // deterministic: chain:txHash:logIndex
  chain: ChainId;
  marketId: string;
  poolId: string;
  timestamp: number;
  blockNumber: number | null;
  slot: number | null;
  txHash: string;
  wallet: string;
  side: TradeSide;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  price: number;           // price in quote token terms
  priceUsd: number | null;
  amountUsd: number | null;
  dex: string;
  status: FinalityStatus;
}

export interface LiquidityEvent {
  id: string;
  chain: ChainId;
  poolId: string;
  eventType: 'LIQUIDITY_ADDED' | 'LIQUIDITY_REMOVED' | 'POOL_CREATED' | 'POOL_UPDATED';
  txHash: string;
  blockNumber: number | null;
  slot: number | null;
  timestamp: number;
  token0: string;
  token1: string;
  amount0: string;
  amount1: string;
  liquidityUsd: number | null;
  wallet: string;
  dex: string;
}

export interface MarketIdentity {
  id: string;              // chain:dex:poolAddress
  chain: ChainId;
  dex: string;
  poolAddress: string;
  token0: TokenIdentity;
  token1: TokenIdentity;
  createdAt: number;
}

export interface TokenIdentity {
  chain: ChainId;
  address: string;         // contract/mint address
  symbol: string;
  decimals: number;
  name?: string;
}

export interface IndexerCheckpoint {
  chain: ChainId;
  latestSeenBlock: number;
  latestProcessedBlock: number;
  latestFinalizedBlock: number;
  processedSlot?: number;  // Solana
  confirmedSlot?: number;
  finalizedSlot?: number;
  updatedAt: number;
  status: 'LIVE' | 'CATCHING_UP' | 'STOPPED' | 'ERROR';
}

export interface Candle {
  id: string;              // market:interval:openTimestamp
  marketId: string;
  interval: CandleInterval;
  openTimestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  finalized: boolean;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface MarketStats {
  marketId: string;
  price: number | null;
  priceChange24h: number | null;
  volume24h: number;
  tradeCount24h: number;
  buyVolume24h: number;
  sellVolume24h: number;
  uniqueTraders24h: number;
  liquidityUsd: number | null;
  lastTradeAt: number | null;
  lastUpdated: number;
}

export interface ReorgInfo {
  chain: ChainId;
  detectedAtBlock: number;
  canonicalBlockHash: string;
  orphanedBlockHash: string;
  affectedEvents: string[];
}

export interface ReconciliationResult {
  marketId: string;
  timestamp: number;
  indexerPrice: number | null;
  dexscreenerPrice: number | null;
  priceDiff: number | null;
  indexerVolume24h: number | null;
  dexscreenerVolume24h: number | null;
  status: 'MATCH' | 'DIVERGENT' | 'INDEXER_AHEAD' | 'DEXSCREENER_AHEAD';
}
